import chalk from 'chalk';

import {
  loadConfig,
  ensureCreatorField,
  getTotaHome,
  getTelegramApprovedUsers,
} from '../utils/config.js';
import type { ProviderName } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { Identity } from '../soul/identity.js';
import { ShortTermMemory, LongTermMemory, EpisodicMemory, migrateLegacyMemory } from '../memory/store.js';
import { UserMemoryStore } from '../memory/user-memory.js';
import { isBetterSqlite3Available } from '../memory/second-brain-db.js';
import { ProviderRegistry } from '../providers/registry.js';
import { Agent } from '../core/agent.js';
import { Scheduler } from '../core/scheduler.js';
import { ChannelRegistry } from '../channels/registry.js';
import { CLIChannel } from '../channels/cli.js';
import { TelegramChannel } from '../channels/telegram.js';
import { WhatsAppChannel } from '../channels/whatsapp.js';
import { UIChannel } from '../channels/ui-server.js';
import { TokenBudget } from '../utils/tokens.js';
import { CapabilityRegistry } from '../capabilities/registry.js';
import { SkillLoader } from '../skills/loader.js';
import { getManual } from '../utils/manual.js';
import { getDaemonStatus, tryAutoDaemonize } from './daemon.js';
import { installService, isServiceInstalled } from './service.js';
import { setGitHubToken } from '../utils/github.js';
import { startUpdateCheck, printUpdateNotice } from '../utils/update-check.js';
import { pkgVersion } from './version.js';
import { banner, hr } from './banner.js';
import { getProviderLabel } from './setup/providers.js';

export function autoDaemonize(): void {
  const daemon = getDaemonStatus();
  if (daemon.running && daemon.pid) {
    return;
  }

  if (!process.argv[1]) {
    console.log(chalk.dim('  Background mode not available in this context.'));
    return;
  }

  // When running via npx, process.argv[1] is a temporary cache path that is
  // cleaned up after the session — installing a scheduled task / service with
  // that path would point to a non-existent file after the npx session ends.
  const scriptPath = process.argv[1] ?? '';
  const isNpx = scriptPath.includes('_npx') || scriptPath.includes('npx-cache') || scriptPath.includes('.npm/_npx');
  if (isNpx) {
    console.log(chalk.dim('  Background mode skipped (running via npx — install globally with `npm i -g tota-agent`).'));
    return;
  }

  console.log(chalk.dim('  Setting up background mode...'));

  try {
    if (!isServiceInstalled()) {
      installService();
    }
  } catch {
    console.log(chalk.dim('  Service install skipped (can run `tota service install` later).'));
  }

  const ok = tryAutoDaemonize();
  if (ok) {
    const status = getDaemonStatus();
    console.log(chalk.green(`  ✓ tota is running in background (PID: ${status.pid})`));
    console.log(chalk.green('  ✓ Auto-starts on login. Auto-restarts on crash.'));
    console.log(chalk.dim('  Use `tota stop` to stop. `tota restart` to restart.'));
  } else {
    console.log(chalk.yellow('  Background mode not available. Run `tota start` to set it up.'));
  }
  console.log('');
}

