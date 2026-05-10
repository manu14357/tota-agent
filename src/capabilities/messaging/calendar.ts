import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import http from 'node:http';
import { exec } from 'node:child_process';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { logger } from '../../utils/logger.js';

const TOKEN_PATH = join(homedir(), '.tota', 'calendar-token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// Use a local redirect so Google's consent screen doesn't show the
// deprecated OOB "not safe / not supported" warning (blocked since Oct 2022).
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

// ── OAuth2 helpers ───────────────────────────────────────────────────────────
function getOAuth2Client(getConfig: () => any): OAuth2Client | null {
  const config = getConfig();
  const clientId = config?.calendar?.clientId || process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  const clientSecret = config?.calendar?.clientSecret || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  // REDIRECT_URI must match one of the "Authorized redirect URIs" in your
  // Google Cloud Console → APIs & Services → Credentials → OAuth Client ID.
  // Add http://localhost:8765/oauth2callback there if you haven't already.
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

function loadTokens(oAuth2Client: OAuth2Client): boolean {
  if (!existsSync(TOKEN_PATH)) return false;
  try {
    const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(tokens);
    return true;
  } catch {
    return false;
  }
}

function saveTokens(oAuth2Client: OAuth2Client): void {
  mkdirSync(join(homedir(), '.tota'), { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(oAuth2Client.credentials, null, 2), { mode: 0o600 });
}

// ── Browser-based OAuth flow ─────────────────────────────────────────────────

/** Open the default system browser cross-platform. */
function openBrowser(url: string): void {
  const escaped = url.replace(/"/g, '\\"');
  const cmd =
    process.platform === 'darwin' ? `open "${escaped}"`
    : process.platform === 'win32' ? `start "" "${escaped}"`
    : `xdg-open "${escaped}"`;
  exec(cmd, (err) => {
    if (err) logger.warn({ err }, 'Could not auto-open browser — open the URL manually if needed');
  });
}

/**
 * Spin up a one-shot local HTTP server that waits for Google to redirect
 * back to http://localhost:8765/oauth2callback?code=... after the user
 * grants access.  Resolves with the auth code or rejects on error/timeout.
 */
function waitForOAuthCallback(timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const page = (title: string, body: string) =>
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#333}` +
      `h2{color:#1a73e8}p{font-size:1.1em}</style></head>` +
      `<body><h2>${title}</h2><p>${body}</p></body></html>`;

    const server = http.createServer((req, res) => {
      try {
        const url  = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);
        const code  = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(page('Authorization Denied', 'You denied access. Close this tab and try again.'));
          server.close();
          reject(new Error(`OAuth denied: ${error}`));
          return;
        }
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(page(
            '✅ Google Calendar Authorized!',
            'Authorization complete — you can close this tab and return to tota.',
          ));
          server.close();
          resolve(code);
          return;
        }
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code parameter');
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error');
        reject(err);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${REDIRECT_PORT} is already in use. Close whatever is running on that port and try again, ` +
          `or use the calendar_auth tool to paste the code manually.`,
        ));
      } else {
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, '127.0.0.1');

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('timeout'));
    }, timeoutMs);

    // Clear the timer as soon as the server closes to avoid keeping the
    // process alive unnecessarily.
    server.on('close', () => clearTimeout(timer));
  });
}

/**
 * Singleton in-flight auth flow. Prevents two concurrent calendar tool calls
 * (e.g. list_events + create_event) from racing each other for port 8765.
 */
let _authFlowInProgress: Promise<void> | null = null;

/**
 * Full automatic auth: opens the system browser → waits for Google's redirect
 * callback → exchanges the code → saves the token to disk.
 * On success the token is set on `oAuth2Client` so the caller can use it
 * immediately.  Rejects with a human-readable Error on failure.
 */
function runAuthFlow(oAuth2Client: OAuth2Client): Promise<void> {
  if (_authFlowInProgress) return _authFlowInProgress;

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  openBrowser(authUrl);
  logger.info({ port: REDIRECT_PORT }, 'Opened browser for Google Calendar authorization — waiting for callback…');

  _authFlowInProgress = waitForOAuthCallback(120_000)
    .then(async (code) => {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      saveTokens(oAuth2Client);
      logger.info('Google Calendar authorized via browser flow');
    })
    .catch((err: Error) => {
      const fallbackMsg =
        err.message === 'timeout'
          ? `Google Calendar authorization timed out (2 minutes). Please try again.\n\nIf the browser didn't open automatically, go to:\n${authUrl}`
          : `Google Calendar authorization failed: ${err.message}\n\nIf the browser didn't open automatically, go to:\n${authUrl}`;
      throw new Error(fallbackMsg);
    })
    .finally(() => { _authFlowInProgress = null; });

  return _authFlowInProgress;
}

async function getAuthorizedClient(getConfig: () => any): Promise<OAuth2Client | { error: string }> {
  const oAuth2Client = getOAuth2Client(getConfig);
  if (!oAuth2Client) {
    return { error: 'Google Calendar is not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in ~/.tota/.env, then try again.' };
  }

  if (!loadTokens(oAuth2Client)) {
    // No saved token — run the automatic browser auth flow and wait for the
    // user to approve access.  The browser opens automatically; the user just
    // needs to click "Allow" in the Google consent screen.
    try {
      await runAuthFlow(oAuth2Client);
    } catch (err: any) {
      return { error: err.message };
    }
    // Tokens are now set on oAuth2Client — fall through to the expiry check.
  }

  // Auto-refresh expired tokens
  try {
    const tokenInfo = oAuth2Client.credentials;
    if (tokenInfo.expiry_date && Date.now() > tokenInfo.expiry_date - 60000) {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(credentials);
      saveTokens(oAuth2Client);
    }
  } catch {
    // If refresh fails, try with existing token anyway
  }
  return oAuth2Client;
}

// ── Tool factories ───────────────────────────────────────────────────────────

export function createCalendarAuthTool(getConfig: () => any) {
  return tool({
    description:
      'Manually complete Google Calendar OAuth2 authorization using an auth code. ' +
      'This is only needed in headless / daemon environments where the browser cannot open automatically ' +
      '(e.g., a remote server). In normal use the browser opens automatically — just click Allow and come back. ' +
      'To get the code manually: visit the Google consent URL, approve access, then copy the `code` query parameter ' +
      'from the redirect URL (http://localhost:8765/oauth2callback?code=<THIS_PART>&...).',
    inputSchema: zodSchema(z.object({
      code: z.string().describe('Authorization code from the Google OAuth2 consent page redirect URL'),
    })),
    execute: async ({ code }) => {
      try {
        const oAuth2Client = getOAuth2Client(getConfig);
        if (!oAuth2Client) return 'Google Calendar credentials not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in ~/.tota/.env';
        const { tokens } = await oAuth2Client.getToken(code.trim());
        oAuth2Client.setCredentials(tokens);
        saveTokens(oAuth2Client);
        logger.info('Google Calendar authorized');
        return 'Google Calendar authorized successfully! Token saved to ~/.tota/calendar-token.json. You can now use list_events, create_event, check_availability, and delete_event.';
      } catch (err: any) {
        return `Error authorizing Google Calendar: ${err.message}`;
      }
    },
  });
}

export function createListEventsTool(getConfig: () => any) {
  return tool({
    description: 'List upcoming Google Calendar events. Returns events sorted by start time.',
    inputSchema: zodSchema(z.object({
      calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
      from: z.string().optional().describe('Start time ISO 8601 (default: now)'),
      to: z.string().optional().describe('End time ISO 8601 (default: 7 days from now)'),
      max_results: z.number().optional().describe('Maximum number of events to return (default: 10)'),
    })),
    execute: async ({ calendar_id, from, to, max_results }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;

      try {
        const calendar = google.calendar({ version: 'v3', auth });
        const now = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 7);

        const response = await calendar.events.list({
          calendarId: calendar_id ?? 'primary',
          timeMin: from ?? now.toISOString(),
          timeMax: to ?? end.toISOString(),
          maxResults: max_results ?? 10,
          singleEvents: true,
          orderBy: 'startTime',
        });

        const events = response.data.items ?? [];
        if (events.length === 0) return 'No events found in the specified time range.';

        const lines = events.map(event => {
          const start = event.start?.dateTime ?? event.start?.date ?? 'Unknown';
          const end = event.end?.dateTime ?? event.end?.date ?? 'Unknown';
          const attendees = event.attendees?.map(a => a.email).join(', ') ?? '';
          return [
            `• ${event.summary ?? '(no title)'}`,
            `  ID: ${event.id}`,
            `  Start: ${start}`,
            `  End: ${end}`,
            attendees ? `  Attendees: ${attendees}` : '',
            event.description ? `  Description: ${event.description.slice(0, 100)}` : '',
          ].filter(Boolean).join('\n');
        });

        return `Google Calendar events (${events.length}):\n\n${lines.join('\n\n')}`;
      } catch (err: any) {
        return `Error listing events: ${err.message}`;
      }
    },
  });
}

export function createCreateEventTool(getConfig: () => any) {
  return tool({
    description: 'Create a new event on Google Calendar.',
    inputSchema: zodSchema(z.object({
      title: z.string().describe('Event title/summary'),
      start: z.string().describe('Start time in ISO 8601 format (e.g. "2025-01-15T14:00:00+05:30")'),
      end: z.string().describe('End time in ISO 8601 format'),
      description: z.string().optional().describe('Event description/notes'),
      attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
      location: z.string().optional().describe('Event location'),
      calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    })),
    execute: async ({ title, start, end, description, attendees, location, calendar_id }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;

      try {
        const calendar = google.calendar({ version: 'v3', auth });

        const event: any = {
          summary: title,
          start: { dateTime: start },
          end: { dateTime: end },
        };
        if (description) event.description = description;
        if (location) event.location = location;
        if (attendees?.length) {
          event.attendees = attendees.map(email => ({ email }));
          event.sendUpdates = 'all';
        }

        const response = await calendar.events.insert({
          calendarId: calendar_id ?? 'primary',
          requestBody: event,
        });

        logger.info({ eventId: response.data.id, title }, 'Calendar event created');
        return `Event created: "${title}"\nID: ${response.data.id}\nStart: ${start}\nEnd: ${end}\nLink: ${response.data.htmlLink ?? 'N/A'}`;
      } catch (err: any) {
        return `Error creating event: ${err.message}`;
      }
    },
  });
}

export function createCheckAvailabilityTool(getConfig: () => any) {
  return tool({
    description: 'Check free/busy availability for one or more Google Calendar users in a time range.',
    inputSchema: zodSchema(z.object({
      emails: z.array(z.string()).describe('List of email addresses to check availability for'),
      from: z.string().describe('Start time ISO 8601'),
      to: z.string().describe('End time ISO 8601'),
    })),
    execute: async ({ emails, from, to }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;

      try {
        const calendar = google.calendar({ version: 'v3', auth });
        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin: from,
            timeMax: to,
            items: emails.map(email => ({ id: email })),
          },
        });

        const calendars = response.data.calendars ?? {};
        const lines = emails.map(email => {
          const cal = calendars[email];
          if (!cal) return `• ${email}: data unavailable`;
          if (cal.errors?.length) return `• ${email}: error — ${cal.errors[0].reason}`;
          const busy = cal.busy ?? [];
          if (busy.length === 0) return `• ${email}: FREE for the entire period`;
          const slots = busy.map(b => `  Busy: ${b.start} → ${b.end}`).join('\n');
          return `• ${email}: BUSY during:\n${slots}`;
        });

        return `Availability check from ${from} to ${to}:\n\n${lines.join('\n\n')}`;
      } catch (err: any) {
        return `Error checking availability: ${err.message}`;
      }
    },
  });
}

export function createDeleteEventTool(getConfig: () => any) {
  return tool({
    description: 'Delete an event from Google Calendar by event ID.',
    inputSchema: zodSchema(z.object({
      event_id: z.string().describe('Event ID to delete (get from list_events)'),
      calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    })),
    execute: async ({ event_id, calendar_id }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;

      try {
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.events.delete({
          calendarId: calendar_id ?? 'primary',
          eventId: event_id,
          sendUpdates: 'all',
        });
        logger.info({ eventId: event_id }, 'Calendar event deleted');
        return `Event "${event_id}" deleted successfully. Attendees have been notified.`;
      } catch (err: any) {
        return `Error deleting event: ${err.message}`;
      }
    },
  });
}
