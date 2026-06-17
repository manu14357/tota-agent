// Shared Google OAuth2 / service-account helper.
//
// Generalizes the browser-redirect OAuth flow that used to live inline in
// calendar.ts so multiple Google services (Calendar, Gmail, …) can reuse it,
// and adds first-class support for Google Workspace / company accounts:
//   • `hd` (hosted-domain) + `login_hint` to steer the consent screen to a
//     company domain (e.g. tota.com) instead of a personal @gmail.com.
//   • Service-account + domain-wide delegation (impersonate a Workspace user)
//     for fully headless, admin-blessed access — no interactive consent.
//   • Human-readable diagnostics for the errors Workspace users actually hit
//     (app in "Testing", "External" unverified, admin third-party block).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import http from 'node:http';
import { exec } from 'node:child_process';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { logger } from '../../utils/logger.js';

const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

export interface GoogleServiceSpec {
  /** Short id: used for the token filename and user-facing messages. */
  service: string;
  /** Pretty name, e.g. "Google Calendar". */
  label: string;
  scopes: string[];
  /** The service-specific env var names, e.g. GOOGLE_CALENDAR_CLIENT_ID. */
  envClientId: string;
  envClientSecret: string;
  /** Pull service-specific credentials out of the tota config, if present. */
  configClientId?: (config: any) => string | undefined;
  configClientSecret?: (config: any) => string | undefined;
}

export interface WorkspaceOptions {
  hostedDomain?: string;        // hd= param (restrict to a Workspace domain)
  loginHint?: string;           // login_hint= param (pre-fill the account)
  serviceAccountKeyPath?: string;
  impersonateSubject?: string;  // user to impersonate via domain-wide delegation
}

function tokenPath(service: string): string {
  return join(homedir(), '.tota', `${service}-token.json`);
}

/** Resolve client id/secret: service config → shared google config → service env → shared env. */
export function resolveCredentials(
  spec: GoogleServiceSpec,
  config: any,
): { clientId: string; clientSecret: string } | null {
  const clientId =
    spec.configClientId?.(config) ||
    config?.google?.clientId ||
    process.env[spec.envClientId] ||
    process.env.GOOGLE_CLIENT_ID ||
    '';
  const clientSecret =
    spec.configClientSecret?.(config) ||
    config?.google?.clientSecret ||
    process.env[spec.envClientSecret] ||
    process.env.GOOGLE_CLIENT_SECRET ||
    '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function resolveWorkspaceOptions(config: any): WorkspaceOptions {
  return {
    hostedDomain: config?.google?.hostedDomain || process.env.GOOGLE_HOSTED_DOMAIN || undefined,
    loginHint: config?.google?.loginHint || process.env.GOOGLE_LOGIN_HINT || undefined,
    serviceAccountKeyPath: config?.google?.serviceAccountKeyPath || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || undefined,
    impersonateSubject: config?.google?.impersonateSubject || process.env.GOOGLE_IMPERSONATE_SUBJECT || undefined,
  };
}

/** Turn an opaque Google auth error into actionable, Workspace-aware guidance. */
export function explainGoogleAuthError(err: unknown, label: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const tips: string[] = [];
  if (lower.includes('access_denied') || lower.includes('org_internal') || lower.includes('admin_policy')) {
    tips.push(
      'This usually means your Google Workspace blocks the app. Fixes:',
      '  • In Google Cloud Console → OAuth consent screen, set "User type" to Internal (for your domain) OR publish the app (Testing → In production).',
      '  • If "Testing", add your company address as a Test user.',
      '  • A Workspace admin may need to allow this app under Admin console → Security → API controls.',
    );
  } else if (lower.includes('invalid_grant') || lower.includes('token has been expired') || lower.includes('revoked')) {
    tips.push('Your saved token expired or was revoked. Re-run authorization to grant access again.');
  } else if (lower.includes('redirect_uri_mismatch')) {
    tips.push(`Add ${REDIRECT_URI} to "Authorized redirect URIs" on your OAuth Client ID in Google Cloud Console.`);
  }
  const base = `${label} authorization failed: ${msg}`;
  return tips.length ? `${base}\n\n${tips.join('\n')}` : base;
}

function loadTokens(client: OAuth2Client, service: string): boolean {
  const path = tokenPath(service);
  if (!existsSync(path)) return false;
  try {
    client.setCredentials(JSON.parse(readFileSync(path, 'utf8')));
    return true;
  } catch {
    return false;
  }
}

function saveTokens(client: OAuth2Client, service: string): void {
  mkdirSync(join(homedir(), '.tota'), { recursive: true });
  writeFileSync(tokenPath(service), JSON.stringify(client.credentials, null, 2), { mode: 0o600 });
}

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

