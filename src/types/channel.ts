export interface TelegramAccessUser {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  requestedAt?: string;
  approvedAt: string;
}

export interface TelegramPendingRequest {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  requestedAt: string;
  pairingCode?: string;
}

export type ChannelType = 'cli' | 'telegram' | 'internal' | 'api' | 'signal' | 'discord' | 'slack' | 'whatsapp' | 'ui';

export interface ChannelMessage {
  id: string;
  channelId: string;
  channelType: ChannelType;
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  [key: string]: unknown;
}

export interface TelegramChannelConfig extends ChannelConfig {
  type: 'telegram';
  botToken: string;
  webhookUrl?: string;
  allowedChatIds?: number[];
  streaming?: boolean;
  admins?: TelegramAccessUser[];
  members?: TelegramAccessUser[];
  pending?: TelegramPendingRequest[];
  pairedUserId?: number;
  pairedChatId?: number;
  pairedUsername?: string;
}

export interface CLIChannelConfig extends ChannelConfig {
  type: 'cli';
}

export interface WhatsAppPendingRequest {
  phone: string;
  requestedAt: string;
  pairingCode?: string;
}

export interface WhatsAppApprovedUser {
  phone: string;
  name?: string;
  approvedAt: string;
  isAdmin?: boolean;
}

export interface WhatsAppChannelConfig extends ChannelConfig {
  type: 'whatsapp';
  /** Absolute path where Baileys auth state is stored (default: ~/.tota/whatsapp-auth) */
  authDir?: string;
  /** E.164 phone numbers allowed to DM the agent, e.g. ["+15551234567"]. '*' = allow all. */
  allowFrom: string[];
  /** Allow messages from WhatsApp groups where the agent is a member */
  allowGroups?: boolean;
  approved: WhatsAppApprovedUser[];
  pending: WhatsAppPendingRequest[];
}
