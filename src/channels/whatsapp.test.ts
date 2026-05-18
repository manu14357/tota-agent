import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock @whiskeysockets/baileys ─────────────────────────────────────────────
vi.mock('@whiskeysockets/baileys', () => {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const mockSock = {
    ev: {
      on: (event: string, cb: (...args: any[]) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
      },
      emit: (event: string, ...args: any[]) => {
        listeners[event]?.forEach((cb) => cb(...args));
      },
    },
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'mock-key' } }),
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    _listeners: listeners,
  };

  return {
    default: vi.fn(() => mockSock),
    useMultiFileAuthState: vi.fn().mockResolvedValue({
      state: { creds: {}, keys: {} },
      saveCreds: vi.fn(),
    }),
    fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1035194821], isLatest: true }),
    makeCacheableSignalKeyStore: vi.fn((keys: unknown) => keys),
    DisconnectReason: { loggedOut: 401 },
    Browsers: { appropriate: vi.fn(() => ['Mac OS', 'Chrome', '25.3.0']), macOS: vi.fn(() => ['Mac OS', 'Chrome', '14.4.1']), ubuntu: vi.fn(() => ['Ubuntu', 'Chrome', '22.04.4']) },
    isJidUser: vi.fn((jid: string) => jid.endsWith('@s.whatsapp.net')),
    isJidGroup: vi.fn((jid: string) => jid.endsWith('@g.us')),
    jidNormalizedUser: vi.fn((jid: string) => jid),
    downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('')),
  };
});

// ─── Mock qrcode-terminal ─────────────────────────────────────────────────────
vi.mock('qrcode-terminal', () => ({ default: { generate: vi.fn() } }));

// ─── Mock fs (for mkdirSync / readdirSync / readFileSync) ─────────────────────
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, default: { ...actual, mkdirSync: vi.fn(), readdirSync: vi.fn().mockReturnValue(['creds.json']), readFileSync: vi.fn().mockReturnValue(Buffer.from('')) } };
});

// ─── Mock saveConfig ──────────────────────────────────────────────────────────
vi.mock('../utils/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/config.js')>();
  return { ...actual, saveConfig: vi.fn() };
});

import { WhatsAppChannel } from './whatsapp.js';
import type { TotaConfig } from '../utils/config.js';

function makeConfig(overrides: Partial<TotaConfig['channels']['whatsapp']> = {}): TotaConfig {
  return {
    channels: {
      whatsapp: {
        enabled: true,
        authDir: '/tmp/whatsapp-auth',
        allowFrom: [],
        allowGroups: false,
        approved: [],
        pending: [],
        ...overrides,
      },
      telegram: { enabled: false, token: '', allowedUsers: [], pendingUsers: [] },
      api: { enabled: false, port: 3001, apiKey: '' },
    },
  } as unknown as TotaConfig;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatsAppChannel — access control', () => {
  it('allows phones in allowFrom list', async () => {
    const config = makeConfig({ allowFrom: ['+15551234567'] });
    const ch = new WhatsAppChannel(config);
    await ch.start();
    // Access via getPendingRequests (no request should be queued for allowed number)
    expect(ch.getPendingRequests()).toHaveLength(0);
  });

  it('allows wildcard allowFrom', async () => {
    const config = makeConfig({ allowFrom: ['*'] });
    const ch = new WhatsAppChannel(config);
    await ch.start();
    expect(ch.getPendingRequests()).toHaveLength(0);
  });

  it('starts without errors when enabled', async () => {
    const config = makeConfig();
    const ch = new WhatsAppChannel(config);
    await expect(ch.start()).resolves.not.toThrow();
  });

  it('skips start when disabled', async () => {
    const config = makeConfig({ enabled: false } as any);
    const ch = new WhatsAppChannel(config);
    await ch.start();
    expect(ch.isReady()).toBe(false);
  });
});

describe('WhatsAppChannel — approvePhone / getPendingRequests / getApprovedUsers', () => {
  let ch: WhatsAppChannel;

  beforeEach(async () => {
    const config = makeConfig({
      pending: [{ phone: '+19991234567', requestedAt: new Date().toISOString() }],
    });
    ch = new WhatsAppChannel(config);
    await ch.start();
  });

  it('returns pending requests', () => {
    expect(ch.getPendingRequests()).toHaveLength(1);
    expect(ch.getPendingRequests()[0].phone).toBe('+19991234567');
  });

  it('approvePhone moves phone from pending to approved', () => {
    ch.approvePhone('+19991234567');
    expect(ch.getPendingRequests()).toHaveLength(0);
    expect(ch.getApprovedUsers()).toHaveLength(1);
    expect(ch.getApprovedUsers()[0].phone).toBe('+19991234567');
  });

  it('approvePhone deduplicates — calling twice does not double-add', () => {
    ch.approvePhone('+19991234567');
    ch.approvePhone('+19991234567');
    expect(ch.getApprovedUsers()).toHaveLength(1);
  });

  it('approvePhone normalizes phone numbers (strips non-digits, prepends +)', () => {
    const config = makeConfig({
      pending: [{ phone: '+44 7700 900123', requestedAt: new Date().toISOString() }],
    });
    ch = new WhatsAppChannel(config);
    ch.approvePhone('44 7700 900123');
    expect(ch.getApprovedUsers()[0].phone).toBe('+447700900123');
  });
});

describe('WhatsAppChannel — send (chunked)', () => {
  it('splits long messages into chunks of 4096 chars', async () => {
    const config = makeConfig({ allowFrom: ['*'] });
    const ch = new WhatsAppChannel(config);
    await ch.start();

    const longText = 'A'.repeat(4096 * 2 + 100);

    // Access internal sock via start() — we need to trigger send
    // We do this via the public send() API with an explicit JID
    const baileysModule = await import('@whiskeysockets/baileys');
    const mockSock = (baileysModule.default as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;

    await ch.send(longText, '+15551234567@s.whatsapp.net');

    // 4096*2+100 → 3 chunks: 4096, 4096, 100
    expect(mockSock?.sendMessage).toHaveBeenCalledTimes(3);
  });
});

describe('WhatsAppChannel — stop', () => {
  it('sets isReady to false after stop()', async () => {
    const config = makeConfig();
    const ch = new WhatsAppChannel(config);
    await ch.start();
    await ch.stop();
    expect(ch.isReady()).toBe(false);
  });
});
