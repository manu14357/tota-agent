import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

export function createNotifyTool() {
  return tool({
    description: 'Send a desktop notification to the user\'s screen. Works on macOS (Notification Center), Linux (libnotify/notify-send), and Windows (Windows Notification Center). Use this to alert the user when a long task completes, a timer fires, or something requires their attention.',
    inputSchema: zodSchema(z.object({
      title: z.string().describe('Notification title (short, e.g. "Task Complete")'),
      message: z.string().describe('Notification body text'),
      sound: z.boolean().optional().describe('Play a sound with the notification (default: false)'),
    })),
    execute: async ({ title, message, sound }) => {
      try {
        // Dynamic import to avoid issues at load time on headless environments
        const { default: notifier } = await import('node-notifier');
        await new Promise<void>((resolve, reject) => {
          notifier.notify(
            {
              title: title.trim(),
              message: message.trim(),
              sound: sound ?? false,
              wait: false,
            },
            (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            },
          );
        });
        logger.info({ title }, 'Desktop notification sent');
        return `Desktop notification sent: "${title}" — ${message}`;
      } catch (err: any) {
        return `Error sending notification: ${err.message}. Make sure node-notifier is installed and a notification daemon is running (Linux needs libnotify).`;
      }
    },
  });
}
