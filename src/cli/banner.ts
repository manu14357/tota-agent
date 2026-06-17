import chalk from 'chalk';

import { pkgVersion } from './version.js';

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

export function hr() {
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

export function banner() {
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

export function splashScreen() {
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
