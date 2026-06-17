import type { Command } from 'commander';
import chalk from 'chalk';

import {
  loadConfig,
  saveConfig,
  clearTelegramAccess,
  getTelegramApprovedUsers,
  getTelegramPendingRequests,
  approveTelegramPendingRequest,
  approveTelegramPendingRequestByPairingCode,
  rejectTelegramPendingRequest,
  removeTelegramUser,
  promoteTelegramUserToAdmin,
  demoteTelegramAdmin,
  hasTelegramAdmins,
} from '../../utils/config.js';
import { getDaemonStatus } from '../daemon.js';
import { formatTelegramUser, printTelegramAccessState, restartDaemonIfRunning } from '../setup/telegram-pairing.js';

export function registerTelegramCommands(program: Command): void {
  const telegramCmd = program
    .command('telegram')
    .description('Manage Telegram access approvals and admins');

  telegramCmd
    .command('list')
    .description('Show approved Telegram users and pending access requests')
    .action(() => {
      const config = loadConfig();
      console.log('');
      printTelegramAccessState(config);
      console.log('');
    });

  telegramCmd
    .command('approve <codeOrUserId>')
    .description('Approve a pending Telegram access request by pairing code or user ID')
    .action((codeOrUserId: string) => {
      const config = loadConfig();
      const hasAdmins = hasTelegramAdmins(config);

      if (!hasAdmins) {
        const approved = approveTelegramPendingRequestByPairingCode(config, codeOrUserId.trim());
        if (!approved) {
          console.log('');
          console.log(chalk.red(`  No pending first-time Telegram pairing found for code ${codeOrUserId}.`));
          console.log('');
          return;
        }

        saveConfig(config);
        console.log('');
        console.log(chalk.green(`  ✓ Approved first Telegram admin ${formatTelegramUser(approved)}.`));
        restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
        console.log('');
        return;
      }

      const targetUserId = Number(codeOrUserId);
      if (isNaN(targetUserId)) {
        console.log('');
        console.log(chalk.red('  Please provide a numeric Telegram user ID once Telegram already has an admin.'));
        console.log('');
        return;
      }

      const approved = approveTelegramPendingRequest(config, targetUserId, 'member');
      if (!approved) {
        console.log('');
        console.log(chalk.red(`  No pending Telegram request found for user ${codeOrUserId}.`));
        console.log('');
        return;
      }

      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ Approved Telegram member ${formatTelegramUser(approved)}.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
      console.log('');
    });

  telegramCmd
    .command('reject <userId>')
    .description('Reject a pending Telegram access request')
    .action((userId: string) => {
      const config = loadConfig();
      const targetUserId = Number(userId);
      if (isNaN(targetUserId)) {
        console.log('');
        console.log(chalk.red('  Please provide a numeric Telegram user ID.'));
        console.log('');
        return;
      }

      const rejected = rejectTelegramPendingRequest(config, targetUserId);
      if (!rejected) {
        console.log('');
        console.log(chalk.red(`  No pending Telegram request found for user ${userId}.`));
        console.log('');
        return;
      }

      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ Rejected Telegram request for ${formatTelegramUser(rejected)}.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
      console.log('');
    });

  telegramCmd
    .command('remove <userId>')
    .description('Remove an approved Telegram admin or member')
    .action((userId: string) => {
      const config = loadConfig();
      const targetUserId = Number(userId);
      if (isNaN(targetUserId)) {
        console.log('');
        console.log(chalk.red('  Please provide a numeric Telegram user ID.'));
        console.log('');
        return;
      }

      const removed = removeTelegramUser(config, targetUserId);
      if (!removed) {
        console.log('');
        console.log(chalk.red(`  No approved Telegram user found for ${userId}.`));
        console.log('');
        return;
      }

      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ Removed Telegram access for ${formatTelegramUser(removed)}.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
      console.log('');
    });

  telegramCmd
    .command('promote <userId>')
    .description('Promote an approved Telegram member to admin')
    .action((userId: string) => {
      const config = loadConfig();
      const targetUserId = Number(userId);
      if (isNaN(targetUserId)) {
        console.log('');
        console.log(chalk.red('  Please provide a numeric Telegram user ID.'));
        console.log('');
        return;
      }

      const promoted = promoteTelegramUserToAdmin(config, targetUserId);
      if (!promoted) {
        console.log('');
        console.log(chalk.red(`  No Telegram member found for ${userId}.`));
        console.log('');
        return;
      }

      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ Promoted ${formatTelegramUser(promoted)} to Telegram admin.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
      console.log('');
    });

  telegramCmd
    .command('demote <userId>')
    .description('Demote a Telegram admin to member')
    .action((userId: string) => {
      const config = loadConfig();
      const targetUserId = Number(userId);
      if (isNaN(targetUserId)) {
        console.log('');
        console.log(chalk.red('  Please provide a numeric Telegram user ID.'));
        console.log('');
        return;
      }

      const demoted = demoteTelegramAdmin(config, targetUserId);
      if (!demoted) {
        console.log('');
        console.log(chalk.red('  Could not demote that Telegram admin. tota must keep at least one admin.'));
        console.log('');
        return;
      }

      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ Demoted ${formatTelegramUser(demoted)} to Telegram member.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
      console.log('');
    });

  telegramCmd
    .command('unpair')
    .description('Reset all Telegram access for this tota instance')
    .action(() => {
      const config = loadConfig();
      const hasAnyAccess = getTelegramApprovedUsers(config).length > 0 || getTelegramPendingRequests(config).length > 0;
      if (!hasAnyAccess) {
        console.log('');
        console.log(chalk.dim('  Telegram access is already empty.'));
        console.log('');
        return;
      }

      clearTelegramAccess(config);
      saveConfig(config);

      console.log('');
      console.log(chalk.green('  ✓ Telegram access reset.'));
      restartDaemonIfRunning('Restarting the background daemon to apply the change immediately...');
      if (!getDaemonStatus().running) {
        console.log(chalk.dim('  New private Telegram users can send /start to request access.'));
        console.log(chalk.dim('  The first request must be approved from the CLI with `tota telegram approve <pairing-code>`.'));
      }
      console.log('');
    });
}