export async function runAgent(isDaemon: boolean = false): Promise<void> {
  let config = loadConfig();
  config = ensureCreatorField(config);
  const name = config.identity.name;

  // Start update check in background (non-blocking — result awaited after banner)
  if (!isDaemon) {
    startUpdateCheck(getTotaHome(), pkgVersion);
  }

  if (!isDaemon) {
    banner();
    await printUpdateNotice();
    console.log(chalk.white(`  ${name} is waking up...`));
    console.log('');
  } else {
    logger.info(`${name} is waking up (daemon mode)...`);
  }

  const tokenBudget = new TokenBudget(config);
  const providers = new ProviderRegistry(config);

  if (!providers.hasProviders()) {
    if (isDaemon) {
      logger.error('No LLM providers available. Run `tota doctor` to configure providers.');
      return;
    }
    console.log(chalk.red('  No LLM providers available. Run `tota doctor` to configure providers.'));
    process.exit(1);
  }

  const available = providers.listAvailable();
  const defaultProvider = config.providers.default;
  const defaultModel = config.providers[defaultProvider]?.model ?? 'unknown';

  if (!isDaemon) {
    const providerSummary = available.map((provider) => {
      const key = provider as ProviderName;
      const label = getProviderLabel(key);
      const model = config.providers[key]?.model ?? '?';
      const marker = key === defaultProvider ? ' ← default' : '';
      return `${label}: ${model}${marker}`;
    });

    console.log('');
    console.log(chalk.bgMagenta.black.bold(` ⚡ ${getProviderLabel(defaultProvider)} · ${defaultModel} `));
    console.log(chalk.dim(`  Providers: ${providerSummary.join('  ·  ')}`));
  } else {
    logger.info({ providers: available, default: defaultProvider }, 'Providers loaded');
  }

  const skillLoader = new SkillLoader();
  const skills = skillLoader.discover();
  if (!isDaemon) {
    console.log(chalk.dim(`  Skills: ${skills.length > 0 ? skills.map(s => s.name).join(', ') : 'none installed'}`));
  }

  const scheduler = new Scheduler(config);

  const identity = new Identity();
  migrateLegacyMemory();
  const shortTerm = new ShortTermMemory(config);
  const longTerm = new LongTermMemory(config);
  const episodic = new EpisodicMemory(config);

  let userMemory: UserMemoryStore | null = null;
  if (config.memory.secondBrain?.enabled !== false && isBetterSqlite3Available()) {
    try {
      userMemory = new UserMemoryStore(config);
      if (!isDaemon) {
        console.log(chalk.dim(`  Second brain: enabled (${userMemory.getSummary().total} existing memories)`));
      } else {
        logger.info({ total: userMemory.getSummary().total }, 'Second brain loaded');
      }
    } catch (err) {
      logger.warn({ err }, 'Second brain initialization failed, continuing without it');
      userMemory = null;
    }
  } else if (config.memory.secondBrain?.enabled !== false && !isBetterSqlite3Available()) {
    logger.warn(
      'better-sqlite3 is not available — second brain memory is disabled. ' +
      'To enable it, install build tools (make, gcc/g++, python3) and ensure Node >= 20, then reinstall.'
    );
  }

  const channels = new ChannelRegistry(config);
  const capabilities = new CapabilityRegistry(skillLoader, scheduler, tokenBudget);

  capabilities.setChatCommandContext({
    toolNames: () => capabilities.getToolNames(),
    skillNames: () => skills.map(s => s.name),
    config: () => config,
    tokenBudget: () => tokenBudget,
    manual: () => getManual(),
    memorySummary: () => userMemory ? userMemory.getSummary() : { total: 0, byType: {}, learningPaused: false },
    memoryRecent: (limit?: number) => userMemory ? userMemory.getRecent(limit) : [],
    memorySearch: (query: string, limit?: number) => userMemory ? userMemory.search(query, limit) : [],
    memorySetLearningPaused: (paused: boolean) => { if (userMemory) userMemory.setLearningPaused(paused); },
    memoryClear: () => userMemory ? userMemory.clear() : 0,
  });

  capabilities.setSendFileHandler(async (filePath: string) => {
    const { channelId, channelType } = capabilities.getChannelContext();
    const telegram = channels.get('telegram');

    if (channelType === 'whatsapp') {
      const wa = channels.get('whatsapp') as WhatsAppChannel | undefined;
      if (wa?.isReady()) {
        await wa.sendFile(filePath, channelId || undefined);
        return;
      }
      // WhatsApp socket unavailable — do not silently reroute to another channel
      throw new Error('WhatsApp is not connected. File could not be sent.');
    }

    if (channelType === 'telegram' && telegram) {
      await telegram.sendFile(filePath, channelId);
      return;
    }

    if (channelType === 'ui') {
      const uiChannel = channels.get('ui');
      if (uiChannel) {
        await uiChannel.sendFile(filePath, channelId || undefined);
        return;
      }
    }

    // CLI / internal / scheduled tasks without an active channel
    const cli = channels.get('cli');
    if (cli) {
      await cli.sendFile(filePath);
    }
  });

  capabilities.setSendMessageHandler(async (content: string) => {
    // Route to whichever channel the current conversation is on.
    // If the agent is talking to someone via WhatsApp, proactive send_message
    // calls should go back to that same WhatsApp session — not Telegram.
    const { channelType, channelId } = capabilities.getChannelContext();

    if (channelType === 'whatsapp') {
      const wa = channels.get('whatsapp') as WhatsAppChannel | undefined;
      if (wa?.isReady()) {
        await wa.send(content, channelId || undefined);
        return;
      }
    }

    // Default: Telegram proactive notification
    const telegram = channels.get('telegram');
    if (!config.channels.telegram.enabled || !telegram) {
      throw new Error('No active channel to send to. Configure Telegram (`tota doctor`) or use whatsapp_send for WhatsApp.');
    }
    if (getTelegramApprovedUsers(config).length === 0) {
      throw new Error('Telegram has no approved users. Ask someone to send /start, then approve the request from tota.');
    }
    await telegram.send(content);
  });

  // Wire WhatsApp outbound send tool — restricted to approved numbers to prevent prompt-injection abuse
  capabilities.setWhatsAppSendHandler(async (phone: string, content: string) => {
    const wa = channels.get('whatsapp') as WhatsAppChannel | undefined;
    if (!wa || !config.channels.whatsapp?.enabled) {
      throw new Error('WhatsApp is not configured or not enabled. Run `tota setup whatsapp` to enable it.');
    }
    if (!wa.isReady()) {
      throw new Error('WhatsApp is not connected. Run `tota whatsapp link` to re-link your account.');
    }

    // Security: only send to numbers in the owner's allowFrom / approved list.
    // This prevents a prompt-injection attack from making the agent spam arbitrary numbers.
    const waConf = config.channels.whatsapp;
    const normalized = `+${phone.replace(/\D/g, '')}`;
    const isAllowed =
      (waConf.allowFrom ?? []).includes('*') ||
      (waConf.allowFrom ?? []).includes(normalized) ||
      (waConf.approved ?? []).some((u: { phone: string }) => u.phone === normalized);
    if (!isAllowed) {
      throw new Error(
        `Outbound blocked: ${normalized} is not in your WhatsApp approved list. ` +
        `Run \`tota whatsapp allow ${normalized}\` to add them first.`,
      );
    }

    await wa.send(content, phone);
  });

  if (process.env.GITHUB_TOKEN) {
    setGitHubToken(process.env.GITHUB_TOKEN);
  }

  capabilities.setConfig(config);

  // Wire vision handler — uses the default provider with image content blocks
  capabilities.setVisionHandler(async ({ imageSource, mimeType, isUrl, question }) => {
    const provider = providers.getDefault();
    if (!provider) return 'No provider configured for vision.';
    const { generateText } = await import('ai');
    const imageContent: any = isUrl
      ? { type: 'image', image: new URL(imageSource as string) }
      : { type: 'image', image: imageSource as Buffer, mimeType };
    const result = await generateText({
      model: provider.getModelInstance(),
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: question }] }],
    });
    return result.text || '(No description returned)';
  });

  // Delegate handler stub — replaced after agent is created below
  let delegateHandlerRef: ((task: string) => Promise<string>) | null = null;
  capabilities.setDelegateHandler(async (task: string) => {
    if (!delegateHandlerRef) return 'Agent not yet initialized.';
    return delegateHandlerRef(task);
  });

  capabilities.registerAll();
  await capabilities.registerMCPTools();

  const agent = new Agent(
    config, providers, identity, shortTerm, longTerm, episodic, userMemory, channels, tokenBudget, capabilities, scheduler,
  );

  // Wire actual delegate handler now that agent exists
  delegateHandlerRef = (task: string) => agent.runSubTask(task);

  // Wire crew handler
  capabilities.setCrewHandler((role, task, allowedTools) => agent.runCrewTask(role, task, allowedTools));

  // H4: Wire the scheduler into the UI channel so schedule POST/PATCH activate
  // immediately instead of waiting for a restart.
  const uiChannelForScheduler = channels.get('ui') as UIChannel | undefined;
  if (uiChannelForScheduler && 'setScheduler' in uiChannelForScheduler) {
    (uiChannelForScheduler as UIChannel).setScheduler(scheduler);
  }

  // Wire the multi-agent orchestrator into the UI channel so the Agents canvas
  // can fetch live state and receive lifecycle events.
  if (uiChannelForScheduler && 'setOrchestrator' in uiChannelForScheduler) {
    (uiChannelForScheduler as UIChannel).setOrchestrator(agent.getOrchestrator());
  }

  await agent.birth();
  await agent.wake();

  const cliChannel = channels.get('cli') as CLIChannel | undefined;
  const tgChannel = channels.get('telegram') as TelegramChannel | undefined;

  if (tgChannel) {
    tgChannel.setChatCommandContext(capabilities.getChatCommandContext()!);
  }

  capabilities.permissions.onAsk(async (prompt: string) => {
    const channelType = capabilities.permissions.getCurrentChannelType();
    const { channelId } = capabilities.getChannelContext();
    if (channelType === 'whatsapp' && waChannel) {
      return waChannel.askPermission(prompt, channelId || undefined);
    }
    if (channelType === 'telegram' && tgChannel) {
      return tgChannel.askPermission(prompt);
    }
    if (cliChannel) {
      return cliChannel.askPermission(prompt);
    }
    return 'no';
  });

  if (tgChannel) {
    tgChannel.setOnPermissionMode((mode, chatId) => {
      capabilities.permissions.setChannelMode(String(chatId), mode);
      if (mode === 'allow-all') {
        capabilities.permissions.addTempScope('/', true, true);
        logger.info({ chatId }, 'Telegram: Allow All mode set for session');
      } else {
        logger.info({ chatId }, 'Telegram: Ask Me mode set for session');
      }
    });
  }

  const waChannel = channels.get('whatsapp') as WhatsAppChannel | undefined;
  if (waChannel) {
    waChannel.setOnPermissionMode((mode, jid) => {
      capabilities.permissions.setChannelMode(jid, mode);
      if (mode === 'allow-all') {
        capabilities.permissions.addTempScope('/', true, true);
        logger.info({ jid }, 'WhatsApp: Allow All mode set for session');
      } else {
        logger.info({ jid }, 'WhatsApp: Ask Me mode set for session');
      }
    });
  }

  const activeCh = channels.getActiveChannels();
  const toolNames = capabilities.getToolNames();

  if (!isDaemon) {
    if (config.identity.creator) {
      console.log(chalk.dim(`  Creator: ${config.identity.creator}`));
    }
    hr();

    const mode = cliChannel && await cliChannel.askPermissionMode?.();
    if (mode === 'allow-all') {
      capabilities.permissions.setAutoApproveAll(true);
      capabilities.permissions.addTempScope('/', true, true);
    }

    console.log('');
    console.log(chalk.green(`  ${name} is live. Type a message and press Enter.`));
    console.log(chalk.dim('  Ctrl+C to exit  ·  /help for commands  ·  / for menu'));
    const uiCh = channels.get('ui');
    if (uiCh) {
      const uiPort = config.channels.ui?.port ?? 3002;
      console.log(chalk.cyan(`  Web UI: http://127.0.0.1:${uiPort}`));
    }
    console.log('');
    cliChannel?.showPrompt();
  } else {
    logger.info({ channels: activeCh, tools: toolNames }, 'tota is live (daemon mode)');
  }

  const shutdown = async () => {
    if (!isDaemon) {
      console.log('');
      console.log(chalk.dim(`  ${name} is shutting down...`));
    } else {
      logger.info('tota is shutting down (daemon mode)');
    }
    if (userMemory) {
      try {
        userMemory.consolidate();
        userMemory.close();
      } catch {}
    }
    await agent.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!isDaemon && process.platform !== 'win32') {
    process.on('SIGHUP', () => {
      logger.info('SIGHUP received — terminal closed. Daemonizing.');
      try {
        const result = tryAutoDaemonize();
        if (result) {
          logger.info(`Forked daemon. Foreground process exiting.`);
        } else {
          logger.warn('SIGHUP received but daemonization failed. Shutting down.');
        }
      } catch {
        logger.warn('SIGHUP received but daemonization failed. Shutting down.');
      }
      process.exit(0);
    });
  }
}
