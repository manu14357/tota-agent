import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Command } from 'commander';
import chalk from 'chalk';

import { loadConfig, saveConfig, isSetupComplete } from '../../utils/config.js';
import { WhatsAppChannel } from '../../channels/whatsapp.js';
import { ask } from '../setup/prompts.js';
import { restartDaemonIfRunning } from '../setup/telegram-pairing.js';
import { configure } from '../setup/wizard.js';

export function registerWhatsAppCommands(program: Command): void {
  const whatsappCmd = program
    .command('whatsapp')
    .description('Manage WhatsApp channel — link, approve numbers, view access');

  whatsappCmd
    .command('status')
    .description('Show WhatsApp status: linked state, approved and pending numbers')
    .action(() => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      console.log('');
      if (!wa?.enabled) {
        console.log(chalk.dim('  WhatsApp is disabled. Run `tota setup whatsapp` to enable.'));
        console.log('');
        return;
      }
      console.log(chalk.bold.white('  WhatsApp'));
      console.log(`  Status:  ${chalk.green('enabled')}`);
      console.log(`  Auth:    ${chalk.dim(wa.authDir || '~/.tota/whatsapp-auth')}`);
      console.log(`  Groups:  ${wa.allowGroups ? chalk.green('allowed') : chalk.dim('disabled')}`);
      const approved = wa.approved ?? [];
      const pending = wa.pending ?? [];
      if (approved.length === 0) {
        console.log(chalk.dim('  Approved: none'));
      } else {
        console.log(chalk.bold('  Approved:'));
        for (const u of approved) {
          const admin = u.isAdmin ? chalk.cyan(' [admin]') : '';
          const name = u.name ? ` (${u.name})` : '';
          console.log(`    ${chalk.green(u.phone)}${name}${admin}`);
        }
      }
      if (pending.length === 0) {
        console.log(chalk.dim('  Pending:  none'));
      } else {
        console.log(chalk.yellow('  Pending:'));
        for (const p of pending) {
          console.log(`    ${chalk.yellow(p.phone)}  requested: ${p.requestedAt}`);
        }
      }
      console.log('');
    });

  whatsappCmd
    .command('allow <phone>')
    .description('Add a phone number to the allowed list (E.164 format, e.g. +15551234567)')
    .action((phone: string) => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa?.enabled) {
        console.log('');
        console.log(chalk.red('  WhatsApp is not enabled. Run `tota setup whatsapp` first.'));
        console.log('');
        process.exit(1);
      }
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      if (!wa.allowFrom) wa.allowFrom = [];
      if (wa.allowFrom.includes(normalized)) {
        console.log('');
        console.log(chalk.dim(`  ${normalized} is already in the allowed list.`));
        console.log('');
        return;
      }
      wa.allowFrom.push(normalized);
      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ ${normalized} added to allowed numbers.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change...');
      console.log('');
    });

  whatsappCmd
    .command('disallow <phone>')
    .description('Remove a phone number from the allowed list')
    .action((phone: string) => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa?.allowFrom) {
        console.log('');
        console.log(chalk.dim('  No allowed list configured.'));
        console.log('');
        return;
      }
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      const before = wa.allowFrom.length;
      wa.allowFrom = wa.allowFrom.filter((p) => p !== normalized);
      if (wa.allowFrom.length === before) {
        console.log('');
        console.log(chalk.red(`  ${normalized} was not in the allowed list.`));
        console.log('');
        return;
      }
      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ ${normalized} removed from allowed numbers.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change...');
      console.log('');
    });

  whatsappCmd
    .command('approve <phone>')
    .description('Approve a pending WhatsApp access request')
    .action((phone: string) => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa) {
        console.log('');
        console.log(chalk.red('  WhatsApp is not configured.'));
        console.log('');
        process.exit(1);
      }
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      const pending = wa.pending ?? [];
      const idx = pending.findIndex((p) => p.phone === normalized);
      if (idx === -1) {
        console.log('');
        console.log(chalk.red(`  No pending request found for ${normalized}.`));
        const pendingPhones = pending.map((p) => p.phone).join(', ');
        if (pendingPhones) {
          console.log(chalk.dim(`  Pending requests: ${pendingPhones}`));
        }
        console.log('');
        return;
      }
      const [removed] = pending.splice(idx, 1);
      if (!wa.approved) wa.approved = [];
      wa.approved.push({ phone: removed.phone, approvedAt: new Date().toISOString() });
      if (!wa.allowFrom) wa.allowFrom = [];
      if (!wa.allowFrom.includes(removed.phone)) {
        wa.allowFrom.push(removed.phone);
      }
      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ ${normalized} approved.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change...');
      console.log('');
    });

  whatsappCmd
    .command('reject <phone>')
    .description('Reject and remove a pending WhatsApp access request')
    .action((phone: string) => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa) {
        console.log('');
        console.log(chalk.red('  WhatsApp is not configured.'));
        console.log('');
        process.exit(1);
      }
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      const before = (wa.pending ?? []).length;
      wa.pending = (wa.pending ?? []).filter((p) => p.phone !== normalized);
      if (wa.pending.length === before) {
        console.log('');
        console.log(chalk.red(`  No pending request found for ${normalized}.`));
        console.log('');
        return;
      }
      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ Rejected access request from ${normalized}.`));
      console.log('');
    });

  whatsappCmd
    .command('remove <phone>')
    .description('Remove a number from the approved list and block future messages')
    .action((phone: string) => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa) {
        console.log('');
        console.log(chalk.red('  WhatsApp is not configured.'));
        console.log('');
        process.exit(1);
      }
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      const beforeApproved = (wa.approved ?? []).length;
      wa.approved = (wa.approved ?? []).filter((u) => u.phone !== normalized);
      wa.allowFrom = (wa.allowFrom ?? []).filter((p) => p !== normalized);
      if ((wa.approved ?? []).length === beforeApproved) {
        console.log('');
        console.log(chalk.red(`  ${normalized} was not in the approved list.`));
        console.log('');
        return;
      }
      saveConfig(config);
      console.log('');
      console.log(chalk.green(`  ✓ ${normalized} removed from WhatsApp access.`));
      restartDaemonIfRunning('Restarting the background daemon to apply the change...');
      console.log('');
    });

  whatsappCmd
    .command('pending')
    .description('List pending WhatsApp access requests')
    .action(() => {
      const config = loadConfig();
      const pending = config.channels.whatsapp?.pending ?? [];
      console.log('');
      if (pending.length === 0) {
        console.log(chalk.dim('  No pending WhatsApp access requests.'));
      } else {
        console.log(chalk.bold.white('  Pending WhatsApp requests:'));
        for (const p of pending) {
          console.log(`    ${chalk.yellow(p.phone)}  (requested: ${p.requestedAt})`);
        }
        console.log('');
        console.log(chalk.dim('  Approve: tota whatsapp approve <phone>'));
        console.log(chalk.dim('  Reject:  tota whatsapp reject <phone>'));
      }
      console.log('');
    });

  whatsappCmd
    .command('setup')
    .description('Run the WhatsApp setup wizard (same as `tota setup whatsapp`)')
    .action(async () => {
      const config = isSetupComplete() ? loadConfig() : undefined;
      await configure(config, 'whatsapp');
      process.exit(0);
    });

  whatsappCmd
    .command('link')
    .description('Start a temporary WhatsApp session to scan the QR code and link your device')
    .action(async () => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa?.enabled) {
        console.log('');
        console.log(chalk.red('  WhatsApp is not enabled. Run `tota setup whatsapp` first.'));
        console.log('');
        process.exit(1);
      }
      console.log('');
      console.log(chalk.bold.white('  WhatsApp Linking'));
      console.log(chalk.dim('  Starting a temporary session to show the QR code…'));
      console.log(chalk.dim('  Open WhatsApp → Linked Devices → Link a Device, then scan.'));
      console.log('');
      const channel = new WhatsAppChannel(config);

      let qrDisplayed = false;
      let linkError: string | null = null;

      // Show QR code when Baileys emits one
      channel.qrCallback = (qr) => {
        qrDisplayed = true;
        console.log(chalk.bold.white('\n  Scan this QR code in WhatsApp → Linked Devices → Link a Device:\n'));
        // Dynamic import so the ESM/CJS interop is resolved at call time
        import('qrcode-terminal').then((m) => {
          const qrcodeTerminal = (m as any).default ?? m;
          qrcodeTerminal.generate(qr, { small: true });
          console.log();
          console.log(chalk.dim('  Waiting for you to scan…'));
        }).catch(() => {
          // Fallback: print raw QR data so user can paste into an online QR viewer
          console.log(qr);
          console.log();
        });
      };

      // Only abort on fatal disconnects (e.g. logged out / banned).
      // Transient failures like "Connection Failure" are retried by Baileys internally —
      // we must NOT break the wait loop on those or the QR never gets a chance to appear.
      channel.disconnectCallback = (reason, shouldReconnect) => {
        if (!shouldReconnect && !channel.isReady()) {
          linkError = reason;
        }
      };

      try {
        await channel.start({ forLink: true });
      } catch (err: any) {
        console.log(chalk.red(`\n  Failed to start WhatsApp: ${err?.message ?? String(err)}`));
        console.log(chalk.dim('  Try deleting ~/.tota/whatsapp-auth/ and running `tota whatsapp link` again.'));
        console.log('');
        process.exit(1);
      }

      // Wait until connected (up to 120s)
      let waited = 0;
      while (!channel.isReady() && waited < 120000) {
        if (linkError) {
          console.log(chalk.red(`\n  Connection error: ${linkError}`));
          console.log(chalk.dim('  Try deleting ~/.tota/whatsapp-auth/ and running `tota whatsapp link` again.'));
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
        waited += 1000;
      }
      if (channel.isReady()) {
        console.log('');
        console.log(chalk.green('  ✓ WhatsApp linked successfully!'));
        console.log(chalk.dim('  You can now run `tota start` to go live.'));
        // Wait for pending saveCreds writes to flush to disk.
        // Exit WITHOUT channel.stop(): calling sock.end() signals WA to close the session
        // which causes WA to issue a new QR on the next start. An abrupt process exit
        // mimics closing a browser tab — WA keeps the session alive on its side.
        await new Promise((r) => setTimeout(r, 3000));
        console.log('');
        process.exit(0);
      }
      // Error / timeout path — clean up the socket since we didn't fully link
      if (!linkError) {
        console.log('');
        console.log(chalk.yellow('  Timed out waiting for QR scan. Try `tota whatsapp link` again.'));
      }
      await channel.stop();
      console.log('');
      process.exit(1);
    });

  whatsappCmd
    .command('revoke')
    .description('Revoke the WhatsApp session — deletes saved auth and disconnects the linked device')
    .action(async () => {
      const config = loadConfig();
      const wa = config.channels.whatsapp;
      if (!wa?.enabled) {
        console.log('');
        console.log(chalk.red('  WhatsApp is not enabled. Run `tota setup whatsapp` first.'));
        console.log('');
        process.exit(1);
      }

      const authDir = wa.authDir || join(homedir(), '.tota', 'whatsapp-auth');

      console.log('');
      console.log(chalk.bold.white('  WhatsApp Revoke'));
      console.log('');
      console.log(chalk.yellow('  This will:'));
      console.log(chalk.yellow('    • Delete saved session auth files'));
      console.log(chalk.yellow('    • Clear approved and pending numbers'));
      console.log(chalk.yellow('    • The linked device entry will disappear from your phone'));
      console.log('');

      const confirm = await ask(chalk.white('  Type "revoke" to confirm, or Enter to cancel: '));
      if (confirm.trim().toLowerCase() !== 'revoke') {
        console.log('');
        console.log(chalk.dim('  Cancelled.'));
        console.log('');
        process.exit(0);
      }

      // Delete auth files
      if (existsSync(authDir)) {
        try {
          rmSync(authDir, { recursive: true, force: true });
          console.log('');
          console.log(chalk.green(`  ✓ Auth files deleted (${authDir})`));
        } catch (err: any) {
          console.log(chalk.red(`  Failed to delete auth files: ${err.message}`));
          console.log(chalk.dim(`  Delete manually: rm -rf "${authDir}"`));
        }
      } else {
        console.log('');
        console.log(chalk.dim('  Auth directory did not exist — nothing to delete.'));
      }

      // Clear access lists
      wa.approved = [];
      wa.pending = [];
      if (wa.allowFrom) wa.allowFrom = wa.allowFrom.filter((p) => p === '*');
      saveConfig(config);
      console.log(chalk.green('  ✓ Approved/pending numbers cleared'));

      restartDaemonIfRunning('Restarting the background daemon to apply the change...');

      console.log('');
      console.log(chalk.dim('  Run `tota whatsapp link` to link a new device.'));
      console.log('');
      process.exit(0);
    });
}
