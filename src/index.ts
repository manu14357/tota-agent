import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from 'commander';
import readline from 'node:readline';
import chalk from 'chalk';

import {
  loadConfig,
  saveConfig,
  isSetupComplete,
  getTotaHome,
  ensureCreatorField,
  clearTelegramAccess,
  isProviderConfigured,
  getTelegramAccessSummary,
  getTelegramApprovedUsers,
  getTelegramPendingRequests,
  approveTelegramPendingRequest,
  approveTelegramPendingRequestByPairingCode,
  rejectTelegramPendingRequest,
  removeTelegramUser,
  promoteTelegramUserToAdmin,
  demoteTelegramAdmin,
  hasTelegramAdmins,
} from './utils/config.js';
import type { TotaConfig } from './utils/config.js';
import type { ProviderName } from './utils/config.js';
import { logger } from './utils/logger.js';
import { Identity } from './soul/identity.js';
import { ShortTermMemory, LongTermMemory, EpisodicMemory, migrateLegacyMemory } from './memory/store.js';
import { UserMemoryStore } from './memory/user-memory.js';
import { isBetterSqlite3Available } from './memory/second-brain-db.js';
import { ProviderRegistry } from './providers/registry.js';
import { Agent } from './core/agent.js';
import { Scheduler } from './core/scheduler.js';
import { ChannelRegistry } from './channels/registry.js';
import { CLIChannel } from './channels/cli.js';
import { TelegramChannel } from './channels/telegram.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { TokenBudget } from './utils/tokens.js';
import { CapabilityRegistry } from './capabilities/registry.js';
import { SkillLoader } from './skills/loader.js';
import { getManual } from './utils/manual.js';
import { startBackground, stopDaemon, showLogs, getDaemonStatus, restartDaemon, tryAutoDaemonize } from './cli/daemon.js';
import { installService, uninstallService, showServiceStatus, isServiceInstalled } from './cli/service.js';
import { runWithWatchdog } from './cli/watchdog.js';
import { setGitHubToken } from './utils/github.js';
import { selectWithArrowKeys } from './utils/arrow-select.js';
import { ProviderModelFetchError, fetchProviderModelCatalog } from './utils/provider-models.js';
import { startUpdateCheck, printUpdateNotice, enforceUpToDate } from './utils/update-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgVersion = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version;

// Prevent Baileys internal async errors (e.g. pre-key upload timeouts) from
// crashing the whole process with an unhandled rejection.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  // Silently ignore known Baileys timeout/close errors that are not actionable
  if (msg === 'Timed Out' || msg === 'Connection Closed' || msg === 'Connection Terminated') return;
  logger.error({ reason }, 'Unhandled promise rejection');
});

function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/** Strip ANSI escape codes to measure visible character width. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[\d;]*m/g, '');
}

/** Center a (possibly ANSI-colored) string within `width` columns. */
function centerLine(coloredText: string, width: number): string {
  const visible = stripAnsi(coloredText).length;
  const pad = Math.max(0, Math.floor((width - visible) / 2));
  return ' '.repeat(pad) + coloredText;
}

function hr() {
  const cols = Math.min(getTerminalWidth(), 80);
  console.log(chalk.dim('─'.repeat(cols)));
}

// ── ASCII art banner (braille) ─────────────────────────────────────────────────
const BANNER_ART_LINES = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣤⣶⡶⢶⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣶⣿⣶⠶⠬⠉⠢⠙⠻⢿⣶⣶⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⣿⠟⠋⠁⣏⡴⣠⡴⠂⠀⠀⠀⠀⠐⠍⠛⢿⣷⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢀⢀⣀⣤⣤⣀⣀⠀⢠⣾⡿⠋⠀⠀⠀⠀⠈⠃⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢻⣿⣦⣠⣤⣶⣶⣶⣤⣤⣄⠀⠀⠀⠀',
  '⠀⠀⢀⣤⣾⠿⠛⠋⠙⠛⠛⢿⣿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠹⣿⡟⠋⠉⠀⣀⣉⡙⠻⣿⣤⠀⠀',
  '⠀⢠⣾⢟⣡⣶⣒⠒⠶⣤⡀⣼⠛⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣤⣀⠀⠀⢹⣿⣤⡶⠋⣉⠬⠝⠷⣌⢿⣷⠀',
  '⠀⣿⠋⡞⠉⠀⠀⠉⠲⡌⢻⡏⡄⠀⠀⠰⠞⠓⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠀⠀⢸⣏⢠⠞⠁⠀⠀⠀⠈⡆⢿⡇',
  '⢸⣿⢰⠀⠀⠀⠀⠀⢀⡨⢾⣯⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣤⡀⠀⠀⠀⣿⢩⠶⠄⠀⠀⠀⠀⢹⢸⣿',
  '⠀⣿⡘⡀⠀⠀⠀⠐⠋⢙⠾⣯⠀⠀⠀⣴⢿⣿⡿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣛⣿⣿⣻⡆⠀⠀⣿⣈⢢⠀⠀⠀⠀⠀⡞⣼⡟',
  '⠀⢻⣧⠳⡀⠀⠀⠀⢰⣣⢄⣿⠀⠀⢸⡇⣿⣿⣷⣿⣧⠀⠠⠖⠛⠉⠛⠲⡄⠀⣿⣿⣿⣿⣇⡇⠀⠀⢹⡆⠙⠃⠀⠀⠀⡴⢠⣿⠃',
  '⠀⠀⠻⣷⣝⠢⣄⠀⠈⠀⢸⣏⡇⠀⠀⠳⣝⣿⣿⣿⠏⠀⠠⠒⠉⠁⠈⠳⠀⠀⠘⠛⠛⠻⠊⠀⠀⠀⢸⡧⠀⠀⠀⡴⢊⣴⡿⠃⠀',
  '⠀⠀⠀⠙⠿⣷⡘⣄⠀⠀⢀⣿⡴⡀⠀⠒⠁⠁⠀⠀⠀⢷⣤⠀⠒⠀⠒⣄⠀⣰⠆⠀⠀⠀⠀⠀⠀⣰⣾⠇⣀⡀⠔⣱⡿⠛⠁⠀⠀',
  '⠀⠀⠀⠀⠀⠙⢿⣮⣉⣈⣉⣨⣿⣗⣤⡀⠀⠀⠀⣴⣿⡛⠟⠨⡉⠲⠀⠠⣴⠏⠀⠀⠀⠀⠀⣐⣾⣿⣷⣧⣤⣴⡾⠟⠁⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠈⠉⠛⠛⠛⠋⠉⠙⠻⣷⣶⣤⣤⣽⣌⠷⢀⠀⢀⣀⣤⣾⣫⣤⣤⡴⢶⣾⠟⠛⠉⠀⠀⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠂⢀⡐⠢⣌⡛⠛⠛⠛⠉⣡⠖⠒⡺⠉⠙⠲⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⣿⡇⡀⠀⠀⠀⠈⠳⣍⠉⠉⠁⠀⣠⠋⠀⠀⠠⡀⡈⣿⣤⣀⣴⠶⢿⡆⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡶⠿⡛⠻⣷⣦⣧⡄⠀⠀⠰⠀⠹⣦⠄⠀⣼⢡⡤⠀⠀⠁⢰⣧⡶⡟⢛⡗⢶⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⢸⡟⢹⠶⠛⠒⢇⠹⣿⡴⡀⣀⠤⠀⠀⢻⣆⣼⠇⠈⠉⠀⢀⠠⢺⡟⢡⢕⡚⠓⢶⣹⣷⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⢸⣯⢹⠠⠊⠀⠈⡇⣿⣧⠈⣂⣩⣤⣠⢤⣿⣿⠤⣀⣤⣄⠀⡇⣿⡇⡇⠀⠈⠳⣸⢹⣿⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⡠⠜⠛⢷⣷⣤⣤⣜⣵⣧⣿⣿⣉⣇⣀⣻⣠⣿⣯⣄⣏⠀⣸⣉⣿⣷⣧⣑⣤⣤⣴⣿⠟⠋⢤⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠈⠑⠒⠀⠤⠭⠭⠍⢉⣀⣀⣈⣙⣛⣛⣛⣉⣀⣈⣉⣛⣛⣛⣋⣁⣀⣈⠩⠭⠩⠭⠄⠒⠒⠉⠀⠀⠀⠀⠀⠀⠀',
];

