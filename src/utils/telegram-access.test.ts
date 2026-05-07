import { describe, expect, it } from 'vitest';
import {
  addTelegramPendingRequest,
  approveTelegramPendingRequest,
  approveTelegramPendingRequestByPairingCode,
  clearTelegramAccess,
  demoteTelegramAdmin,
  findTelegramPendingRequestByPairingCode,
  getDefaultConfig,
  getTelegramAccessSummary,
  getTelegramApprovedChatIds,
  migrateLegacyTelegramAccess,
  promoteTelegramUserToAdmin,
  rejectTelegramPendingRequest,
  removeTelegramUser,
} from './config.js';

describe('telegram access config helpers', () => {
  it('migrates a legacy paired Telegram user into admins', () => {
    const config = getDefaultConfig();
    config.channels.telegram.pairedUserId = 42;
    config.channels.telegram.pairedChatId = 77;
    config.channels.telegram.pairedUsername = 'legacy_user';

    migrateLegacyTelegramAccess(config);

    expect(config.channels.telegram.admins).toHaveLength(1);
    expect(config.channels.telegram.admins[0]).toMatchObject({
      userId: 42,
      chatId: 77,
      username: 'legacy_user',
    });
    expect(config.channels.telegram.pairedUserId).toBeUndefined();
  });

  it('approves pending requests and reports summary counts', () => {
    const config = getDefaultConfig();
    addTelegramPendingRequest(config, { userId: 1, chatId: 101, username: 'alpha', pairingCode: '123456' });
    addTelegramPendingRequest(config, { userId: 2, chatId: 202, username: 'beta' });

    expect(findTelegramPendingRequestByPairingCode(config, '123456')?.userId).toBe(1);
    const admin = approveTelegramPendingRequestByPairingCode(config, '123456');
    const member = approveTelegramPendingRequest(config, 2, 'member');

    expect(admin?.userId).toBe(1);
    expect(member?.userId).toBe(2);
    expect(getTelegramAccessSummary(config)).toBe('1 admin, 1 member, 0 pending');
    expect(getTelegramApprovedChatIds(config)).toEqual([101, 202]);
  });

  it('supports reject, remove, promote, and demote flows', () => {
    const config = getDefaultConfig();
    addTelegramPendingRequest(config, { userId: 1, chatId: 101, username: 'alpha' });
    addTelegramPendingRequest(config, { userId: 2, chatId: 202, username: 'beta' });
    addTelegramPendingRequest(config, { userId: 3, chatId: 303, username: 'gamma' });

    approveTelegramPendingRequest(config, 1, 'admin');
    approveTelegramPendingRequest(config, 2, 'member');
    expect(rejectTelegramPendingRequest(config, 3)?.userId).toBe(3);

    expect(promoteTelegramUserToAdmin(config, 2)?.userId).toBe(2);
    expect(demoteTelegramAdmin(config, 1)?.userId).toBe(1);
    expect(removeTelegramUser(config, 1)?.userId).toBe(1);

    expect(config.channels.telegram.admins).toHaveLength(1);
    expect(config.channels.telegram.members).toHaveLength(0);
    expect(config.channels.telegram.pending).toHaveLength(0);
  });

  it('clears all Telegram access state', () => {
    const config = getDefaultConfig();
    addTelegramPendingRequest(config, { userId: 1, chatId: 101 });
    approveTelegramPendingRequest(config, 1, 'admin');

    clearTelegramAccess(config);

    expect(config.channels.telegram.admins).toEqual([]);
    expect(config.channels.telegram.members).toEqual([]);
    expect(config.channels.telegram.pending).toEqual([]);
  });
});
