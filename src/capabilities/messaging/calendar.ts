import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { logger } from '../../utils/logger.js';

const TOKEN_PATH = join(homedir(), '.tota', 'calendar-token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// ── OAuth2 helpers ───────────────────────────────────────────────────────────
function getOAuth2Client(getConfig: () => any): OAuth2Client | null {
  const config = getConfig();
  const clientId = config?.calendar?.clientId || process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  const clientSecret = config?.calendar?.clientSecret || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
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

function getAuthInstructions(getConfig: () => any): string {
  const oAuth2Client = getOAuth2Client(getConfig);
  if (!oAuth2Client) {
    return 'Google Calendar is not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in ~/.tota/.env, then run this tool again.';
  }
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  return `Google Calendar authentication required:\n1. Open this URL in a browser:\n   ${authUrl}\n2. Sign in and grant access\n3. Copy the authorization code shown\n4. Use the calendar_auth tool with that code to complete setup`;
}

async function getAuthorizedClient(getConfig: () => any): Promise<OAuth2Client | { error: string }> {
  const oAuth2Client = getOAuth2Client(getConfig);
  if (!oAuth2Client) {
    return { error: getAuthInstructions(getConfig) };
  }
  if (!loadTokens(oAuth2Client)) {
    return { error: getAuthInstructions(getConfig) };
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
    description: 'Complete Google Calendar OAuth2 authorization using the code from the auth URL. Run this after visiting the URL shown by list_events or create_event when Calendar is not yet authorized.',
    inputSchema: zodSchema(z.object({
      code: z.string().describe('Authorization code from the Google OAuth2 consent page'),
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
