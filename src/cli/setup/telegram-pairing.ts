import chalk from 'chalk';

import {
  saveConfig,
  getTelegramAccessSummary,
  approveTelegramPendingRequestByPairingCode,
  hasTelegramAdmins,
} from '../../utils/config.js';
import type { TotaConfig } from '../../utils/config.js';
import { TelegramChannel } from '../../channels/telegram.js';
import { getDaemonStatus, restartDaemon } from '../daemon.js';
import { ask } from './prompts.js';

export function formatTelegramUser(user: {
  userId: number;
  username?: string;
  firstName?: string;
}): string {
  const username = user.username ? ` (@${user.username})` : '';
  const firstName = user.firstName ? ` ${user.firstName}` : '';
  return `${user.userId}${username}${firstName}`;
}

export function printTelegramAccessState(config: TotaConfig): void {
  const admins = config.channels.telegram.admins;
  const members = config.channels.telegram.members;
  const pending = config.channels.telegram.pending;
  const pendingSummary = pending.length > 0
    ? pending.map((entry) => {
        const code = entry.pairingCode ? ` [code: ${entry.pairingCode}]` : '';
        return `${formatTelegramUser(entry)}${code}`;
      }).join(', ')
    : '';

  console.log('');
  console.log(`  Telegram Access: ${chalk.white(getTelegramAccessSummary(config))}`);
  console.log(`  Admins:          ${admins.length > 0 ? chalk.green(admins.map(formatTelegramUser).join(', ')) : chalk.dim('none')}`);
  console.log(`  Members:         ${members.length > 0 ? chalk.green(members.map(formatTelegramUser).join(', ')) : chalk.dim('none')}`);
  console.log(`  Pending:         ${pending.length > 0 ? chalk.yellow(pendingSummary) : chalk.dim('none')}`);
}

export function restartDaemonIfRunning(message?: string): void {
  const daemon = getDaemonStatus();
  if (!daemon.running) return;

  if (message) {
    console.log(chalk.dim(`  ${message}`));
  }
  restartDaemon();
}

export async function completeInitialTelegramPairing(config: TotaConfig): Promise<void> {
  if (!config.channels.telegram.enabled || !config.channels.telegram.botToken || hasTelegramAdmins(config)) {
    return;
  }

  console.log('');
  console.log(chalk.bold.white('  Telegram Pairing'));
  console.log(chalk.dim('  1. Open Telegram and message your bot.'));
  console.log(chalk.dim('  2. Send /start to receive your pairing code in Telegram.'));
  console.log(chalk.dim('  3. Paste that pairing code below to finish setup.'));
  console.log('');

  const telegram = new TelegramChannel(config);
  try {
    await telegram.start();
  } catch (err: any) {
    console.log(chalk.red(`\n  ✗ ${err.message || err}`));
    console.log('');
    await telegram.stop();
    return;
  }

  try {
    while (true) {
      const pairingCode = await ask(chalk.white('  Telegram Pairing Code: '));
      if (!pairingCode) {
        console.log(chalk.red('  Telegram pairing code is required to continue.'));
        continue;
      }

      const approved = approveTelegramPendingRequestByPairingCode(config, pairingCode);
      if (!approved) {
        console.log(chalk.red('  That pairing code is not valid yet. Send /start in Telegram, then paste the exact code here.'));
        continue;
      }

      saveConfig(config);
      console.log(chalk.green(`  ✓ Telegram paired. First admin: ${formatTelegramUser(approved)}.`));
      console.log('');
      break;
    }
  } finally {
    await telegram.stop();
  }
}