const TOTA_ASCII = [
  '████████╗ ██████╗ ████████╗ █████╗',
  '╚══██╔══╝██╔═══██╗╚══██╔══╝██╔══██╗',
  '   ██║   ██║   ██║   ██║   ███████║',
  '   ██║   ██║   ██║   ██║   ██╔══██║',
  '   ██║   ╚██████╔╝   ██║   ██║  ██║',
  '   ╚═╝    ╚═════╝    ╚═╝   ╚═╝  ╚═╝',
  '        [ T O T A - A G E N T ]',
].filter(l => l.trim());

// ── Compact ASCII art for small screens (fits in ~40 cols) ────────────────────
// Scaled-down elephant using simple block characters
const BANNER_ART_SMALL = [
  '   ░░░░░░░░░░░░░░░░░░░░░░░░░   ',
  '  ░░  ╔═══════════════╗  ░░░   ',
  ' ░░   ║  ◉         ◉  ║   ░░  ',
  ' ░░   ║   ~  ___  ~   ║   ░░  ',
  ' ░░   ╚══╗         ╔══╝   ░░  ',
  '  ░░░░░░ ╚═════════╝ ░░░░░░   ',
  '  ░░  ║ ░░░░░░░░░░░ ║  ░░     ',
  '  ░░  ║ ║  ░░░░░  ║ ║  ░░     ',
  '   ░  ╚═╝  ░░░░░  ╚═╝  ░      ',
];

// ── Side-by-side renderer (wide terminals ≥ 100 cols) ────────────────────────
function printSideBySide(artLines: string[], textLines: string[], artWidth: number = 50): void {
  const textOffset = Math.max(0, Math.floor((artLines.length - textLines.length) / 2));
  for (let i = 0; i < artLines.length; i++) {
    const art = artLines[i] ?? '';
    const textIdx = i - textOffset;
    const text = (textIdx >= 0 && textIdx < textLines.length) ? textLines[textIdx] : '';
    const pad = ' '.repeat(Math.max(0, artWidth - stripAnsi(art).length));
    if (text) {
      console.log(`  ${art}${pad}  ${text}`);
    } else {
      console.log(`  ${art}`);
    }
  }
}

// ── Stacked renderer: art on top, text below (medium terminals 60–99 cols) ───
function printStacked(artLines: string[], textLines: string[], cols: number): void {
  for (const line of artLines) {
    console.log(centerLine(line, cols));
  }
  console.log('');
  for (const line of textLines) {
    console.log(centerLine(line, cols));
  }
}

// ── Small screen renderer: compact art on top, text below (< 60 cols) ────────
function printSmall(textLines: string[], cols: number): void {
  // Compact elephant block — fits ~34 visible chars wide
  const elephant = [
    '   .  .   .  .',
    "  ( `  ) ( ` )",
    ' (  (  )  (  ) )',
    "  `.   _____  .'",
    "    `-| TOT |-'",
    "      |  A  |",
    "   ___| ___ |___",
    "  |   |/   \\|   |",
    "  |___|     |___|",
  ];
  for (const line of elephant) {
    console.log(centerLine(chalk.cyan(line), cols));
  }
  console.log('');
  for (const line of textLines) {
    console.log(centerLine(line, cols));
  }
}

// ── Minimal renderer: text only, no art (very narrow < 38 cols) ──────────────
function printMinimal(textLines: string[], cols: number): void {
  for (const line of textLines) {
    console.log(centerLine(line, cols));
  }
}

// ── Determine which TOTA text lines to show based on available width ──────────
function getTotaTextLines(cols: number, pkgVer: string, subtitle: string, byline: string): string[] {
  // The widest TOTA ASCII line is ~38 chars. For narrow screens use a compact label.
  if (cols >= 60) {
    return [
      ...TOTA_ASCII.map(l => chalk.bold.cyan(l)),
      '',
      chalk.white(subtitle),
      chalk.dim(`v${pkgVer} · ${byline}`),
    ];
  }
  if (cols >= 38) {
    return [
      chalk.bold.cyan('[ T O T A - A G E N T ]'),
      '',
      chalk.white(subtitle),
      chalk.dim(`v${pkgVer}`),
      chalk.dim(byline),
    ];
  }
  return [
    chalk.bold.cyan('[ TOTA ]'),
    chalk.dim(`v${pkgVer}`),
  ];
}

function banner() {
  const cols = getTerminalWidth();
  const textLines = getTotaTextLines(
    cols,
    pkgVersion,
    'an AI agent for personal tasks',
    'github.com/manu14357/tota-agent',
  );

  console.log('');
  if (cols >= 100) {
    // Wide: braille art left, TOTA text right
    const coloredArt = BANNER_ART_LINES.map(l => chalk.cyan(l));
    printSideBySide(coloredArt, textLines);
  } else if (cols >= 60) {
    // Medium: braille art on top, TOTA text below
    const coloredArt = BANNER_ART_LINES.map(l => chalk.cyan(l));
    printStacked(coloredArt, textLines, cols);
  } else if (cols >= 38) {
    // Small: compact art on top, compact TOTA label below
    printSmall(textLines, cols);
  } else {
    // Very narrow: text only
    printMinimal(textLines, cols);
  }
  console.log('');
}

function splashScreen() {
  const cols = getTerminalWidth();
  const textLines = getTotaTextLines(
    cols,
    pkgVersion,
    'an AI agent for personal tasks',
    'github.com/manu14357/tota-agent',
  );

  console.log('');
  if (cols >= 100) {
    const coloredArt = BANNER_ART_LINES.map(l => chalk.cyan(l));
    printSideBySide(coloredArt, textLines);
  } else if (cols >= 60) {
    const coloredArt = BANNER_ART_LINES.map(l => chalk.cyan(l));
    printStacked(coloredArt, textLines, cols);
  } else if (cols >= 38) {
    printSmall(textLines, cols);
  } else {
    printMinimal(textLines, cols);
  }
  console.log('');
}

async function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

const PROVIDER_OPTIONS: Array<{ key: ProviderName; label: string }> = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'grok', label: 'Grok (xAI)' },
  { key: 'ollamaCloud', label: 'Ollama Cloud' },
  { key: 'ollamaLocal', label: 'Ollama Local' },
  { key: 'openaiCompat', label: 'OpenAI Compilations' },
  { key: 'mimo', label: 'MiMo (Xiaomi)' },
  { key: 'mimoTokenPlan', label: 'MiMo Token Plan (Xiaomi)' },
];

function getConfiguredProviderNames(config: TotaConfig): ProviderName[] {
  return PROVIDER_OPTIONS
    .map((option) => option.key)
    .filter((key) => isProviderConfigured(config.providers[key]));
}

function getProviderLabel(name: ProviderName): string {
  return PROVIDER_OPTIONS.find((option) => option.key === name)?.label || name;
}

function parseProviderSelection(input: string): ProviderName[] | null {
  const values = input.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) return [];

  const selected: ProviderName[] = [];
  for (const value of values) {
    const index = parseInt(value, 10);
    if (isNaN(index) || index < 1 || index > PROVIDER_OPTIONS.length) {
      return null;
    }
    const provider = PROVIDER_OPTIONS[index - 1].key;
    if (!selected.includes(provider)) {
      selected.push(provider);
    }
  }
  return selected;
}

