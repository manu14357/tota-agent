import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import makeWASocket, {
  type WASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  isJidUser,
  isJidGroup,
  jidNormalizedUser,
  downloadMediaMessage,
  type ConnectionState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import type { ChannelMessage } from '../types/channel.js';
import { BaseChannel, type PermissionMode } from './base.js';
import type { TotaConfig, WhatsAppApprovedUser, WhatsAppPendingRequest } from '../utils/config.js';
import { saveConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const MAX_TEXT_LENGTH = 4096;
const TYPING_TIMEOUT_MS = 5_000;
const STREAM_EDIT_INTERVAL_MS = 100;
const STREAM_MIN_CHARS = 20;

export class WhatsAppChannel extends BaseChannel {
  readonly type = 'whatsapp' as const;

  private sock: WASocket | null = null;
  private lastSenderJid: string | null = null;
  private typingTimer: NodeJS.Timeout | null = null;
  private pendingAskResolvers = new Map<string, (answer: boolean) => void>();

  /** Called with the raw QR string whenever a new QR code is received. */
  public qrCallback: ((qr: string) => void) | null = null;
  /** Called when the connection closes unexpectedly. */
  public disconnectCallback: ((reason: string, shouldReconnect: boolean) => void) | null = null;

  constructor(private config: TotaConfig) {
    super();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { authDir, enabled } = this.config.channels.whatsapp;
    if (!enabled) return;

    fs.mkdirSync(authDir, { recursive: true });

    await this.connect(authDir);
  }

  async stop(): Promise<void> {
    this.ready = false;
    this.clearTyping();
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // socket may already be closed
      }
      this.sock = null;
    }
  }

  // ─── Core connect / reconnect ───────────────────────────────────────────────

  private async connect(authDir: string): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    // Fetch the current WA Web version so WhatsApp doesn't reject the handshake
    // with a <failure> node (the bundled default version quickly becomes stale).
    const { version } = await fetchLatestBaileysVersion();
    const baileysLogger = logger.child({ module: 'baileys' }) as any;

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        // Use a cached key store for faster signal key lookups
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      browser: Browsers.appropriate('Chrome'),
      logger: baileysLogger,
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
      retryRequestDelayMs: 2_000,
      maxMsgRetryCount: 3,
      markOnlineOnConnect: false,
    });

    this.sock = sock;

    // Prevent WebSocket-level errors from becoming unhandled rejections that
    // crash the process (Baileys' uploadPreKeys / query calls can time out and
    // bubble up through the raw ws emitter if not caught here).
    if (sock.ws && typeof (sock.ws as any).on === 'function') {
      (sock.ws as any).on('error', (err: Error) => {
        logger.error({ err }, 'WhatsApp WebSocket error');
      });
    }

    // Persist creds on every update
    sock.ev.on('creds.update', saveCreds);

    // Connection state handler
    sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (this.qrCallback) {
          this.qrCallback(qr);
        } else {
          // In daemon mode there's no qrCallback — print a plain warning so the
          // user knows to re-run `tota whatsapp link` rather than seeing a broken
          // ASCII QR dumped into the logs.
          logger.warn('WhatsApp session requires re-authentication. Run `tota whatsapp link` to re-link.');
          console.log('\n[WhatsApp] Session expired — run `tota whatsapp link` to re-link your account.\n');
        }
      }

      if (connection === 'open') {
        this.ready = true;
        logger.info('WhatsApp channel connected');
      }

      if (connection === 'close') {
        this.ready = false;
        const boom = lastDisconnect?.error as Boom | undefined;
        const code = boom?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        logger.warn({ code }, 'WhatsApp connection closed');

        if (this.disconnectCallback) {
          const reason = boom?.message ?? `status ${code ?? 'unknown'}`;
          this.disconnectCallback(reason, shouldReconnect);
        }

        if (shouldReconnect) {
          logger.info('WhatsApp reconnecting…');
          this.connect(authDir).catch((err) =>
            logger.error({ err }, 'WhatsApp reconnect failed'),
          );
        } else {
          logger.warn('WhatsApp logged out — delete auth folder and restart to re-link');
        }
      }
    });

    // Inbound messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        await this.handleInboundMessage(msg).catch((err) =>
          logger.error({ err }, 'Error handling WhatsApp message'),
        );
      }
    });
  }

  // ─── Inbound message handling ───────────────────────────────────────────────

  private async handleInboundMessage(msg: WAMessage): Promise<void> {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid) return;

    // Skip status/broadcast
    if (jid === 'status@broadcast') return;

    const isGroup = isJidGroup(jid);

    // Group gating
    if (isGroup && !this.config.channels.whatsapp.allowGroups) return;

    // Extract sender phone (for DMs the jid IS the phone)
    const senderJid = isGroup
      ? (msg.key.participant ?? msg.participant ?? '')
      : jid;
    const senderPhone = isJidUser(senderJid)
      ? jidNormalizedUser(senderJid).replace('@s.whatsapp.net', '')
      : senderJid;
    const normalizedPhone = this.normalizePhone(senderPhone);

    // Access control (DM only — groups are controlled by allowGroups flag)
    if (!isGroup) {
      if (!this.isPhoneAllowed(normalizedPhone)) {
        await this.requestAccess(jid, normalizedPhone);
        return;
      }
    }

    // Extract text content
    const content = this.extractText(msg);
    if (!content) return;

    // Handle yes/no replies for askToContinue
    const lowered = content.trim().toLowerCase();
    if (this.pendingAskResolvers.has(jid)) {
      const resolve = this.pendingAskResolvers.get(jid)!;
      this.pendingAskResolvers.delete(jid);
      resolve(lowered === 'yes' || lowered === 'y' || lowered === '1');
      return;
    }

    this.lastSenderJid = jid;

    const channelMsg: ChannelMessage = {
      id: randomUUID(),
      channelId: jid,
      channelType: 'whatsapp',
      senderId: normalizedPhone,
      senderName: msg.pushName ?? undefined,
      content,
      timestamp: Date.now(),
      metadata: { jid, isGroup },
    };

    this.emit(channelMsg);
  }

  private extractText(msg: WAMessage): string {
    const m = msg.message!;
    return (
      m.conversation ??
      m.extendedTextMessage?.text ??
      m.imageMessage?.caption ??
      m.videoMessage?.caption ??
      m.documentMessage?.caption ??
      ''
    );
  }

  // ─── Outbound ───────────────────────────────────────────────────────────────

  async send(content: string, targetId?: string, _elapsedMs?: number): Promise<void> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) return;

    const chunks = this.chunkText(content);
    for (const chunk of chunks) {
      await this.sock.sendMessage(jid, { text: chunk });
    }
  }

  async sendFile(filePath: string, targetId?: string): Promise<void> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) return;

    const ext = path.extname(filePath).toLowerCase();
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (imageExts.includes(ext)) {
      await this.sock.sendMessage(jid, { image: buffer, caption: fileName });
    } else {
      await this.sock.sendMessage(jid, {
        document: buffer,
        fileName,
        mimetype: this.guessMime(ext),
      });
    }
  }

  async stream(content: AsyncIterable<string>, targetId?: string): Promise<string> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) {
      // Drain the iterable and return
      let full = '';
      for await (const chunk of content) full += chunk;
      return full;
    }

    let accumulated = '';
    let sentKey: import('@whiskeysockets/baileys').proto.IMessageKey | undefined;
    let lastEditAt = 0;

    for await (const chunk of content) {
      accumulated += chunk;

      const now = Date.now();
      if (!sentKey && accumulated.length >= 100) {
        const sent = await this.sock.sendMessage(jid, { text: accumulated });
        sentKey = sent?.key;
        lastEditAt = now;
      } else if (
        sentKey &&
        accumulated.length - (accumulated.length - chunk.length) >= STREAM_MIN_CHARS &&
        now - lastEditAt >= STREAM_EDIT_INTERVAL_MS
      ) {
        // Baileys does not support in-place edit of sent messages via the standard API.
        // We just accumulate and re-send at the end to avoid message spam.
        lastEditAt = now;
      }
    }

    if (!sentKey) {
      // Nothing was sent yet — send the full content
      if (accumulated) {
        const chunks = this.chunkText(accumulated);
        for (const c of chunks) {
          await this.sock.sendMessage(jid, { text: c });
        }
      }
    } else if (accumulated) {
      // Delete the partial message and send the final one
      await this.sock.sendMessage(jid, { delete: sentKey });
      const chunks = this.chunkText(accumulated);
      for (const c of chunks) {
        await this.sock.sendMessage(jid, { text: c });
      }
    }

    return accumulated;
  }

  async typing(targetId?: string): Promise<void> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) return;

    this.clearTyping();

    try {
      await this.sock.sendPresenceUpdate('composing', jid);
      this.typingTimer = setTimeout(async () => {
        try {
          await this.sock?.sendPresenceUpdate('paused', jid);
        } catch {
          // ignore
        }
      }, TYPING_TIMEOUT_MS);
    } catch (err) {
      logger.debug({ err }, 'WhatsApp typing indicator failed');
    }
  }

  async askToContinue(question: string, targetId?: string): Promise<boolean> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) return true;

    await this.sock.sendMessage(jid, {
      text: `${question}\n\nReply *yes* to continue or *no* to stop.`,
    });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAskResolvers.delete(jid);
        resolve(false);
      }, 120_000);

      this.pendingAskResolvers.set(jid, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  // ─── Access control ─────────────────────────────────────────────────────────

  private isPhoneAllowed(phone: string): boolean {
    const { allowFrom, approved } = this.config.channels.whatsapp;
    if (allowFrom.includes('*')) return true;
    if (allowFrom.includes(phone)) return true;
    return approved.some((u) => u.phone === phone);
  }

  private async requestAccess(jid: string, phone: string): Promise<void> {
    const { pending } = this.config.channels.whatsapp;
    const already = pending.find((p) => p.phone === phone);
    if (already) {
      await this.sock?.sendMessage(jid, {
        text: 'Your access request is pending approval. Please wait.',
      });
      return;
    }

    const req: WhatsAppPendingRequest = {
      phone,
      requestedAt: new Date().toISOString(),
    };
    this.config.channels.whatsapp.pending.push(req);
    saveConfig(this.config);

    await this.sock?.sendMessage(jid, {
      text: "Hi! I'm an AI assistant. Your number has been queued for access. The owner will approve your request.",
    });
    logger.info({ phone }, 'WhatsApp access request queued');
  }

  /** Approve a pending number and optionally promote to admin */
  approvePhone(phone: string, isAdmin = false): void {
    const normalized = this.normalizePhone(phone);
    this.config.channels.whatsapp.pending = this.config.channels.whatsapp.pending.filter(
      (p) => p.phone !== normalized,
    );
    if (!this.config.channels.whatsapp.approved.find((u) => u.phone === normalized)) {
      const user: WhatsAppApprovedUser = {
        phone: normalized,
        approvedAt: new Date().toISOString(),
        isAdmin,
      };
      this.config.channels.whatsapp.approved.push(user);
    }
    saveConfig(this.config);
    logger.info({ phone: normalized, isAdmin }, 'WhatsApp number approved');
  }

  getPendingRequests(): WhatsAppPendingRequest[] {
    return this.config.channels.whatsapp.pending;
  }

  getApprovedUsers(): WhatsAppApprovedUser[] {
    return this.config.channels.whatsapp.approved;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private resolveJid(targetId?: string): string | null {
    if (targetId) {
      // Accept raw phone number (e.g. "+15551234567") or full JID
      if (!targetId.includes('@')) {
        return `${targetId.replace(/\D/g, '')}@s.whatsapp.net`;
      }
      return targetId;
    }
    return this.lastSenderJid;
  }

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return `+${digits}`;
  }

  private chunkText(text: string): string[] {
    if (text.length <= MAX_TEXT_LENGTH) return [text];
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + MAX_TEXT_LENGTH));
      i += MAX_TEXT_LENGTH;
    }
    return chunks;
  }

  private guessMime(ext: string): string {
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.zip': 'application/zip',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.csv': 'text/csv',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  private clearTyping(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }
}
