import { join } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';

import {
  loadConfig,
  isSetupComplete,
  getTotaHome,
  getTelegramAccessSummary,
} from '../../utils/config.js';
import { SkillLoader } from '../../skills/loader.js';
import { getManual } from '../../utils/manual.js';
import { startBackground, stopDaemon, showLogs, getDaemonStatus, restartDaemon } from '../daemon.js';
import { installService, isServiceInstalled } from '../service.js';
import { runWithWatchdog } from '../watchdog.js';
import { enableUIChannel, openBrowser } from '../ui-command.js';
import { pkgVersion } from '../version.js';
import { banner } from '../banner.js';
import { getProviderLabel } from '../setup/providers.js';
import { printTelegramAccessState } from '../setup/telegram-pairing.js';
import { configure, SETUP_SECTIONS } from '../setup/wizard.js';
import { autoDaemonize, runAgent } from '../runtime.js';

/** Detect if we are running under npx (not a permanent global install). */
function isRunningViaNpx(): boolean {
  const scriptPath = process.argv[1] ?? '';
  // npx caches packages under _npx, npx-cache, or .npm/_npx directories
  return (
    scriptPath.includes('_npx') ||
    scriptPath.includes('npx-cache') ||
    process.env.npm_lifecycle_event === undefined && process.env.npm_execpath?.includes('npx') === true
  );
}