async function chooseProvidersToConfigure(config: TotaConfig, isReconfig: boolean): Promise<ProviderName[]> {
  const configured = getConfiguredProviderNames(config);

  while (true) {
    for (let i = 0; i < PROVIDER_OPTIONS.length; i++) {
      const option = PROVIDER_OPTIONS[i];
      const status = configured.includes(option.key) ? ' (configured)' : '';
      console.log(chalk.white(`    ${i + 1}. ${option.label}${status}`));
    }
    console.log('');

    const prompt = isReconfig
      ? chalk.white('  Choose providers to configure [comma-separated, Enter keeps current]: ')
      : chalk.white('  Choose providers to configure [comma-separated, Enter for DeepSeek]: ');

    const input = await ask(prompt);
    const parsed = parseProviderSelection(input);
    if (parsed === null) {
      console.log(chalk.red('  Please choose valid provider numbers, like `1` or `1,3,5`.'));
      console.log('');
      continue;
    }

    if (parsed.length > 0) return parsed;
    if (!isReconfig) return ['deepseek'];
    return configured.length > 0 ? configured : ['deepseek'];
  }
}

async function chooseDefaultProvider(config: TotaConfig): Promise<void> {
  const configured = getConfiguredProviderNames(config);

  if (configured.length === 0) {
    return;
  }

  if (configured.length === 1) {
    config.providers.default = configured[0];
    console.log(chalk.dim(`  Default provider set to ${getProviderLabel(configured[0])}`));
    return;
  }

  const suggested = configured.includes('deepseek') ? 'deepseek' : configured[0];

  console.log('');
  console.log(chalk.bold.white('  Default Provider'));
  console.log(chalk.dim('  Select the LLM provider tota should use first.'));
  console.log('');
  for (let i = 0; i < configured.length; i++) {
    const provider = configured[i];
    const recommended = provider === suggested ? ' (recommended)' : '';
    const current = provider === config.providers.default ? ' (current)' : '';
    console.log(chalk.white(`    ${i + 1}. ${getProviderLabel(provider)}${recommended}${current}`));
  }
  console.log('');

  while (true) {
    const choice = await ask(chalk.white(`  Choose [1-${configured.length}] [Enter for ${getProviderLabel(suggested)}]: `));
    if (!choice) {
      config.providers.default = suggested;
      return;
    }

    const num = parseInt(choice, 10);
    if (num >= 1 && num <= configured.length) {
      config.providers.default = configured[num - 1];
      return;
    }

    console.log(chalk.red('  Please choose a valid number from the list above.'));
  }
}

function looksLikeToken(value: string, minLength: number = 20): boolean {
  return value.length >= minLength && !/\s/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function validateApiKey(provider: ProviderName, value: string): string | null {
  if (provider === 'openai') {
    return /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'OpenAI keys must start with `sk-`, `sk-proj-`, or `sk-svcacct-`.';
  }

  if (provider === 'anthropic') {
    return /^sk-ant-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'Anthropic keys must start with `sk-ant-`.';
  }

  if (provider === 'deepseek') {
    return /^sk-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'DeepSeek keys must start with `sk-`.';
  }

  if (provider === 'grok') {
    return looksLikeToken(value)
      ? null
      : 'Grok keys must look like a real API token: long, no spaces, and not plain text.';
  }

  if (provider === 'ollamaCloud') {
    return looksLikeToken(value)
      ? null
      : 'Ollama Cloud keys must look like a real API token: long, no spaces, and not plain text.';
  }

  if (provider === 'mimo') {
    return /^sk-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'MiMo keys must start with `sk-`.';
  }

  if (provider === 'mimoTokenPlan') {
    return /^tp-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'MiMo Token Plan keys must start with `tp-`.';
  }

  return null;
}

function validateBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Base URL must start with http:// or https://.';
    }
    return null;
  } catch {
    return 'Please enter a valid URL.';
  }
}

function validateModelName(value: string): string | null {
  if (!value.trim()) return 'Model name is required.';
  if (/\s/.test(value)) return 'Model name cannot contain spaces.';
  return null;
}

async function chooseProviderModel(
  providerLabel: string,
  recommendedModel: string,
  models: string[],
): Promise<string> {
  const selection = await selectWithArrowKeys(
    `${providerLabel} Models`,
    [
      {
        value: '__default__',
        label: `Use provider default (${recommendedModel})`,
      },
      ...models.map((model) => ({
        value: model,
        label: model,
      })),
      {
        value: '__custom__',
        label: 'Enter a custom model name',
      },
    ],
  );

  if (!selection || selection === '__default__') {
    return recommendedModel;
  }

  if (selection !== '__custom__') {
    return selection;
  }

  while (true) {
    const customModel = await ask(chalk.white(`  ${providerLabel} model [Enter or "none" for ${recommendedModel}]: `));
    if (!customModel || customModel.toLowerCase() === 'none') {
      return recommendedModel;
    }

    const error = validateModelName(customModel);
    if (!error) {
      return customModel;
    }

    console.log(chalk.red(`  ${error}`));
  }
}

async function promptApiKeyWithModelSelection(
  config: TotaConfig,
  provider: ProviderName,
  providerLabel: string,
  prompt: string,
  isReconfig: boolean,
): Promise<{ apiKey?: string; model?: string; skipped: boolean }> {
  const existingConfig = config.providers[provider];

  while (true) {
    const value = await ask(prompt);
    if (!value) {
      if (isReconfig && existingConfig.apiKey) {
        return {
          apiKey: existingConfig.apiKey,
          model: existingConfig.model,
          skipped: true,
        };
      }

      return { skipped: true };
    }

    const formatError = validateApiKey(provider, value);
    if (formatError) {
      console.log(chalk.red(`  ${formatError}`));
      continue;
    }

    console.log(chalk.dim(`  Validating ${providerLabel} and fetching models...`));
    try {
      const catalog = await fetchProviderModelCatalog(provider, {
        ...existingConfig,
        apiKey: value,
      });
      const model = await chooseProviderModel(
        providerLabel,
        catalog.recommendedModel,
        catalog.models,
      );
      return { apiKey: value, model, skipped: false };
    } catch (error) {
      const message = error instanceof ProviderModelFetchError
        ? error.message
        : `tota could not fetch models for ${providerLabel}. Please re-enter the key.`;
      console.log(chalk.red(`  ${message}`));
    }
  }
}

async function promptOllamaLocalModelSelection(config: TotaConfig): Promise<{ baseUrl?: string; model?: string; skipped: boolean }> {
  const existingConfig = config.providers.ollamaLocal;

  while (true) {
    const baseUrl = (await promptValidatedValue(
      chalk.white(`  Ollama Local base URL [${existingConfig.baseUrl}]: `),
      validateBaseUrl,
      existingConfig.baseUrl,
    ))!;

    console.log(chalk.dim('  Fetching Ollama Local models...'));
    try {
      const catalog = await fetchProviderModelCatalog('ollamaLocal', {
        ...existingConfig,
        baseUrl,
      });
      const model = await chooseProviderModel(
        'Ollama Local',
        catalog.recommendedModel,
        catalog.models,
      );
      return { baseUrl, model, skipped: false };
    } catch (error) {
      const message = error instanceof ProviderModelFetchError
        ? error.message
        : 'tota could not fetch Ollama Local models. Please check the base URL and try again.';
      console.log(chalk.red(`  ${message}`));
    }
  }
}