function waitForOAuthCallback(label: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const page = (title: string, body: string) =>
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#333}` +
      `h2{color:#1a73e8}p{font-size:1.1em}</style></head>` +
      `<body><h2>${title}</h2><p>${body}</p></body></html>`;

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(page('Authorization Denied', 'You denied access. Close this tab and try again.'));
          server.close();
          reject(new Error(`access_denied: ${error}`));
          return;
        }
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(page(`✅ ${label} Authorized!`, 'Authorization complete — you can close this tab and return to tota.'));
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
        reject(new Error(`Port ${REDIRECT_PORT} is already in use. Close whatever is using it and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, '127.0.0.1');
    const timer = setTimeout(() => { server.close(); reject(new Error('timeout')); }, timeoutMs);
    server.on('close', () => clearTimeout(timer));
  });
}

/** One in-flight browser auth per service to avoid two tool calls racing for port 8765. */
const inFlight = new Map<string, Promise<void>>();

export function buildAuthUrl(client: OAuth2Client, spec: GoogleServiceSpec, ws: WorkspaceOptions): string {
  const params: Record<string, unknown> = {
    access_type: 'offline',
    scope: spec.scopes,
    prompt: 'consent',
  };
  if (ws.hostedDomain) params.hd = ws.hostedDomain;
  if (ws.loginHint) params.login_hint = ws.loginHint;
  return client.generateAuthUrl(params as any);
}

function runAuthFlow(client: OAuth2Client, spec: GoogleServiceSpec, ws: WorkspaceOptions): Promise<void> {
  const existing = inFlight.get(spec.service);
  if (existing) return existing;

  const authUrl = buildAuthUrl(client, spec, ws);

  if (process.env.VITEST) {
    return Promise.reject(new Error(
      `Authorization required. Open this URL in a browser to authorize ${spec.label}:\n${authUrl}`,
    ));
  }

  openBrowser(authUrl);
  logger.info({ service: spec.service, port: REDIRECT_PORT }, `Opened browser for ${spec.label} authorization — waiting for callback…`);

  const flow = waitForOAuthCallback(spec.label, 120_000)
    .then(async (code) => {
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);
      saveTokens(client, spec.service);
      logger.info({ service: spec.service }, `${spec.label} authorized via browser flow`);
    })
    .catch((err: Error) => {
      if (err.message === 'timeout') {
        throw new Error(`${spec.label} authorization timed out (2 minutes). If the browser didn't open, go to:\n${authUrl}`);
      }
      throw new Error(`${explainGoogleAuthError(err, spec.label)}\n\nIf the browser didn't open, go to:\n${authUrl}`);
    })
    .finally(() => { inFlight.delete(spec.service); });

  inFlight.set(spec.service, flow);
  return flow;
}

/**
 * Return an authorized auth client for a Google service, or `{ error }` with
 * actionable setup/auth guidance. Prefers service-account domain-wide
 * delegation when configured (headless), otherwise the browser OAuth flow.
 */
export async function getAuthorizedClient(
  spec: GoogleServiceSpec,
  getConfig: () => any,
): Promise<OAuth2Client | { error: string }> {
  const config = getConfig();
  const ws = resolveWorkspaceOptions(config);

  // ── Service-account / domain-wide delegation (Workspace, headless) ──────
  if (ws.serviceAccountKeyPath && ws.impersonateSubject) {
    try {
      if (!existsSync(ws.serviceAccountKeyPath)) {
        return { error: `Service-account key not found at ${ws.serviceAccountKeyPath}.` };
      }
      const key = JSON.parse(readFileSync(ws.serviceAccountKeyPath, 'utf8'));
      const jwt = new google.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: spec.scopes,
        subject: ws.impersonateSubject, // the Workspace user to act as
      });
      await jwt.authorize();
      return jwt as unknown as OAuth2Client;
    } catch (err) {
      return {
        error:
          `${explainGoogleAuthError(err, spec.label)}\n\n` +
          'For domain-wide delegation, a Workspace admin must grant the service-account client ID these scopes ' +
          `under Admin console → Security → API controls → Domain-wide delegation:\n  ${spec.scopes.join('\n  ')}`,
      };
    }
  }

  // ── Interactive OAuth (personal or Workspace via consent) ──────────────
  const creds = resolveCredentials(spec, config);
  if (!creds) {
    return {
      error:
        `${spec.label} is not configured. Set ${spec.envClientId} and ${spec.envClientSecret} ` +
        `(or the shared GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) in ~/.tota/.env, then try again. ` +
        `Run \`tota setup ${spec.service}\` for guided setup.`,
    };
  }

  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);

  if (!loadTokens(client, spec.service)) {
    try {
      await runAuthFlow(client, spec, ws);
    } catch (err: any) {
      return { error: err.message };
    }
  }

  // Auto-refresh near expiry.
  try {
    const t = client.credentials;
    if (t.expiry_date && Date.now() > t.expiry_date - 60_000) {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      saveTokens(client, spec.service);
    }
  } catch {
    /* fall through and try the existing token */
  }
  return client;
}

/** Manually exchange an auth code (headless fallback). */
export async function exchangeAuthCode(
  spec: GoogleServiceSpec,
  getConfig: () => any,
  code: string,
): Promise<string> {
  const creds = resolveCredentials(spec, getConfig());
  if (!creds) {
    return `${spec.label} credentials not configured. Set ${spec.envClientId} and ${spec.envClientSecret} in ~/.tota/.env.`;
  }
  try {
    const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);
    const { tokens } = await client.getToken(code.trim());
    client.setCredentials(tokens);
    saveTokens(client, spec.service);
    return `${spec.label} authorized successfully! Token saved to ${tokenPath(spec.service)}.`;
  } catch (err) {
    return explainGoogleAuthError(err, spec.label);
  }
}
