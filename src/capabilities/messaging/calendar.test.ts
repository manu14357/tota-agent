import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createCalendarAuthTool,
  createListEventsTool,
  createCreateEventTool,
  createCheckAvailabilityTool,
  createDeleteEventTool,
} from './calendar.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

const noCredentials = () => ({});
const withCredentials = (extra: Record<string, any> = {}) => () => ({
  calendar: {
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-client-secret',
    ...extra,
  },
});

describe('calendar_auth tool', () => {
  it('returns setup instructions when credentials are missing', async () => {
    const tool = createCalendarAuthTool(noCredentials);
    const result = await execute(tool, { code: 'some-auth-code' });
    expect(result).toMatch(/not configured|GOOGLE_CALENDAR_CLIENT_ID/i);
  });

  it('has a description mentioning OAuth2 or authorization', () => {
    const tool = createCalendarAuthTool(noCredentials);
    expect((tool as any).description).toMatch(/oauth|auth|calendar/i);
  });

  it('rejects empty code with a meaningful error', async () => {
    const tool = createCalendarAuthTool(withCredentials());
    // Google OAuth2 will fail with an empty code — tool should surface a clean error
    const result = await execute(tool, { code: '' });
    // Either rejects the code or surfaces a Google API error — not an unhandled exception
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('list_events tool', () => {
  it('returns auth instructions when not configured', async () => {
    const tool = createListEventsTool(noCredentials);
    const result = await execute(tool, {});
    expect(result).toMatch(/not configured|authorization required|client_id/i);
  });

  it('triggers auth flow and returns URL when token file is missing (no token.json)', async () => {
    // Provide credentials but no saved token — new behaviour: triggers browser
    // auth flow, which in the vitest environment immediately rejects with an
    // error message containing the auth URL (no real browser / server spawned).
    const tool = createListEventsTool(withCredentials());
    const result = await execute(tool, {});
    expect(result).toMatch(/auth|url|browser|configure/i);
  });

  it('has a description mentioning Calendar or events', () => {
    const tool = createListEventsTool(noCredentials);
    expect((tool as any).description).toMatch(/calendar|events/i);
  });
});

describe('create_event tool', () => {
  it('returns auth instructions when not configured', async () => {
    const tool = createCreateEventTool(noCredentials);
    const result = await execute(tool, {
      title: 'Team meeting',
      start: '2025-09-01T10:00:00Z',
      end: '2025-09-01T11:00:00Z',
    });
    expect(result).toMatch(/not configured|authorization required|client_id/i);
  });

  it('has correct description', () => {
    const tool = createCreateEventTool(noCredentials);
    expect((tool as any).description).toMatch(/create|event|calendar/i);
  });
});

describe('check_availability tool', () => {
  it('returns auth instructions when not configured', async () => {
    const tool = createCheckAvailabilityTool(noCredentials);
    const result = await execute(tool, {
      emails: ['user@example.com'],
      from: '2025-09-01T08:00:00Z',
      to: '2025-09-01T18:00:00Z',
    });
    expect(result).toMatch(/not configured|authorization required|client_id/i);
  });

  it('has correct description', () => {
    const tool = createCheckAvailabilityTool(noCredentials);
    expect((tool as any).description).toMatch(/availab|free|busy|calendar/i);
  });
});

describe('delete_event tool', () => {
  it('returns auth instructions when not configured', async () => {
    const tool = createDeleteEventTool(noCredentials);
    const result = await execute(tool, { event_id: 'some-event-id' });
    expect(result).toMatch(/not configured|authorization required|client_id/i);
  });

  it('has correct description', () => {
    const tool = createDeleteEventTool(noCredentials);
    expect((tool as any).description).toMatch(/delete|remove|event|calendar/i);
  });
});