export function registerCoreCommands(program: Command): void {
  program
    .name('tota')
    .description('tota — An AI agent focused on safety, with permission‑based tooling, token budgets, and multi-channel access.')
    .version(pkgVersion)
    .option('-v, --verbose', 'Show debug logs')
    .action(async () => {
      if (isRunningViaNpx()) {
        console.log('');
        console.log(chalk.yellow('  ⚠  You are running tota via npx.'));
        console.log(chalk.dim('     The `tota` command will NOT be available after this session.'));
        console.log(chalk.dim('     To install permanently, run:'));
        console.log(chalk.cyan('       npm i -g tota-agent'));
        console.log(chalk.dim('     Then start with:'));
        console.log(chalk.cyan('       tota'));
        console.log('');
      }
      if (!isSetupComplete()) {
        await configure();
        autoDaemonize();
        return;
      }
      autoDaemonize();
      await runAgent();
    });

  program
    .command('start')
    .description('Start tota — runs as a daemon by default, use --foreground to attach to terminal')
    .option('-v, --verbose', 'Show debug logs')
    .option('-f, --foreground', 'Run in foreground (attached to terminal)')
    .option('-d, --detached', 'Run in background (daemon mode) — same as default')
    .option('--daemon', 'Internal flag for daemon child process')
    .action(async (opts) => {
      if (opts.daemon) {
        await runWithWatchdog(() => runAgent(true));
        return;
      }

      if (!isSetupComplete()) {
        await configure();
        autoDaemonize();
        return;
      }

      if (opts.foreground) {
        await runAgent();
        return;
      }

      startBackground();
    });

  program
    .command('stop')
    .description('Stop a background tota process')
    .action(() => {
      stopDaemon();
    });

  program
    .command('restart')
    .description('Restart a background tota process')
    .action(() => {
      restartDaemon();
    });

  program
    .command('up')
    .description('Start tota as a persistent daemon (same as `tota start`)')
    .action(async () => {
      if (!isSetupComplete()) {
        await configure();
        autoDaemonize();
        return;
      }

      const daemon = getDaemonStatus();
      if (daemon.running && daemon.pid) {
        console.log('');
        console.log(chalk.green(`  tota is already running (PID: ${daemon.pid})`));
        console.log(chalk.dim(`  Logs: ${daemon.logPath}`));
        console.log('');
        return;
      }

      if (!isServiceInstalled()) {
        console.log('');
        console.log(chalk.cyan('  Installing tota as a system service...'));
        installService();
      }

      startBackground();
    });

  program
    .command('logs')
    .description('Show recent daemon logs')
    .option('-f, --follow', 'Follow log output in real-time')
    .option('-n, --lines <n>', 'Number of lines to show', '100')
    .option('--clear', 'Clear the log file')
    .action((opts: { follow?: boolean; lines?: string; clear?: boolean }) => {
      showLogs({ follow: opts.follow, clear: opts.clear, lines: parseInt(opts.lines ?? '100', 10) });
    });

  program
    .command('setup [feature]')
    .description(
      'Re-run the setup wizard. Pass a feature to configure just that section.\n' +
      '  Features: identity, llm, telegram, github, websearch, api, budget'
    )
    .action(async (feature?: string) => {
      const validFeatures = Object.keys(SETUP_SECTIONS);
      if (feature && !validFeatures.includes(feature)) {
        console.log('');
        console.log(chalk.red(`  Unknown feature: ${feature}`));
        console.log(chalk.dim(`  Available: ${validFeatures.join(', ')}`));
        console.log('');
        process.exit(1);
      }
      const config = isSetupComplete() ? loadConfig() : undefined;
      await configure(config, feature);
      process.exit(0);
    });

  program
    .command('doctor [feature]')
    .description(
      'Reconfigure tota — change keys, name, settings (Enter to keep current).\n' +
      '  Optionally pass a feature: identity, llm, telegram, github, websearch, api, budget'
    )
    .action(async (feature?: string) => {
      const validFeatures = Object.keys(SETUP_SECTIONS);
      if (feature && !validFeatures.includes(feature)) {
        console.log('');
        console.log(chalk.red(`  Unknown feature: ${feature}`));
        console.log(chalk.dim(`  Available: ${validFeatures.join(', ')}`));
        console.log('');
        process.exit(1);
      }
      const config = isSetupComplete() ? loadConfig() : undefined;
      await configure(config, feature);
      process.exit(0);
    });

  program
    .command('status')
    .description('Show current configuration and daemon status')
    .action(() => {
      const config = loadConfig();
      const home = getTotaHome();
      const skillLoader = new SkillLoader();
      const skills = skillLoader.discover();
      const daemon = getDaemonStatus();
      banner();
      console.log(`  Name:     ${chalk.cyan(config.identity.name)}`);
      console.log(`  Owner:    ${chalk.white(config.identity.owner || '(not set)')}`);
      if (config.identity.creator) {
        console.log(`  Creator:  ${chalk.white(config.identity.creator)}`);
      }
      console.log(`  Provider: ${chalk.white(getProviderLabel(config.providers.default))}`);
      console.log(`  Telegram: ${config.channels.telegram.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`);
      console.log(`  Telegram Access: ${chalk.white(getTelegramAccessSummary(config))}`);
      const waEnabled = config.channels.whatsapp?.enabled ?? false;
      const waApproved = config.channels.whatsapp?.approved?.length ?? 0;
      const waPending = config.channels.whatsapp?.pending?.length ?? 0;
      console.log(`  WhatsApp: ${waEnabled ? chalk.green('enabled') : chalk.dim('disabled')}${waEnabled ? chalk.dim(` · ${waApproved} approved · ${waPending} pending`) : ''}`);
      console.log(`  Skills:   ${skills.length > 0 ? chalk.green(skills.map(s => s.name).join(', ')) : chalk.dim('none')}`);
      console.log(`  Budget:   ${chalk.white(config.tokens.dailyBudget.toLocaleString())} tokens/day`);
      console.log(`  Setup:    ${isSetupComplete() ? chalk.green('complete') : chalk.red('not done')}`);
      console.log(`  Daemon:   ${daemon.running ? chalk.green(`running (PID: ${daemon.pid})`) : chalk.dim('not running')}`);
      console.log(`  Home:     ${chalk.dim(home)}`);
      printTelegramAccessState(config);
      console.log('');
    });

  program
    .command('help')
    .description('Show capabilities and commands manual')
    .action(() => {
      console.log(getManual());
    });

  program
    .command('upgrade')
    .description('Upgrade tota to the latest version from npm')
    .action(async () => {
      console.log('');
      console.log(chalk.cyan(`  tota ${chalk.white(`v${pkgVersion}`)}`));
      console.log('');

      const daemon = getDaemonStatus();
      if (daemon.running) {
        console.log(chalk.dim('  Stopping background daemon...'));
        stopDaemon();
        await new Promise((r) => setTimeout(r, 1000));
        console.log(chalk.green('  ✓ Daemon stopped'));
      }

      console.log(chalk.dim('  Checking for latest version...'));
      const { execSync } = await import('node:child_process');

      let latestVersion = '';
      try {
        latestVersion = execSync('npm view tota-agent version', { encoding: 'utf-8' }).trim();
      } catch {
        console.log(chalk.red('  ✗ Failed to fetch latest version from npm'));
        console.log('');
        return;
      }

      console.log(chalk.dim(`  Latest: v${latestVersion}`));

      if (latestVersion === pkgVersion) {
        console.log(chalk.green(`  ✓ Already on the latest version (v${pkgVersion})`));
        console.log('');
        return;
      }

      console.log(chalk.dim(`  Upgrading v${pkgVersion} → v${latestVersion}...`));
      console.log('');

      try {
        execSync('npm rm -g tota-agent', { stdio: 'pipe' });
      } catch {
        try {
          const globalDir = execSync('npm root -g', { encoding: 'utf-8' }).trim();
          const pkgDir = join(globalDir, '@manu14357', 'tota-agent');
          const { rmSync } = await import('node:fs');
          try { rmSync(pkgDir, { recursive: true, force: true }); } catch {}
        } catch {}
      }

      try {
        execSync('npm i -g tota-agent@latest', { stdio: 'inherit' });
        console.log('');
        console.log(chalk.green(`  ✓ Upgraded to v${latestVersion}`));
        console.log(chalk.dim('  Run `tota` to start the new version.'));
      } catch (err: unknown) {
        console.log('');
        const errMsg = err instanceof Error ? err.message : String(err);
        const isGitMissing = errMsg.includes('spawn git') || (errMsg.includes('ENOENT') && errMsg.includes('git'));
        const isTermux = process.env.PREFIX?.includes('com.termux') || process.env.TERMUX_VERSION !== undefined;

        console.log(chalk.red('  ✗ Upgrade failed.'));
        if (isGitMissing) {
          console.log(chalk.yellow('\n  git not found — required to install a dependency (libsignal-node).'));
          if (isTermux) {
            console.log(chalk.dim('\n  Fix for Termux (run these in order):'));
            console.log(chalk.cyan('    pkg install git'));
            console.log(chalk.cyan('    git config --global url.https://github.com/.insteadOf "git@github.com:"'));
            console.log(chalk.cyan('    npm rm -g tota-agent && npm i -g tota-agent'));
          } else {
            console.log(chalk.dim('\n  Install git for your platform, then run:'));
            console.log(chalk.dim('    macOS:   brew install git'));
            console.log(chalk.dim('    Ubuntu:  sudo apt-get install git'));
            console.log(chalk.dim('    Windows: winget install Git.Git'));
            console.log(chalk.cyan('\n    npm rm -g tota-agent && npm i -g tota-agent'));
          }
        } else {
          console.log(chalk.dim('  Try manually:'));
          console.log(chalk.dim('    npm rm -g tota-agent && npm i -g tota-agent'));
        }
      }

      console.log('');
    });

  program
    .command('ui')
    .description('Start tota with a local web UI at http://127.0.0.1:<port> (default 3002)')
    .option('-p, --port <port>', 'Port to listen on (default 3002)', '3002')
    .option('--no-open', 'Do not open the browser automatically')
    .option('--attach', 'Attach UI to an existing running agent (via API channel on port 3001) instead of booting a new one')
    .action(async (opts: { port: string; open: boolean; attach: boolean }) => {
      if (!isSetupComplete()) {
        console.log('');
        console.log(chalk.yellow('  tota is not set up yet. Run `tota setup` first.'));
        console.log('');
        process.exit(1);
      }

      const port = parseInt(opts.port, 10) || 3002;

      if (opts.attach) {
        // Attach mode: spin up UI-only proxy to the existing API channel
        const cfg = loadConfig();
        const apiPort = cfg.channels.api?.port ?? 3001;

        console.log('');
        console.log(chalk.bold.cyan('  tota UI') + chalk.dim('  (attach mode)'));
        console.log(chalk.dim(`  Proxying chat to agent on port ${apiPort}`));
        console.log('');

        const { UIChannel } = await import('../../channels/ui-server.js');
        const uiChannel = new UIChannel(port);

        uiChannel.onMessage(async (msg) => {
          try {
            const res = await fetch(`http://127.0.0.1:${apiPort}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: msg.content }),
            });
            if (res.ok) {
              const data = (await res.json()) as { response: string };
              await uiChannel.send(data.response, msg.channelId);
            } else {
              await uiChannel.send(`[Error: agent returned ${res.status}]`, msg.channelId);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await uiChannel.send(`[Error: could not reach agent — ${message}]`, msg.channelId);
          }
        });

        await uiChannel.start();
        const url = `http://127.0.0.1:${uiChannel.getPort()}`;
        console.log(chalk.green(`  ✓ UI running at ${chalk.bold(url)}`));
        console.log(chalk.dim('  Press Ctrl+C to stop.'));
        console.log('');

        if (opts.open !== false) {
          setTimeout(() => openBrowser(url), 800);
        }

        const stop = async () => {
          console.log('');
          console.log(chalk.dim('  Shutting down UI…'));
          await uiChannel.stop();
          process.exit(0);
        };
        process.once('SIGINT', () => { void stop(); });
        process.once('SIGTERM', () => { void stop(); });
        return;
      }

      // Standalone mode: enable UI channel and run the full agent
      enableUIChannel(port);
      const url = `http://127.0.0.1:${port}`;
      console.log('');
      console.log(chalk.bold.cyan('  tota UI'));
      console.log(chalk.dim(`  Starting agent + UI at ${url}`));
      console.log('');

      if (opts.open !== false) {
        // Open browser after 2 s to give the server time to bind
        setTimeout(() => openBrowser(url), 2000);
      }

      await runAgent();
    });
}
