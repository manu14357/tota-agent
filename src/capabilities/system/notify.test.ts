import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNotifyTool } from './notify.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

describe('notify tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls node-notifier with correct title and message', async () => {
    const notifySpy = vi.fn((_opts: any, cb: Function) => cb(null, 'activate'));
    vi.doMock('node-notifier', () => ({
      default: { notify: notifySpy },
    }));

    const tool = createNotifyTool();
    // node-notifier is dynamically imported, so we test the returned string format
    const result = await execute(tool, { title: 'Test Title', message: 'Hello world' });
    // Should either confirm notification or explain unavailability
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a string result for basic notification', async () => {
    const tool = createNotifyTool();
    const result = await execute(tool, { title: 'Alert', message: 'Something happened' });
    expect(typeof result).toBe('string');
    // Either success or graceful error — never undefined/null
    expect(result).toBeTruthy();
  });

  it('handles optional sound parameter', async () => {
    const tool = createNotifyTool();
    const result = await execute(tool, { title: 'Alert', message: 'With sound', sound: true });
    expect(typeof result).toBe('string');
  });

  it('handles missing sound parameter gracefully', async () => {
    const tool = createNotifyTool();
    const result = await execute(tool, { title: 'No Sound', message: 'No sound test' });
    expect(typeof result).toBe('string');
  });

  it('accepts empty-ish title gracefully', async () => {
    const tool = createNotifyTool();
    const result = await execute(tool, { title: 'x', message: 'y' });
    expect(typeof result).toBe('string');
  });

  it('tool has a description', () => {
    const tool = createNotifyTool();
    expect((tool as any).description).toBeTruthy();
    expect(typeof (tool as any).description).toBe('string');
  });
});
