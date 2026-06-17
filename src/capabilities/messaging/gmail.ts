import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { google } from 'googleapis';
import { logger } from '../../utils/logger.js';
import {
  getAuthorizedClient as getGoogleClient,
  exchangeAuthCode,
  type GoogleServiceSpec,
} from './google-auth.js';

// Gmail service definition. `gmail.modify` covers read/search/label changes;
// `gmail.send` covers sending. Credentials resolve from config.gmail.*, the
// GOOGLE_GMAIL_* env vars, or the shared google.* / GOOGLE_CLIENT_* fallbacks.
// Token → ~/.tota/gmail-token.json.
const GMAIL_SPEC: GoogleServiceSpec = {
  service: 'gmail',
  label: 'Gmail',
  scopes: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  envClientId: 'GOOGLE_GMAIL_CLIENT_ID',
  envClientSecret: 'GOOGLE_GMAIL_CLIENT_SECRET',
  configClientId: (c) => c?.gmail?.clientId,
  configClientSecret: (c) => c?.gmail?.clientSecret,
};

function getAuthorizedClient(getConfig: () => any) {
  return getGoogleClient(GMAIL_SPEC, getConfig);
}

function header(payload: any, name: string): string {
  const h = (payload?.headers ?? []).find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

/** Recursively pull the best-effort plain-text body out of a Gmail payload. */
function extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64url').toString('utf8');
    if (payload.mimeType === 'text/html') return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return decoded;
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
  }
  for (const part of payload.parts ?? []) {
    const nested = extractBody(part);
    if (nested) return nested;
  }
  return '';
}

/** Build an RFC 2822 message and base64url-encode it for the Gmail API. */
function buildRawMessage(to: string, subject: string, body: string, cc?: string, bcc?: string): string {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].filter(Boolean);
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export function createGmailAuthTool(getConfig: () => any) {
  return tool({
    description:
      'Manually complete Gmail OAuth2 authorization with an auth code. Only needed in headless/daemon ' +
      'environments where the browser cannot open automatically. Normally the browser opens by itself — ' +
      'just click Allow. Get the code from the redirect URL (http://localhost:8765/oauth2callback?code=<THIS>).',
    inputSchema: zodSchema(z.object({
      code: z.string().describe('Authorization code from the Google OAuth2 consent redirect URL'),
    })),
    execute: async ({ code }) => {
      const result = await exchangeAuthCode(GMAIL_SPEC, getConfig, code);
      if (result.includes('authorized successfully')) logger.info('Gmail authorized');
      return result;
    },
  });
}

export function createGmailSearchTool(getConfig: () => any) {
  return tool({
    description:
      'Search Gmail messages. Supports Gmail search operators (e.g. "from:boss is:unread", ' +
      '"subject:invoice newer_than:7d", "has:attachment"). Returns subject, sender, date, and a snippet.',
    inputSchema: zodSchema(z.object({
      query: z.string().describe('Gmail search query, e.g. "is:unread from:alice@corp.com"'),
      max_results: z.number().optional().describe('Max messages to return (default 10, max 25)'),
    })),
    execute: async ({ query, max_results }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;
      try {
        const gmail = google.gmail({ version: 'v1', auth });
        const max = Math.min(max_results ?? 10, 25);
        const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: max });
        const msgs = list.data.messages ?? [];
        if (msgs.length === 0) return `No Gmail messages match: ${query}`;

        const rows = await Promise.all(msgs.map(async (m) => {
          const full = await gmail.users.messages.get({
            userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'],
          });
          const p = full.data.payload;
          return [
            `• ${header(p, 'Subject') || '(no subject)'}`,
            `  From: ${header(p, 'From')}`,
            `  Date: ${header(p, 'Date')}`,
            `  ID: ${m.id}`,
            full.data.snippet ? `  ${full.data.snippet.slice(0, 160)}` : '',
          ].filter(Boolean).join('\n');
        }));
        return `Gmail results for "${query}" (${rows.length}):\n\n${rows.join('\n\n')}`;
      } catch (err: any) {
        return `Error searching Gmail: ${err.message}`;
      }
    },
  });
}

export function createGmailReadTool(getConfig: () => any) {
  return tool({
    description: 'Read the full content of a single Gmail message by its ID (get IDs from gmail_search).',
    inputSchema: zodSchema(z.object({
      message_id: z.string().describe('The Gmail message ID'),
    })),
    execute: async ({ message_id }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;
      try {
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.get({ userId: 'me', id: message_id, format: 'full' });
        const p = res.data.payload;
        const body = extractBody(p).slice(0, 6000);
        return [
          `Subject: ${header(p, 'Subject')}`,
          `From: ${header(p, 'From')}`,
          `To: ${header(p, 'To')}`,
          `Date: ${header(p, 'Date')}`,
          '',
          body || '(no readable text body)',
        ].join('\n');
      } catch (err: any) {
        return `Error reading message: ${err.message}`;
      }
    },
  });
}

export function createGmailSendTool(getConfig: () => any) {
  return tool({
    description: 'Send an email from the authorized Gmail account. Use a clear subject and plain-text body.',
    inputSchema: zodSchema(z.object({
      to: z.string().describe('Recipient email address(es), comma-separated'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Plain-text email body'),
      cc: z.string().optional().describe('CC recipients, comma-separated'),
      bcc: z.string().optional().describe('BCC recipients, comma-separated'),
    })),
    execute: async ({ to, subject, body, cc, bcc }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;
      try {
        const gmail = google.gmail({ version: 'v1', auth });
        const raw = buildRawMessage(to, subject, body, cc, bcc);
        const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
        logger.info({ to, subject, id: res.data.id }, 'Gmail message sent');
        return `Email sent to ${to} — subject "${subject}" (id: ${res.data.id}).`;
      } catch (err: any) {
        return `Error sending email: ${err.message}`;
      }
    },
  });
}

export function createGmailModifyTool(getConfig: () => any) {
  return tool({
    description:
      'Modify a Gmail message: mark read/unread, archive, star, or trash. Useful for inbox triage.',
    inputSchema: zodSchema(z.object({
      message_id: z.string().describe('The Gmail message ID'),
      action: z.enum(['mark_read', 'mark_unread', 'archive', 'star', 'unstar', 'trash']).describe('What to do'),
    })),
    execute: async ({ message_id, action }) => {
      const auth = await getAuthorizedClient(getConfig);
      if ('error' in auth) return auth.error;
      try {
        const gmail = google.gmail({ version: 'v1', auth });
        if (action === 'trash') {
          await gmail.users.messages.trash({ userId: 'me', id: message_id });
          return `Message ${message_id} moved to Trash.`;
        }
        const mod: { addLabelIds?: string[]; removeLabelIds?: string[] } =
          action === 'mark_read' ? { removeLabelIds: ['UNREAD'] }
          : action === 'mark_unread' ? { addLabelIds: ['UNREAD'] }
          : action === 'archive' ? { removeLabelIds: ['INBOX'] }
          : action === 'star' ? { addLabelIds: ['STARRED'] }
          : { removeLabelIds: ['STARRED'] };
        await gmail.users.messages.modify({ userId: 'me', id: message_id, requestBody: mod });
        return `Message ${message_id}: ${action.replace('_', ' ')} done.`;
      } catch (err: any) {
        return `Error modifying message: ${err.message}`;
      }
    },
  });
}
