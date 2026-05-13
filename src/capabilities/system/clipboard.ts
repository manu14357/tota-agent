import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

/** Race a promise against a timeout; rejects with a clear message if exceeded. */
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

export function createClipboardReadTool() {
  return tool({
    description: 'Read the current contents of the system clipboard. Returns the text currently on the clipboard.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      try {
        // clipboardy is ESM-only — must use dynamic import
        const { default: clipboardy } = await import('clipboardy');
        const text = await withTimeout(clipboardy.read(), 3000, 'Clipboard read timed out (no display available in this environment)');
        if (!text) return 'Clipboard is empty.';
        logger.info({ length: text.length }, 'Clipboard read');
        return `Clipboard contents (${text.length} chars):\n${text}`;
      } catch (err: any) {
        return `Error reading clipboard: ${err.message}`;
      }
    },
  });
}

export function createClipboardWriteTool() {
  return tool({
    description: 'Write text to the system clipboard so the user can paste it anywhere.',
    inputSchema: zodSchema(z.object({
      text: z.string().describe('Text to copy to the clipboard'),
    })),
    execute: async ({ text }) => {
      if (!text) return 'Error: Text cannot be empty.';
      try {
        const { default: clipboardy } = await import('clipboardy');
        await withTimeout(clipboardy.write(text), 3000, 'Clipboard write timed out (no display available in this environment)');
        logger.info({ length: text.length }, 'Clipboard written');
        return `Copied to clipboard (${text.length} chars).`;
      } catch (err: any) {
        return `Error writing to clipboard: ${err.message}`;
      }
    },
  });
}
