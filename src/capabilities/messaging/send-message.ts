import { tool, zodSchema } from 'ai';
import { z } from 'zod';

export function createSendMessageTool(
  sendMessage: (content: string) => Promise<void>,
) {
  return tool({
    description:
      'Send a message to the approved Telegram recipients. Use this ONLY for Telegram messages. ' +
      'For WhatsApp messages use the whatsapp_send tool instead.',
    inputSchema: zodSchema(z.object({
      content: z.string().describe('The message content to send to the approved Telegram recipients'),
    })),
    execute: async ({ content }) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return 'Error: Message content cannot be empty.';
      }

      try {
        await sendMessage(trimmed);
        return 'Message sent to the approved Telegram recipients.';
      } catch (err: any) {
        return `Error sending message: ${err.message}`;
      }
    },
  });
}
