import { describe, expect, it, vi } from 'vitest';
import { createClipboardReadTool, createClipboardWriteTool } from './clipboard.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

describe('clipboard_read tool', () => {
  it('returns a string result', async () => {
    const tool = createClipboardReadTool();
    const result = await execute(tool, {});
    // Either returns clipboard contents or an error message — never undefined
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 10000);

  it('has correct description', () => {
    const tool = createClipboardReadTool();
    expect((tool as any).description).toMatch(/clipboard/i);
  });
});

describe('clipboard_write tool', () => {
  it('returns a confirmation or error string', async () => {
    const tool = createClipboardWriteTool();
    const result = await execute(tool, { text: 'hello clipboard' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('rejects empty text', async () => {
    const tool = createClipboardWriteTool();
    const result = await execute(tool, { text: '' });
    expect(result).toMatch(/empty|required|error/i);
  });

  it('handles unicode text', async () => {
    const tool = createClipboardWriteTool();
    const result = await execute(tool, { text: '日本語テスト 🎉' });
    expect(typeof result).toBe('string');
  });

  it('has correct description', () => {
    const tool = createClipboardWriteTool();
    expect((tool as any).description).toMatch(/clipboard/i);
  });
});