async function promptOpenAICompatSetup(config: TotaConfig, isReconfig: boolean): Promise<{ baseUrl?: string; apiKey?: string; model?: string; skipped: boolean }> {
  const existingConfig = config.providers.openaiCompat;

  const baseUrl = (await promptValidatedValue(
    chalk.white(`  Server base URL${isReconfig && existingConfig.baseUrl ? ` [${existingConfig.baseUrl}]` : ''}: `),
    validateBaseUrl,
    existingConfig.baseUrl,
  ))!;
  if (!baseUrl) return { skipped: true };

  const apiKeyPrompt = isReconfig && existingConfig.apiKey
    ? chalk.white(`  API key (optional, press Enter to keep current) [${maskKey(existingConfig.apiKey)}]: `)
    : chalk.white('  API key (optional, press Enter to skip): ');
  const apiKey = await ask(apiKeyPrompt);
  const resolvedApiKey = apiKey || existingConfig.apiKey || '';

  console.log(chalk.dim('  Fetching models from server...'));
  try {
    const catalog = await fetchProviderModelCatalog('openaiCompat', {
      ...existingConfig,
      baseUrl,
      apiKey: resolvedApiKey,
    });
    const model = await chooseProviderModel(
      'OpenAI Compilations',
      catalog.recommendedModel,
      catalog.models,
    );
    return { baseUrl, apiKey: resolvedApiKey, model, skipped: false };
  } catch {
    console.log(chalk.yellow('  Could not fetch models from this server. You can enter the model name manually.'));
    const model = (await promptValidatedValue(
      chalk.white('  Model name: '),
      validateModelName,
    ))!;
    if (!model) return { baseUrl, apiKey: resolvedApiKey, model: existingConfig.model, skipped: false };
    return { baseUrl, apiKey: resolvedApiKey, model, skipped: false };
  }
}

async function promptValidatedValue(
  prompt: string,
  validator: (value: string) => string | null,
  existingValue?: string,
  options?: { allowSkip?: boolean },
): Promise<string | undefined> {
  while (true) {
    const value = await ask(prompt);
    if (!value) {
      if (existingValue) return existingValue;
      if (options?.allowSkip) return undefined;
      console.log(chalk.red('  A value is required here.'));
      continue;
    }

    const error = validator(value);
    if (!error) return value;

    console.log(chalk.red(`  ${error}`));
  }
}

function appendToEnv(key: string, value: string): void {
  const envPath = join(getTotaHome(), '.env');
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }
  const lines = envContent.split('\n').filter((l: string) => !l.startsWith(`${key}=`) && l.trim() !== '');
  lines.push(`${key}=${value}`);
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
  process.env[key] = value;
}

function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

function formatTelegramUser(user: {
  userId: number;
  username?: string;
  firstName?: string;
}): string {
  const username = user.username ? ` (@${user.username})` : '';
  const firstName = user.firstName ? ` ${user.firstName}` : '';
  return `${user.userId}${username}${firstName}`;
}

