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
  private pendingPermModeResolvers = new Map<string, (mode: PermissionMode) => void>();
  private pendingPermAskResolvers = new Map<string, (answer: string) => void>();
  private permissionModes = new Map<string, PermissionMode>();
  private onPermissionMode?: (mode: PermissionMode, jid: string) => void;
  /** Prevents the "session expired" console line from printing on every QR refresh. */
  private sessionExpiredPrinted = false;
  /** True once a connection.update 'open' has been received at least once. */
  private hasEverConnected = false;
  /** Number of consecutive reconnect attempts (reset on successful open). */
  private reconnectAttempts = 0;
  /** Max consecutive reconnect attempts before giving up. */
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;

  /** Called with the raw QR string whenever a new QR code is received. */
  public qrCallback: ((qr: string) => void) | null = null;
  /** Called when the connection closes unexpectedly. */
  public disconnectCallback: ((reason: string, shouldReconnect: boolean) => void) | null = null;

  constructor(private config: TotaConfig) {
    super();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(opts: { forLink?: boolean } = {}): Promise<void> {
    const { authDir, enabled } = this.config.channels.whatsapp;
    if (!enabled) return;

    fs.mkdirSync(authDir, { recursive: true });

    // During normal `tota start`, skip connecting when there are no saved creds.
    // This prevents Baileys from opening a WebSocket just to emit a QR nobody asked for.
    // The `tota whatsapp link` command passes { forLink: true } to bypass this guard.
    if (!opts.forLink) {
      const hasCreds = fs.readdirSync(authDir).some(f => f.startsWith('creds'));
      if (!hasCreds) return;
    }

    // Suppress Baileys' libsignal console.log noise (Signal protocol internals
    // write directly to console, bypassing the pino logger we've silenced).
    this.installConsoleFilter();

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
    // Use a minimal Baileys logger that only surfaces real errors — Baileys emits
    // Signal protocol INFO messages (e.g. "Closing open session in favor of incoming
    // prekey bundle") on every multi-device reconnect which are expected and harmless.
    const baileysLogger = {
      level: 'silent',
      trace: () => {},
      debug: () => {},
      info:  () => {},
      warn:  () => {},
      error: (obj: unknown, msg?: string) => {
        // Init-query timeouts are transient — WhatsApp server occasionally takes
        // too long to reply during handshake. Baileys closes + retries automatically;
        // logging it as ERROR just creates alarm. Downgrade to debug (silent).
        if (msg === "unexpected error in 'init queries'") return;
        // Status-broadcast decrypt failures are harmless — we ignore status@broadcast
        // messages entirely in our handler, but Baileys tries to decrypt them first.
        // Missing signal keys for other users' statuses are expected and unavoidable.
        if (msg === 'failed to decrypt message' &&
            (obj as any)?.key?.remoteJid === 'status@broadcast') return;
        logger.error({ module: 'baileys', obj }, msg);
      },
      fatal: (obj: unknown, msg?: string) => logger.error({ module: 'baileys', obj }, msg),
      child: function() { return this; },
    } as any;

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
          // Only tell the user to re-link when we have NEVER connected successfully
          // (i.e. fresh install / auth deleted). During normal auto-reconnects Baileys
          // briefly emits a QR before restoring the session — we must NOT treat that
          // as an expiry. If the session is truly gone the 'close' handler below fires
          // with loggedOut and we print the message there instead.
          if (!this.hasEverConnected && !this.sessionExpiredPrinted) {
            this.sessionExpiredPrinted = true;
            logger.warn('WhatsApp session requires re-authentication. Run `tota whatsapp link` to re-link.');
          }
        }
      }

      if (connection === 'open') {
        this.ready = true;
        this.hasEverConnected = true;
        this.reconnectAttempts = 0; // reset backoff on successful connect
        this.sessionExpiredPrinted = false; // reset so future genuine logouts are reported
        logger.info('WhatsApp channel connected');
      }

      if (connection === 'close') {
        this.ready = false;
        const boom = lastDisconnect?.error as Boom | undefined;
        const code = boom?.output?.statusCode;
        logger.warn({ code }, 'WhatsApp connection closed');

        // ── Conflict: another WhatsApp Web session replaced this one ──────────
        // Reconnecting immediately will just get kicked again in a tight loop.
        // Stop and tell the user to close the other session.
        if (code === DisconnectReason.connectionReplaced) {
          const msg = '[WhatsApp] Disconnected: another WhatsApp Web session (browser/app) replaced this one.\nClose all other WhatsApp Web tabs or desktop sessions, then run `tota restart`.';
          logger.error('WhatsApp session replaced by another device — stopping reconnect. Close other WhatsApp Web sessions and run `tota restart`.');
          console.log(`\n${msg}\n`);
          if (this.disconnectCallback) this.disconnectCallback('connectionReplaced', false);
          return;
        }

        // ── Logged out: credentials revoked ───────────────────────────────────
        if (code === DisconnectReason.loggedOut) {
          if (!this.sessionExpiredPrinted) {
            this.sessionExpiredPrinted = true;
            logger.warn('WhatsApp session logged out — clearing auth files. Run `tota whatsapp link` to re-link.');
          }
          // Delete stale auth files so the next startup does not attempt to
          // reconnect with invalid credentials (which would immediately log out
          // again and repeat the cycle).
          try {
            fs.rmSync(this.config.channels.whatsapp.authDir, { recursive: true, force: true });
          } catch { /* best-effort */ }
          if (this.disconnectCallback) this.disconnectCallback('loggedOut', false);
          return;
        }

        // ── Restart required: Baileys asks us to reconnect immediately ─────────
        if (code === DisconnectReason.restartRequired) {
          logger.info('WhatsApp restart required — reconnecting now…');
          this.connect(authDir).catch((err) => logger.error({ err }, 'WhatsApp reconnect failed'));
          return;
        }

        // ── Other disconnect: exponential backoff with max attempts ───────────
        if (this.disconnectCallback) {
          this.disconnectCallback(boom?.message ?? `status ${code ?? 'unknown'}`, true);
        }

        this.reconnectAttempts += 1;
        if (this.reconnectAttempts > WhatsAppChannel.MAX_RECONNECT_ATTEMPTS) {
          logger.error({ attempts: this.reconnectAttempts }, 'WhatsApp max reconnect attempts reached — giving up. Run `tota restart` to try again.');
          console.log('\n[WhatsApp] Too many failed reconnect attempts. Run `tota restart` to try again.\n');
          return;
        }

        const delayMs = Math.min(2_000 * Math.pow(2, this.reconnectAttempts - 1), 60_000);
        logger.info({ attempt: this.reconnectAttempts, delayMs }, 'WhatsApp reconnecting…');
        setTimeout(() => {
          this.connect(authDir).catch((err) => logger.error({ err }, 'WhatsApp reconnect failed'));
        }, delayMs);
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

    const lowered = content.trim().toLowerCase();

    // Handle permission mode replies — only intercept recognised answers.
    // Commands (/budget, /start, …) and task messages fall through so they
    // still reach the agent while the permission prompt stays open.
    if (this.pendingPermModeResolvers.has(jid)) {
      const PERM_ANSWERS = new Set(['1', '2', 'ask', 'all', 'ask me', 'allow all', 'ask-me', 'allow-all']);
      if (PERM_ANSWERS.has(lowered)) {
        const resolve = this.pendingPermModeResolvers.get(jid)!;
        this.pendingPermModeResolvers.delete(jid);
        const mode: PermissionMode = (lowered === '2' || lowered === 'all' || lowered === 'allow all' || lowered === 'allow-all')
          ? 'allow-all'
          : 'ask-me';
        this.permissionModes.set(jid, mode);
        resolve(mode);
        // Send confirmation — fire and forget
        const confirmText = mode === 'allow-all'
          ? '✅ *Permission granted!* Allow All mode activated — I\'ll proceed without asking for confirmations this session.'
          : '🔒 *Got it!* Ask Me mode activated — I\'ll confirm before any risky actions.';
        this.sock?.sendMessage(jid, { text: confirmText }).catch(() => {});
        return;
      }
      // Not a permission answer — fall through; resolver stays open until timeout
    }

    // Handle yes/always/no replies for askPermission (per-operation approval)
    if (this.pendingPermAskResolvers.has(jid)) {
      const PERM_ASK_ANSWERS = new Set(['yes', 'y', 'always', 'no', 'n', 'deny']);
      if (PERM_ASK_ANSWERS.has(lowered)) {
        const resolve = this.pendingPermAskResolvers.get(jid)!;
        this.pendingPermAskResolvers.delete(jid);
        const answer = (lowered === 'always') ? 'always'
          : (lowered === 'yes' || lowered === 'y') ? 'yes'
          : 'no';
        resolve(answer);
        return;
      }
      // Not a recognised answer — fall through; resolver stays open
    }

    // Handle yes/no replies for askToContinue — only intercept recognised answers
    if (this.pendingAskResolvers.has(jid)) {
      const ASK_ANSWERS = new Set(['yes', 'y', 'no', 'n', '1', '0', 'stop', 'continue']);
      if (ASK_ANSWERS.has(lowered)) {
        const resolve = this.pendingAskResolvers.get(jid)!;
        this.pendingAskResolvers.delete(jid);
        resolve(lowered === 'yes' || lowered === 'y' || lowered === '1' || lowered === 'continue');
        return;
      }
      // Not a recognised answer — fall through; resolver stays open
    }

    this.lastSenderJid = jid;

    // On first message from this JID, await permission mode before emitting to
    // the agent. This ensures the agent knows the user's chosen mode before it
    // starts executing any tools. Subsequent messages skip this (mode already set).
    if (!this.permissionModes.has(jid) && this.onPermissionMode) {
      this.permissionModes.set(jid, 'ask-me'); // safe default during the wait
      const mode = await this.askPermissionMode(jid).catch(() => 'ask-me' as PermissionMode);
      this.permissionModes.set(jid, mode);
      this.onPermissionMode(mode, jid);
    }

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

  setOnPermissionMode(handler: (mode: PermissionMode, jid: string) => void): void {
    this.onPermissionMode = handler;
  }

  async askPermissionMode(targetId?: string): Promise<PermissionMode> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) return 'ask-me';

    // Set up resolver BEFORE sending the message to close the race window
    // where a fast reply could arrive before the resolver is registered.
    const modePromise = new Promise<PermissionMode>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermModeResolvers.delete(jid);
        resolve('ask-me');
      }, 120_000);

      this.pendingPermModeResolvers.set(jid, (mode) => {
        clearTimeout(timer);
        resolve(mode);
      });
    });

    await this.sock.sendMessage(jid, {
      text: '🔐 *Permission Mode*\nHow should I handle risky actions this session?\n\nReply *1* or type *ask me* — 🔒 Ask Me (confirm before file writes, shell commands, etc.)\nReply *2* or type *allow all* — ✅ Allow All (auto-approve everything, faster)\n\nDefault is Ask Me if no reply within 2 min.',
    });

    return modePromise;
  }

  async askPermission(prompt: string, targetId?: string): Promise<string> {
    const jid = this.resolveJid(targetId);
    if (!jid || !this.sock) return 'no';

    // Set up resolver BEFORE sending the message to close the race window.
    const answerPromise = new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermAskResolvers.delete(jid);
        resolve('no');
      }, 120_000);

      this.pendingPermAskResolvers.set(jid, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
    });

    await this.sock.sendMessage(jid, {
      text: `🔒 *Permission Required*\n${prompt}\n\nReply *yes* to allow once, *always* to always allow, or *no* to deny.`,
    });

    return answerPromise;
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

  /**
   * Monkey-patches console.log/warn to drop lines that Baileys' libsignal
   * writes directly (bypassing the pino logger we've silenced).  These are
   * normal Signal-protocol events and carry no actionable information.
   */
  private installConsoleFilter(): void {
    const SUPPRESS = [
      'Decrypted message with closed session',
      'Closing session:',
      'SessionEntry {',
      '_chains:',
      'registrationId:',
      'currentRatchet:',
      'pendingPreKey:',
      'indexInfo:',
    ];
    const shouldSuppress = (...args: unknown[]): boolean => {
      if (args.length === 0) return false;
      const first = args[0];
      if (typeof first === 'string' && SUPPRESS.some((s) => first.includes(s))) return true;
      // SessionEntry object logged directly
      if (first !== null && typeof first === 'object' && '_chains' in (first as object)) return true;
      return false;
    };

    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    console.log = (...args: unknown[]) => { if (!shouldSuppress(...args)) origLog(...args); };
    console.warn = (...args: unknown[]) => { if (!shouldSuppress(...args)) origWarn(...args); };
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
