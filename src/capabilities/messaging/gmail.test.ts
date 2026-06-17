import { describe, expect, it, vi } from 'vitest';
import {
  createGmailAuthTool,
  createGmailSearchTool,
  createGmailReadTool,
  createGmailSendTool,
  createGmailModifyTool,
} from './gmail.js';

// Prevent a real ~/.tota/gmail-token.json from interfering with the
// "no saved token" path. Other existsSync calls keep the real implementation.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      if (typeof path === 'string' && path.includes('gmail-token')) return false;
      return actual.existsSync(path);
    }),
  };
});

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

const noCredentials = () => ({});
const withCredentials = () => ({
  gmail: { clientId: 'test-id.apps.googleusercontent.com', clientSecret: 'secret' },
});

describe('gmail_auth tool', () => {
  it('returns setup instructions when credentials are missing', async () => {
    const result = await execute(createGmailAuthTool(noCredentials), { code: 'abc' });
    expect(result).toMatch(/not configured|GOOGLE_GMAIL_CLIENT_ID/i);
  });
  it('has an OAuth/authorization description', () => {
    expect((createGmailAuthTool(noCredentials) as any).description).toMatch(/oauth|auth|gmail/i);
  });
});

describe('gmail_send tool', () => {
  it('returns auth instructions when not configured', async () => {
    const result = await execute(createGmailSendTool(noCredentials), {
      to: 'a@b.com', subject: 'hi', body: 'hello',
    });
    expect(result).toMatch(/not configured|authorization required|client_id|GOOGLE_GMAIL/i);
  });
  it('triggers auth flow with a URL when token is missing', async () => {
    const result = await execute(createGmailSendTool(withCredentials), {
      to: 'a@b.com', subject: 'hi', body: 'hello',
    });
    expect(result).toMatch(/auth|url|browser|configure/i);
  });
  it('describes sending email', () => {
    expect((createGmailSendTool(noCredentials) as any).description).toMatch(/send|email|gmail/i);
  });
});

describe('gmail_search tool', () => {
  it('returns auth instructions when not configured', async () => {
    const result = await execute(createGmailSearchTool(noCredentials), { query: 'is:unread' });
    expect(result).toMatch(/not configured|authorization required|client_id|GOOGLE_GMAIL/i);
  });
  it('describes searching', () => {
    expect((createGmailSearchTool(noCredentials) as any).description).toMatch(/search|gmail|message/i);
  });
});

describe('gmail_read tool', () => {
  it('returns auth instructions when not configured', async () => {
    const result = await execute(createGmailReadTool(noCredentials), { message_id: 'x' });
    expect(result).toMatch(/not configured|authorization required|client_id|GOOGLE_GMAIL/i);
  });
});

describe('gmail_modify tool', () => {
  it('returns auth instructions when not configured', async () => {
    const result = await execute(createGmailModifyTool(noCredentials), { message_id: 'x', action: 'mark_read' });
    expect(result).toMatch(/not configured|authorization required|client_id|GOOGLE_GMAIL/i);
  });
});