function printTelegramAccessState(config: TotaConfig): void {
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

function restartDaemonIfRunning(message?: string): void {
  const daemon = getDaemonStatus();
  if (!daemon.running) return;

  if (message) {
    console.log(chalk.dim(`  ${message}`));
  }
  restartDaemon();
}

async function completeInitialTelegramPairing(config: TotaConfig): Promise<void> {
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

export const SETUP_SECTIONS: Record<string, string> = {
  identity: 'Identity & Name',
  llm: 'LLM Providers',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  github: 'GitHub Integration',
  websearch: 'Web Search',
  browser: 'Browser Automation',
  computer: 'Computer-Use & Android',
  api: 'REST API Channel',
  budget: 'Token Budget',
  calendar: 'Google Calendar',
  voice: 'Voice TTS/STT',
  vault: 'Secrets Vault',
};

async function configure(existingConfig?: TotaConfig, section?: string): Promise<void> {
  const isReconfig = !!existingConfig || !!section;
  const config = existingConfig ?? loadConfig();

  if (section) {
    const label = SETUP_SECTIONS[section] ?? section;
    banner();
    console.log(chalk.yellow(`  Configuring: ${label} — press Enter to keep current value.`));
  } else if (isReconfig) {
    banner();
    console.log(chalk.yellow('  Reconfiguring tota — press Enter to keep current value.'));
  } else {
    splashScreen();
    console.log(chalk.yellow('  First run detected — let\'s set you up.'));
  }

  if (!section || section === 'identity') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Identity'));
  console.log('');

  if (isReconfig) {
    const ownerName = await ask(chalk.white(`  Your name [${config.identity.owner}]: `));
    if (ownerName) config.identity.owner = ownerName;

    const agentName = await ask(chalk.white(`  Agent name [${config.identity.name}]: `));
    if (agentName) config.identity.name = agentName;
  } else {
    const ownerName = await ask(chalk.white('  Your name: '));
    if (!ownerName) {
      console.log(chalk.red('  Name is required.'));
      process.exit(1);
    }
    config.identity.owner = ownerName;

    const agentName = await ask(chalk.white(`  Agent name [${config.identity.name}]: `));
    if (agentName) config.identity.name = agentName;
  }

  config.identity.creator = config.identity.creator || 'manu14357';
  } // end identity section

  if (!section || section === 'llm') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  LLM Providers'));
  if (isReconfig) {
    console.log(chalk.dim('  Choose which providers to configure now. Existing values are shown where available.'));
  } else {
    console.log(chalk.dim('  Choose one or more providers. Press Enter to configure DeepSeek by default.'));
  }
  console.log('');

  while (true) {
    const selectedProviders = await chooseProvidersToConfigure(config, isReconfig);
    console.log('');

    for (const provider of selectedProviders) {
      if (provider === 'deepseek') {
        const mask = isReconfig && config.providers.deepseek.apiKey ? ` [${maskKey(config.providers.deepseek.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'deepseek',
          'DeepSeek',
          chalk.white(`  DeepSeek API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.deepseek.apiKey = result.apiKey;
          config.providers.deepseek.model = result.model;
          config.providers.deepseek.enabled = true;
        }
        continue;
      }

      if (provider === 'openai') {
        const mask = isReconfig && config.providers.openai.apiKey ? ` [${maskKey(config.providers.openai.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'openai',
          'OpenAI',
          chalk.white(`  OpenAI API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.openai.apiKey = result.apiKey;
          config.providers.openai.model = result.model;
          config.providers.openai.enabled = true;
        }
        continue;
      }

      if (provider === 'anthropic') {
        const mask = isReconfig && config.providers.anthropic.apiKey ? ` [${maskKey(config.providers.anthropic.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'anthropic',
          'Anthropic',
          chalk.white(`  Anthropic API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.anthropic.apiKey = result.apiKey;
          config.providers.anthropic.model = result.model;
          config.providers.anthropic.enabled = true;
        }
        continue;
      }

      if (provider === 'grok') {
        const mask = isReconfig && config.providers.grok.apiKey ? ` [${maskKey(config.providers.grok.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'grok',
          'Grok',
          chalk.white(`  Grok API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.grok.apiKey = result.apiKey;
          config.providers.grok.model = result.model;
          config.providers.grok.enabled = true;
        }
        continue;
      }

      if (provider === 'ollamaCloud') {
        const mask = isReconfig && config.providers.ollamaCloud.apiKey ? ` [${maskKey(config.providers.ollamaCloud.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'ollamaCloud',
          'Ollama Cloud',
          chalk.white(`  Ollama Cloud API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.ollamaCloud.apiKey = result.apiKey;
          config.providers.ollamaCloud.model = result.model;
          config.providers.ollamaCloud.enabled = true;
        }
        continue;
      }

      if (provider === 'ollamaLocal') {
        const result = await promptOllamaLocalModelSelection(config);
        if (!result.skipped && result.baseUrl && result.model) {
          config.providers.ollamaLocal.baseUrl = result.baseUrl;
          config.providers.ollamaLocal.model = result.model;
          config.providers.ollamaLocal.enabled = true;
        }
        continue;
      }

      if (provider === 'openaiCompat') {
        const result = await promptOpenAICompatSetup(config, isReconfig);
        if (!result.skipped && result.baseUrl && result.model) {
          config.providers.openaiCompat.baseUrl = result.baseUrl;
          config.providers.openaiCompat.model = result.model;
          config.providers.openaiCompat.enabled = true;
          if (result.apiKey) {
            config.providers.openaiCompat.apiKey = result.apiKey;
          }
        }
        continue;
      }

      if (provider === 'mimo') {
        const mask = isReconfig && config.providers.mimo.apiKey ? ` [${maskKey(config.providers.mimo.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'mimo',
          'MiMo',
          chalk.white(`  MiMo API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.mimo.apiKey = result.apiKey;
          config.providers.mimo.model = result.model;
          config.providers.mimo.enabled = true;
        }
        continue;
      }

      if (provider === 'mimoTokenPlan') {
        const mask = isReconfig && config.providers.mimoTokenPlan.apiKey ? ` [${maskKey(config.providers.mimoTokenPlan.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'mimoTokenPlan',
          'MiMo Token Plan',
          chalk.white(`  MiMo Token Plan API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.mimoTokenPlan.apiKey = result.apiKey;
          config.providers.mimoTokenPlan.model = result.model;
          config.providers.mimoTokenPlan.enabled = true;
        }
      }
    }

    const configuredProviders = getConfiguredProviderNames(config);
    if (configuredProviders.length === 0) {
      console.log(chalk.red('  You need to configure at least one LLM provider to continue.'));
      console.log(chalk.dim('  Let\'s try that step again.'));
      console.log('');
      continue;
    }

    await chooseDefaultProvider(config);
    break;
  }
  } // end llm section

  if (!section || section === 'telegram') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Telegram (optional)'));
  if (isReconfig) {
    console.log(chalk.dim('  Leave empty to keep current value. Enter "none" to disable.'));
  } else {
    console.log(chalk.dim('  Leave empty to skip. You can add it later.'));
    console.log(chalk.dim('  To create a bot token:'));
    console.log(chalk.dim('    1. Open Telegram and message @BotFather'));
    console.log(chalk.dim('    2. Run /newbot and follow the prompts'));
    console.log(chalk.dim('    3. Copy the bot token BotFather gives you'));
    console.log(chalk.dim('    4. Paste that token here'));
    console.log(chalk.dim('  After setup, users send /start to request access.'));
    console.log(chalk.dim('  The first Telegram user gets a pairing code, and you approve that code from the CLI.'));
  }
  console.log('');

  const tgMask = isReconfig && config.channels.telegram.botToken ? ` [${maskKey(config.channels.telegram.botToken)}]` : '';
  const telegramToken = await ask(chalk.white(`  Telegram Bot Token${tgMask}: `));
  if (isReconfig && telegramToken.toLowerCase() === 'none') {
    config.channels.telegram.enabled = false;
    config.channels.telegram.botToken = '';
    clearTelegramAccess(config);
  } else if (telegramToken) {
    if (telegramToken !== config.channels.telegram.botToken) {
      clearTelegramAccess(config);
    }
    config.channels.telegram.botToken = telegramToken;
    config.channels.telegram.enabled = true;
  }

  await completeInitialTelegramPairing(config);
  } // end telegram section

  if (!section || section === 'whatsapp') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  WhatsApp (optional)'));
  if (isReconfig) {
    console.log(chalk.dim('  Enter "none" to disable, or leave empty to keep current value.'));
  } else {
    console.log(chalk.dim('  Connect tota to your WhatsApp — no business account or API key needed.'));
    console.log(chalk.dim('  Uses WhatsApp Web (Baileys). A QR code will appear when you start tota.'));
    console.log(chalk.dim('  Scan it from WhatsApp → Linked Devices → Link a Device.'));
    console.log('');
    console.log(chalk.dim('  After enabling, run `tota start` and scan the QR code to link.'));
    console.log(chalk.dim('  Then add your phone with: tota whatsapp allow +<phone>'));
  }
  console.log('');

  const waEnabled = config.channels.whatsapp?.enabled ?? false;
  const waOptions = [
    { value: 'skip', label: isReconfig ? (waEnabled ? 'Keep enabled' : 'Keep disabled / skip') : 'Skip — don\'t enable WhatsApp' },
    { value: 'enable', label: 'Enable WhatsApp channel' },
    ...(isReconfig && waEnabled ? [{ value: 'disable', label: 'Disable WhatsApp channel' }] : []),
  ];

  if (isReconfig && waEnabled) {
    const allowFrom = config.channels.whatsapp?.allowFrom ?? [];
    const authDir = config.channels.whatsapp?.authDir ?? '';
    console.log(chalk.dim(`  Current: enabled · auth: ${authDir}`));
    if (allowFrom.length > 0) {
      console.log(chalk.dim(`  Allowed numbers: ${allowFrom.join(', ')}`));
    } else {
      console.log(chalk.dim('  Allowed numbers: none set (use pairing requests)'));
    }
    console.log('');
  }

  const waChoice = await selectWithArrowKeys('WhatsApp Channel', waOptions);

  if (waChoice === 'disable') {
    config.channels.whatsapp.enabled = false;
    console.log(chalk.dim('  WhatsApp channel disabled.'));
  } else if (waChoice === 'enable') {
    config.channels.whatsapp.enabled = true;

    const defaultAuthDir = config.channels.whatsapp?.authDir || join(homedir(), '.tota', 'whatsapp-auth');
    const authDirInput = await ask(chalk.white(`  Auth directory [${defaultAuthDir}]: `));
    config.channels.whatsapp.authDir = authDirInput || defaultAuthDir;

    console.log('');
    console.log(chalk.dim('  Allow specific phone numbers (E.164 format, comma-separated).'));
    console.log(chalk.dim('  Example: +15551234567,+447911123456'));
    console.log(chalk.dim('  Leave empty — anyone can send a pairing/access request instead.'));
    const allowFromInput = await ask(chalk.white('  Allowed numbers (comma-separated, or Enter to skip): '));
    if (allowFromInput.trim()) {
      config.channels.whatsapp.allowFrom = allowFromInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const allowGroupsInput = await ask(chalk.white('  Allow group messages? (y/N): '));
    config.channels.whatsapp.allowGroups = allowGroupsInput.toLowerCase().startsWith('y');

    console.log('');
    console.log(chalk.green(`  ✓ WhatsApp enabled. Auth stored at: ${config.channels.whatsapp.authDir}`));
    console.log(chalk.dim('  Run `tota start` and scan the QR code that appears to link your WhatsApp.'));
  }
  } // end whatsapp section

  if (!section || section === 'github') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  GitHub Integration (optional)'));
  console.log(chalk.dim('  Connect tota to GitHub so it can create PRs, manage issues,'));
  console.log(chalk.dim('  review code, and co-author commits on your behalf.'));
  console.log(chalk.dim('  Leave empty to skip. You can add it later with tota doctor.'));
  console.log('');

  const ghUserCurrent = isReconfig && config.github.username ? ` [${config.github.username}]` : '';
  const ghUsername = await ask(chalk.white(`  1. Your GitHub username${ghUserCurrent}: `));
  if (ghUsername) config.github.username = ghUsername;

  if (!config.github.email) {
    config.github.email = 'tota@github.com';
  }

  console.log('');
  console.log(chalk.dim('     You need a Personal Access Token (PAT) with repo access.'));
  console.log(chalk.dim('     Fine-grained (recommended): github.com/settings/personal-access-tokens/new'));
  console.log(chalk.dim('       → Permissions: Contents (R/W), Pull requests (R/W), Issues (R/W)'));
  console.log(chalk.dim('     Classic: github.com/settings/tokens/new'));
  console.log(chalk.dim('       → Scope: repo (full control)'));
  const ghTokenCurrent = process.env.GITHUB_TOKEN ? ` [${maskKey(process.env.GITHUB_TOKEN)}]` : '';
  const ghToken = await ask(chalk.white(`  2. GitHub PAT${ghTokenCurrent}: `));
  if (ghToken) {
    appendToEnv('GITHUB_TOKEN', ghToken);
  }

  if (config.github.username || process.env.GITHUB_TOKEN) {
    console.log('');
    console.log(chalk.dim('     Set a default repo so you can say "create an issue" without'));
    console.log(chalk.dim('     specifying the repo every time. Enter owner/name or a full URL.'));
    console.log(chalk.dim('     Example: manu14357/tota-agent'));
    console.log(chalk.dim('     Example: https://github.com/manu14357/tota-agent'));
    const ghOwnerCurrent = isReconfig && config.github.defaultOwner ? ` [${config.github.defaultOwner}/${config.github.defaultRepo}]` : '';
    const ghRepoInput = await ask(chalk.white(`  3. Default repo${ghOwnerCurrent}: `));
    if (ghRepoInput) {
      const parsed = parseGithubRepo(ghRepoInput);
      if (parsed) {
        config.github.defaultOwner = parsed.owner;
        config.github.defaultRepo = parsed.repo;
      } else {
        console.log(chalk.yellow('  Could not parse repo. Use format: owner/repo or a GitHub URL.'));
      }
    }
  }
  } // end github section

  if (!section || section === 'websearch') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Web Search (optional)'));
  console.log(chalk.dim('  Enable tota to search the web. Provide an API key for one of the'));
  console.log(chalk.dim('  supported providers below. Leave empty to skip.'));
  console.log('');
  console.log(chalk.dim('    Brave Search  — brave.com/search/api'));
  console.log(chalk.dim('    Serper        — serper.dev'));
  console.log(chalk.dim('    Tavily        — tavily.com'));
  console.log('');

  const webSearchProviders = [
    { key: 'brave', label: 'Brave Search', envKey: 'BRAVE_API_KEY', prefix: '' },
    { key: 'serper', label: 'Serper', envKey: 'SERPER_API_KEY', prefix: '' },
    { key: 'tavily', label: 'Tavily', envKey: 'TAVILY_API_KEY', prefix: '' },
  ] as const;

  const existingWebKey = process.env.BRAVE_API_KEY || process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY || config.webSearch?.apiKey || '';
  const existingWebProvider = process.env.BRAVE_API_KEY ? 'Brave' : process.env.SERPER_API_KEY ? 'Serper' : process.env.TAVILY_API_KEY ? 'Tavily' : '';

  const webSearchOptions = [
    { value: 'skip', label: isReconfig ? 'Keep current / skip' : 'Skip' },
    ...webSearchProviders.map((p, i) => ({ value: p.envKey, label: `${i + 1}. ${p.label}` })),
  ];

  if (existingWebKey && existingWebProvider) {
    console.log(chalk.dim(`  Current: ${existingWebProvider} (${maskKey(existingWebKey)})`));
    console.log('');
  }

  const webChoice = await selectWithArrowKeys('Web Search Provider', webSearchOptions);

  if (webChoice && webChoice !== 'skip') {
    const chosen = webSearchProviders.find(p => p.envKey === webChoice)!;
    const currentKey = process.env[chosen.envKey] || '';
    const mask = isReconfig && currentKey ? ` [${maskKey(currentKey)}]` : '';
    while (true) {
      const wsKey = await ask(chalk.white(`  ${chosen.label} API key${mask}: `));
      if (!wsKey) {
        if (isReconfig && currentKey) {
          console.log(chalk.dim(`  Keeping current ${chosen.label} key.`));
        }
        break;
      }
      if (wsKey.length < 10 || /\s/.test(wsKey)) {
        console.log(chalk.red('  That doesn\'t look like a valid API key. Try again.'));
        continue;
      }
      appendToEnv(chosen.envKey, wsKey);
      console.log(chalk.green(`  ✓ ${chosen.label} API key saved to ~/.tota/.env`));
      break;
    }
  }
  } // end websearch section

  if (!section || section === 'api') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  REST API Channel (optional)'));
  console.log(chalk.dim('  Expose a local HTTP endpoint so other apps or scripts can send'));
  console.log(chalk.dim('  messages to tota and get replies (POST /message).'));
  console.log(chalk.dim('  Leave empty to skip. You can enable it later with tota doctor.'));
  console.log('');

  const apiEnabled = config.channels.api?.enabled ?? false;
  const apiCurrentPort = config.channels.api?.port ?? 3001;
  const apiCurrentKey = config.channels.api?.apiKey ?? '';

  const apiEnableOptions = [
    { value: 'skip', label: isReconfig ? (apiEnabled ? 'Keep enabled' : 'Keep disabled / skip') : 'Skip — don\'t enable the REST API' },
    { value: 'enable', label: 'Enable the REST API channel' },
    ...(isReconfig && apiEnabled ? [{ value: 'disable', label: 'Disable the REST API channel' }] : []),
  ];

  if (isReconfig && apiEnabled) {
    console.log(chalk.dim(`  Current: enabled on port ${apiCurrentPort}${apiCurrentKey ? `, key: ${maskKey(apiCurrentKey)}` : ', no auth'}`));
    console.log('');
  }

  const apiChoice = await selectWithArrowKeys('REST API Channel', apiEnableOptions);

  if (apiChoice === 'disable') {
    config.channels.api.enabled = false;
    console.log(chalk.dim('  REST API channel disabled.'));
  } else if (apiChoice === 'enable') {
    config.channels.api.enabled = true;

    const portPrompt = isReconfig
      ? chalk.white(`  Port [${apiCurrentPort}]: `)
      : chalk.white(`  Port [3001]: `);
    while (true) {
      const portStr = await ask(portPrompt);
      if (!portStr) {
        config.channels.api.port = apiCurrentPort;
        break;
      }
      const portNum = parseInt(portStr, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        console.log(chalk.red('  Please enter a valid port number (1–65535).'));
        continue;
      }
      config.channels.api.port = portNum;
      break;
    }

    const keyMask = isReconfig && apiCurrentKey ? ` [${maskKey(apiCurrentKey)}]` : '';
    const apiKeyPrompt = isReconfig && apiCurrentKey
      ? chalk.white(`  API key for auth (Enter to keep current)${keyMask}: `)
      : chalk.white('  API key for auth (optional, Enter to skip — no auth): ');
    const newApiKey = await ask(apiKeyPrompt);
    if (newApiKey) {
      if (newApiKey.length < 8 || /\s/.test(newApiKey)) {
        console.log(chalk.yellow('  That key looks too short or has spaces — saved anyway. Consider using a longer key.'));
      }
      config.channels.api.apiKey = newApiKey;
      console.log(chalk.green(`  ✓ REST API channel enabled on port ${config.channels.api.port} with auth.`));
    } else {
      if (isReconfig && apiCurrentKey) config.channels.api.apiKey = apiCurrentKey;
      console.log(chalk.green(`  ✓ REST API channel enabled on port ${config.channels.api.port}${config.channels.api.apiKey ? ' with auth' : ' (no auth)'}.`));
    }
  }
  } // end api section

  if (!section || section === 'budget') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Token Budget'));
  console.log('');

  const budgetPrompt = isReconfig
    ? chalk.white(`  Daily token budget [${config.tokens.dailyBudget.toLocaleString()}]: `)
    : chalk.white(`  Daily token budget [${config.tokens.dailyBudget.toLocaleString()}]: `);
  const budgetStr = await ask(budgetPrompt);
  if (budgetStr) {
    const budget = parseInt(budgetStr.replace(/,/g, ''), 10);
    if (!isNaN(budget) && budget > 0) {
      config.tokens.dailyBudget = budget;
    }
  }
  } // end budget section

  if (!section || section === 'browser') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Browser Automation'));
  console.log(chalk.dim('  Playwright-powered Chromium: open pages, click, type, screenshot, extract.'));
  console.log(chalk.dim('  Works out of the box — no API keys needed.'));
  console.log('');

  const browserOptions = [
    { value: 'skip', label: 'Skip — browser tools are already available' },
    { value: 'install', label: 'Install Chromium browser binary now (npx playwright install chromium)' },
  ];

  const browserChoice = await selectWithArrowKeys('Browser Automation', browserOptions);
  if (browserChoice === 'install') {
    console.log(chalk.dim('  Running: npx playwright install chromium ...'));
    try {
      const { execSync: exec2 } = await import('node:child_process');
      exec2('npx playwright install chromium', { stdio: 'inherit' });
      console.log(chalk.green('  ✓ Chromium installed. Browser tools are ready.'));
    } catch (e: any) {
      console.log(chalk.yellow(`  Could not install Chromium automatically: ${e.message}`));
      console.log(chalk.dim('  Run manually: npx playwright install chromium'));
    }
  } else {
    console.log(chalk.dim('  Skipped. Run `npx playwright install chromium` when ready.'));
  }
  } // end browser section

  if (!section || section === 'computer') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Computer-Use & Android'));
  console.log(chalk.dim('  Let tota see your screen (via vision AI) and control mouse/keyboard.'));
  console.log(chalk.dim('  Also enables Android ADB tools (tap, swipe, type, shell...).'));
  console.log(chalk.dim('  Disabled by default for safety.'));
  console.log('');

  const computerEnabled = config.capabilities?.computer?.enabled ?? false;
  const computerOptions = [
    { value: 'skip',    label: isReconfig ? (computerEnabled ? 'Keep enabled' : 'Keep disabled / skip') : 'Skip — keep computer-use disabled' },
    { value: 'enable',  label: 'Enable computer-use (desktop + Android ADB tools)' },
    ...(isReconfig && computerEnabled ? [{ value: 'disable', label: 'Disable computer-use' }] : []),
  ];

  const computerChoice = await selectWithArrowKeys('Computer-Use', computerOptions);
  if (computerChoice === 'enable') {
    config.capabilities = { ...config.capabilities, computer: { enabled: true } };
    appendToEnv('COMPUTER_USE_ENABLED', 'true');
    console.log(chalk.green('  ✓ COMPUTER_USE_ENABLED=true saved to ~/.tota/.env'));
    console.log(chalk.dim('  Desktop tools use @nut-tree-fork/nut-js. On Linux: sudo apt install libxtst-dev'));
    console.log(chalk.dim('  Android tools use `adb` — ensure adb is in your PATH.'));
  } else if (computerChoice === 'disable') {
    config.capabilities = { ...config.capabilities, computer: { enabled: false } };
    appendToEnv('COMPUTER_USE_ENABLED', 'false');
    console.log(chalk.dim('  COMPUTER_USE_ENABLED=false saved to ~/.tota/.env'));
  } else {
    console.log(chalk.dim('  Skipped. Set COMPUTER_USE_ENABLED=true in ~/.tota/.env to enable later.'));
  }
  } // end computer section

  // ── Google Calendar setup (only when explicitly requested) ─────────────────
  if (section === 'calendar') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Google Calendar'));
  console.log(chalk.dim('  Lets tota read, create, and check your Google Calendar events.'));
  console.log('');
  console.log(chalk.bold('  Step 1 — Create a Google Cloud project:'));
  console.log(chalk.dim('  1. Go to https://console.cloud.google.com/'));
  console.log(chalk.dim('  2. Create a project → Enable "Google Calendar API"'));
  console.log(chalk.dim('  3. Go to APIs & Services → Credentials → + Create Credentials → OAuth client ID'));
  console.log(chalk.dim('  4. Application type: Desktop app. Download the credentials JSON.'));
  console.log(chalk.dim('  5. Edit the Client ID → Authorized redirect URIs → Add:'));
  console.log(chalk.cyan('       http://localhost:8765/oauth2callback'));
  console.log(chalk.dim('     (required — without this Google shows a "not safe" error)'));
  console.log('');
  const existingClientId = (config as any).calendar?.clientId || process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  const existingSecret  = (config as any).calendar?.clientSecret || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  const clientIdPrompt  = existingClientId ? `  Client ID [${existingClientId.slice(0, 20)}...]: ` : '  Client ID: ';
  const clientSecretPrompt = existingSecret ? `  Client Secret [${existingSecret.slice(0, 8)}...]: ` : '  Client Secret: ';

  const clientId = await ask(chalk.white(clientIdPrompt));
  const clientSecret = await ask(chalk.white(clientSecretPrompt));

  const finalClientId     = clientId     || existingClientId;
  const finalClientSecret = clientSecret || existingSecret;

  if (finalClientId && finalClientSecret) {
    appendToEnv('GOOGLE_CALENDAR_CLIENT_ID', finalClientId);
    appendToEnv('GOOGLE_CALENDAR_CLIENT_SECRET', finalClientSecret);
    if (!config.calendar) config.calendar = {};
    config.calendar.clientId = finalClientId;
    config.calendar.clientSecret = finalClientSecret;
    console.log('');
    console.log(chalk.green('  ✓ Credentials saved to ~/.tota/.env'));
    console.log('');
    console.log(chalk.bold('  Step 2 — Authorize tota:'));
    console.log(chalk.dim('  Just ask tota about your calendar (e.g. "what\'s on my calendar today?")'));
    console.log(chalk.dim('  Tota opens your browser automatically → click Allow → done.'));
    console.log(chalk.dim('  (Headless/server? Use the calendar_auth tool to paste the code manually.)'));
  } else {
    console.log(chalk.yellow('  Skipped — enter credentials later or set GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET in ~/.tota/.env'));
  }
  } // end calendar section

  // ── Voice TTS/STT setup (only when explicitly requested) ───────────────────
  if (section === 'voice') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Voice — TTS & STT'));
  console.log(chalk.dim('  Configure text-to-speech and speech-to-text providers.'));
  console.log('');
  console.log(chalk.bold('  TTS Provider (Text-to-Speech):'));
  let openaiApiKey = config.providers?.openai?.apiKey || process.env.OPENAI_API_KEY || '';
  let openaiKeyPrompted = false;
  const ensureOpenAIKey = async (): Promise<boolean> => {
    if (openaiKeyPrompted) return !!openaiApiKey;
    openaiKeyPrompted = true;
    const keyPrompt = `  OpenAI API key${openaiApiKey ? ' [keep current]' : ''}: `;
    const key = await ask(chalk.white(keyPrompt));
    const finalKey = key || openaiApiKey;
    if (!finalKey) {
      console.log(chalk.yellow('  Skipped — set OPENAI_API_KEY in ~/.tota/.env later.'));
      return false;
    }
    config.providers.openai.apiKey = finalKey;
    config.providers.openai.enabled = true;
    appendToEnv('OPENAI_API_KEY', finalKey);
    openaiApiKey = finalKey;
    return true;
  };
  const ttsOptions = [
    { value: 'skip',       label: 'Skip / keep current TTS provider' },
    { value: 'openai',     label: 'OpenAI TTS — voices: alloy, echo, fable, onyx, nova, shimmer  [needs OPENAI_API_KEY]' },
    { value: 'elevenlabs', label: 'ElevenLabs — ultra-realistic voices  [needs ELEVENLABS_API_KEY]' },
    { value: 'google',     label: 'Google Cloud TTS — natural voices  [needs GOOGLE_TTS_API_KEY]' },
  ];
  const ttsChoice = await selectWithArrowKeys('TTS Provider', ttsOptions);
  if (ttsChoice !== 'skip') {
    if (!config.voice) config.voice = {};
    config.voice.ttsProvider = ttsChoice as any;
    if (ttsChoice === 'elevenlabs') {
      const existing = (config.voice as any).elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '';
      const key = await ask(chalk.white(`  ElevenLabs API key${existing ? ' [keep current]' : ''}: `));
      if (key) { (config.voice as any).elevenLabsApiKey = key; appendToEnv('ELEVENLABS_API_KEY', key); }
      const vid = await ask(chalk.white('  Voice ID [21m00Tcm4TlvDq8ikWAM = Rachel, Enter to keep]: '));
      if (vid) (config.voice as any).elevenLabsVoiceId = vid;
    } else if (ttsChoice === 'google') {
      const existing = (config.voice as any).googleTtsApiKey || process.env.GOOGLE_TTS_API_KEY || '';
      const key = await ask(chalk.white(`  Google TTS API key${existing ? ' [keep current]' : ''}: `));
      if (key) { (config.voice as any).googleTtsApiKey = key; appendToEnv('GOOGLE_TTS_API_KEY', key); }
    } else if (ttsChoice === 'openai') {
      await ensureOpenAIKey();
      const voiceOptions = [
        { value: 'alloy',   label: 'alloy — neutral, balanced' },
        { value: 'echo',    label: 'echo — male' },
        { value: 'fable',   label: 'fable — British accent' },
        { value: 'onyx',    label: 'onyx — deep, authoritative' },
        { value: 'nova',    label: 'nova — female' },
        { value: 'shimmer', label: 'shimmer — soft, gentle' },
      ];
      const voiceChoice = await selectWithArrowKeys('Default Voice', voiceOptions);
      (config.voice as any).defaultVoice = voiceChoice;
    }
    console.log(chalk.green(`  ✓ TTS provider set to: ${ttsChoice}`));
  }
  console.log('');
  console.log(chalk.bold('  STT Provider (Speech-to-Text / Transcription):'));
  const sttOptions = [
    { value: 'skip',  label: 'Skip / keep current STT provider' },
    { value: 'openai', label: 'OpenAI Whisper (whisper-1)  [needs OPENAI_API_KEY]' },
    { value: 'groq',   label: 'Groq Whisper (whisper-large-v3 — faster & cheaper)  [needs GROQ_API_KEY]' },
  ];
  const sttChoice = await selectWithArrowKeys('STT Provider', sttOptions);
  if (sttChoice !== 'skip') {
    if (!config.voice) config.voice = {};
    config.voice.sttProvider = sttChoice as any;
    if (sttChoice === 'groq') {
      const existing = (config.voice as any).groqApiKey || process.env.GROQ_API_KEY || '';
      const key = await ask(chalk.white(`  Groq API key${existing ? ' [keep current]' : ''}: `));
      if (key) { (config.voice as any).groqApiKey = key; appendToEnv('GROQ_API_KEY', key); }
    } else if (sttChoice === 'openai') {
      await ensureOpenAIKey();
    }
    console.log(chalk.green(`  ✓ STT provider set to: ${sttChoice}`));
  }
  } // end voice section

  // ── Secrets Vault info (only when explicitly requested) ────────────────────
  if (section === 'vault') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Secrets Vault'));
  console.log(chalk.dim('  tota stores secrets securely using the OS keychain or an encrypted local vault.'));
  console.log('');
  let keytarAvailable = false;
  try {
    await import('keytar');
    keytarAvailable = true;
  } catch {
    keytarAvailable = false;
  }
  const vaultPath = join(homedir(), '.tota', 'vault.enc.json');
  const { existsSync: efs } = await import('node:fs');
  const vaultExists = efs(vaultPath);
  console.log(`  Backend:    ${keytarAvailable ? chalk.green('OS Keychain (macOS Keychain / GNOME Keyring / Windows Credential Manager)') : chalk.yellow('Encrypted file vault (AES-256-GCM)')}`);
  if (!keytarAvailable) {
    console.log(`  Vault file: ${chalk.dim(vaultPath)}${vaultExists ? chalk.green(' (exists)') : chalk.dim(' (empty)')}`);
    console.log(chalk.dim('  To enable OS keychain: npm install -g keytar (requires native build tools)'));
  }
  console.log('');
  console.log(chalk.dim('  Store a secret:  ask tota → "store my API key X as MY_KEY"'));
  console.log(chalk.dim('  Retrieve:        ask tota → "what is MY_KEY?"'));
  console.log(chalk.dim('  Or use tools:    secret_store, secret_get, secret_list, secret_delete'));
  } // end vault section

  hr();
  saveConfig(config);

  const home = getTotaHome();
  console.log('');
  if (section) {
    const label = SETUP_SECTIONS[section] ?? section;
    console.log(chalk.green(`  ✓ ${label} updated in ${home}/tota.yaml`));
  } else {
  console.log(chalk.green(`  ✓ Config saved to ${home}/tota.yaml`));
  console.log(chalk.green(`  ✓ Soul files seeded in ${home}/soul/`));
  console.log(chalk.green(`  ✓ Memory stored in ${home}/memory/`));
  console.log(chalk.green(`  ✓ Permissions seeded in ${home}/permissions.yaml`));
  console.log(chalk.green(`  ✓ Skills directory ready in ${home}/skills/`));
  }
  console.log('');
  if (!section) {
  console.log(chalk.cyan(`  ${config.identity.name} is ready. Run \`tota start\` to chat.`));
  console.log(chalk.dim('  github.com/manu14357/tota-agent'));
  }
  console.log('');
}

