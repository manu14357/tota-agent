import { tool, zodSchema } from 'ai';
import { z } from 'zod';

export function createSendMessageTool(
  sendMessage: (content: string) => Promise<void>,
) {
  return tool({
    description:
      'Send a proactive message back to the user through whatever channel they are on. ' +
      'If the user is chatting via WhatsApp this sends to their WhatsApp. ' +
      'If the user is chatting via Telegram this sends to their Telegram. ' +
      'Use this for follow-up notifications, task results, or reminders. ' +
      'To send a WhatsApp message to a DIFFERENT phone number use whatsapp_send instead.',
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
