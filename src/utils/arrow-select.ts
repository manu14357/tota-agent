import readline from 'node:readline';
import chalk from 'chalk';

export interface ArrowSelectOption {
  value: string;
  label: string;
}

export interface ArrowSelectConfig {
  helperText?: string;
  maxVisibleOptions?: number;
  signal?: AbortSignal;
  /** Allow typing to fuzzy-filter the list (command-palette style). Default: true. */
  filterable?: boolean;
}

export class ArrowSelectCancelledError extends Error {
  constructor(message: string = 'Arrow select cancelled') {
    super(message);
    this.name = 'ArrowSelectCancelledError';
  }
}

/**
 * Subsequence fuzzy score: returns -1 if `query` is not a subsequence of
 * `label`, otherwise a score that rewards contiguous runs and start-of-word
 * matches (so "cag" ranks `create-agent` above `coverage`).
 */
export function fuzzyScore(query: string, label: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevMatch = -2;
  for (let li = 0; li < l.length && qi < q.length; li += 1) {
    if (l[li] === q[qi]) {
      score += 1;
      if (li === prevMatch + 1) score += 3;          // contiguous run bonus
      if (li === 0 || /[\s\-_/]/.test(l[li - 1])) score += 2; // word-start bonus
      prevMatch = li;
      qi += 1;
    }
  }
  if (qi < q.length) return -1; // not all query chars matched
  if (l.startsWith(q)) score += 5;
  return score;
}

export async function selectWithArrowKeys(
  title: string,
  options: ArrowSelectOption[],
  config: ArrowSelectConfig = {},
): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || options.length === 0) {
    return options[0]?.value ?? '';
  }

  readline.emitKeypressEvents(process.stdin);

  const stdin = process.stdin;
  const stdout = process.stdout;
  const canUseRawMode = typeof stdin.setRawMode === 'function';
  const filterable = config.filterable !== false;
  const helperText = config.helperText
    || (filterable ? 'Type to filter · ↑↓ to move · Enter to select' : 'Use the arrow keys, then press Enter.');
  const maxVisibleOptions = Math.max(
    1,
    Math.min(
      options.length,
      config.maxVisibleOptions ?? Math.max(5, (stdout.rows || 12) - 8),
    ),
  );
  let activeIndex = 0;
  let renderedLineCount = 0;
  let windowStart = 0;
  let query = '';
  let filtered: ArrowSelectOption[] = options;

  const applyFilter = () => {
    if (!query) {
      filtered = options;
    } else {
      filtered = options
        .map((option) => ({ option, score: fuzzyScore(query, option.label) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.option);
    }
    activeIndex = 0;
    windowStart = 0;
  };

  const topIndicator = (hasHiddenAbove: boolean) => (
    hasHiddenAbove ? chalk.dim('  ↑ more') : '  '
  );
  const bottomIndicator = (hasHiddenBelow: boolean) => (
    hasHiddenBelow ? chalk.dim('  ↓ more') : '  '
  );

  const termWidth = () => Math.max(20, stdout.columns || 80);
  /** Truncate a plain string to a visible width, adding an ellipsis. */
  const truncate = (s: string, width: number): string => (
    s.length > width ? s.slice(0, Math.max(0, width - 1)) + '…' : s
  );

  // Redraw in place. Every rendered line is kept to a single terminal row
  // (labels are truncated to the terminal width before this runs), so the
  // cursor math is exact even when the window is narrow. `clearScreenDown`
  // wipes any rows left over from a previously taller render.
  const writeLines = (lines: string[]) => {
    if (renderedLineCount > 0) {
      readline.moveCursor(stdout, 0, -(renderedLineCount - 1));
      readline.cursorTo(stdout, 0);
      readline.clearScreenDown(stdout);
    }

    for (let index = 0; index < lines.length; index += 1) {
      readline.cursorTo(stdout, 0);
      stdout.write(lines[index]);
      if (index < lines.length - 1) {
        stdout.write('\n');
      }
    }
  };

  const render = () => {
    if (activeIndex < windowStart) {
      windowStart = activeIndex;
    } else if (activeIndex >= windowStart + maxVisibleOptions) {
      windowStart = activeIndex - maxVisibleOptions + 1;
    }

    const width = termWidth();
    const labelWidth = Math.max(8, width - 5); // account for "  ● " prefix + margin
    const visibleOptions = filtered.slice(windowStart, windowStart + maxVisibleOptions);
    const hasHiddenAbove = windowStart > 0;
    const hasHiddenBelow = windowStart + maxVisibleOptions < filtered.length;
    const searchLine = filterable
      ? `  ${chalk.cyan('❯')} ${query ? chalk.white(truncate(query, labelWidth)) : chalk.dim('type to filter…')}`
      : null;
    const lines = [
      chalk.bold.white(`  ${truncate(title, width - 2)}`),
      chalk.dim(`  ${truncate(helperText, width - 2)}`),
      ...(searchLine ? [searchLine] : []),
      '',
      topIndicator(hasHiddenAbove),
      ...(filtered.length === 0
        ? [chalk.dim('  (no matches)')]
        : visibleOptions.map((option, visibleIndex) => {
            const index = windowStart + visibleIndex;
            const isActive = index === activeIndex;
            const marker = isActive ? chalk.cyanBright('●') : chalk.dim('·');
            const label = truncate(option.label, labelWidth);
            const text = isActive ? chalk.cyanBright(label) : chalk.dim(label);
            return `  ${marker} ${text}`;
          })),
      bottomIndicator(hasHiddenBelow),
      '',
    ];

    writeLines(lines);
    renderedLineCount = lines.length;
  };

  return await new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      stdin.off('keypress', onKeypress);
      config.signal?.removeEventListener('abort', onAbort);
      if (canUseRawMode) {
        stdin.setRawMode(false);
      }
      stdin.pause();
    };

    const onAbort = () => {
      cleanup();
      reject(new ArrowSelectCancelledError());
    };

    const onKeypress = (input: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.kill(process.pid, 'SIGINT');
        return;
      }

      if (key.name === 'up') {
        if (filtered.length > 0) activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
        render();
        return;
      }

      if (key.name === 'down') {
        if (filtered.length > 0) activeIndex = (activeIndex + 1) % filtered.length;
        render();
        return;
      }

      if (key.name === 'return') {
        const selected = filtered[activeIndex]?.value ?? '';
        cleanup();
        stdout.write('\n');
        resolve(selected);
        return;
      }

      if (!filterable) return;

      // ── Typeahead fuzzy filter ──────────────────────────────────────────
      if (key.name === 'backspace') {
        if (query.length > 0) {
          query = query.slice(0, -1);
          applyFilter();
          render();
        }
        return;
      }

      if (key.name === 'escape') {
        if (query.length > 0) {
          query = '';
          applyFilter();
          render();
        }
        return;
      }

      // Accept a single printable character (letters, digits, space, punctuation).
      const ch = input ?? key.sequence ?? '';
      if (ch.length === 1 && !key.ctrl && !key.meta && ch >= ' ' && ch !== '') {
        query += ch;
        applyFilter();
        render();
      }
    };

    if (canUseRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on('keypress', onKeypress);
    config.signal?.addEventListener('abort', onAbort, { once: true });

    if (config.signal?.aborted) {
      onAbort();
      return;
    }

    render();
  });
}