function autoDaemonize(): void {
  const daemon = getDaemonStatus();
  if (daemon.running && daemon.pid) {
    return;
  }

  if (!process.argv[1]) {
    console.log(chalk.dim('  Background mode not available in this context.'));
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
    console.log(chalk.green('  \u2713 Auto-starts on login. Auto-restarts on crash.'));
    console.log(chalk.dim('  Use `tota stop` to stop. `tota restart` to restart.'));
  } else {
    console.log(chalk.yellow('  Background mode not available. Run `tota start` to set it up.'));
  }
  console.log('');
}

async function runAgent(isDaemon: boolean = false): Promise<void> {
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

const program = new Command();

program
  .name('tota')
  .description('tota — Soul-driven AI agent with permission-hardened tools, token budgets, and multi-channel access.')
  .version(pkgVersion)
  .option('-v, --verbose', 'Show debug logs')
  .action(async () => {
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
      await channel.start();
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

const serviceCmd = program
  .command('service')
  .description('Manage tota as a system service (auto-start, crash recovery)');

serviceCmd
  .command('install')
  .description('Install tota as a system service (auto-start on boot)')
  .action(() => {
    installService();
  });

serviceCmd
  .command('uninstall')
  .description('Uninstall the system service')
  .action(() => {
    uninstallService();
  });

serviceCmd
  .command('status')
  .description('Show system service status')
  .action(() => {
    showServiceStatus();
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

// Block usage if a newer version is available — skip only for `tota upgrade`
program.hook('preAction', async (thisCommand) => {
  const commandName = thisCommand.name();
  if (commandName === 'upgrade') return;
  await enforceUpToDate(pkgVersion, getTotaHome());
});

program.parseAsync();