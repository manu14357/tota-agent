import { tool, zodSchema } from 'ai';
import { z } from 'zod';

export function createWhatsAppSendTool(
  sendTo: (phone: string, content: string) => Promise<void>,
) {
  return tool({
    description:
      'Send a WhatsApp message to a phone number. Use this when the user asks to send a message ' +
      'via WhatsApp to someone. The phone number should be in E.164 format (e.g. +15551234567 or ' +
      '+919989263047). Only numbers in the owner\'s approved list can receive messages — ' +
      'if the number is not approved, add it first with `tota whatsapp allow <phone>`.',
    inputSchema: zodSchema(z.object({
      phone: z.string().describe('Recipient phone number in E.164 format, e.g. +15551234567'),
      message: z.string().describe('The text message to send'),
    })),
    execute: async ({ phone, message }) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return 'Error: Message content cannot be empty.';
      }
      try {
        await sendTo(phone, trimmed);
        return `WhatsApp message sent to ${phone}.`;
      } catch (err: any) {
        return `Error sending WhatsApp message: ${err.message}`;
      }
    },
  });
}
