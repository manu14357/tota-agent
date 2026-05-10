import { execFile } from 'node:child_process';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

/** Escape a string for use inside an AppleScript double-quoted string literal. */
function escapeAppleScript(s: string): string {
  // AppleScript has no escape sequences inside "…" — use concatenation with the
  // built-in `quote` constant to embed literal double-quote characters safely.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '" & quote & "');
}

export function createNotifyTool() {
  return tool({
    description: 'Send a desktop notification to the user\'s screen. Works on macOS (Notification Center via osascript), Linux (notify-send/libnotify), and Windows. Use this to alert the user when a long task completes, a timer fires, or something requires their attention.',
    inputSchema: zodSchema(z.object({
      title: z.string().describe('Notification title (short, e.g. "Task Complete")'),
      message: z.string().describe('Notification body text'),
      sound: z.boolean().optional().describe('Play a sound with the notification (default: false)'),
    })),
    execute: async ({ title, message, sound }) => {
      const t = title.trim();
      const m = message.trim();

      try {
        if (process.platform === 'darwin') {
          // macOS: osascript is always available and doesn't require extra binaries.
          // node-notifier requires terminal-notifier which may not be installed.
          const soundClause = sound ? ' sound name "default"' : '';
          const script = `display notification "${escapeAppleScript(m)}" with title "${escapeAppleScript(t)}"${soundClause}`;
          await new Promise<void>((resolve, reject) => {
            execFile('osascript', ['-e', script], (err) => {
              if (err) reject(err); else resolve();
            });
          });
        } else if (process.platform === 'linux') {
          // Linux: use notify-send (libnotify)
          const args = [t, m];
          if (sound) args.push('--hint=int:transient:1');
          await new Promise<void>((resolve, reject) => {
            execFile('notify-send', args, (err) => {
              // notify-send exits 0 on success; treat any exec error gracefully
              if (err && (err as any).code !== 0) reject(err); else resolve();
            });
          });
        } else {
          // Windows / other: fall back to node-notifier
          const { default: notifier } = await import('node-notifier');
          await new Promise<void>((resolve, reject) => {
            notifier.notify(
              { title: t, message: m, sound: sound ?? false, wait: false },
              (err: Error | null) => { if (err) reject(err); else resolve(); },
            );
          });
        }
        logger.info({ title: t }, 'Desktop notification sent');
        return `Desktop notification sent: "${t}" — ${m}`;
      } catch (err: any) {
        return `Error sending notification: ${err.message}`;
      }
    },
  });
}
