import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { getTotaHome } from '../utils/config.js';

const PID_FILE = 'daemon.pid';
const LOG_FILE = 'daemon.log';

function pidPath(): string {
  return join(getTotaHome(), PID_FILE);
}

function logPath(): string {
  return join(getTotaHome(), LOG_FILE);
}

export function readPid(): number | null {
  const path = pidPath();
  if (!existsSync(path)) return null;
  try {
    const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);
    if (isNaN(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getDaemonStatus(): { running: boolean; pid: number | null; logPath: string } {
  const pid = readPid();
  if (!pid) return { running: false, pid: null, logPath: logPath() };
  const running = isProcessRunning(pid);
  if (!running) {
    try { unlinkSync(pidPath()); } catch {}
    return { running: false, pid: null, logPath: logPath() };
  }
  return { running, pid, logPath: logPath() };
}

export function ensureDaemonRunning(): { pid: number; fresh: boolean } {
  const status = getDaemonStatus();
  if (status.running && status.pid) {
    return { pid: status.pid, fresh: false };
  }

  const home = getTotaHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error('Cannot determine script path for daemon spawn (process.argv[1] is undefined)');
  }

  const logFile = logPath();
  const isWin = process.platform === 'win32';
  const outFd = openSync(logFile, 'a');

  const child = spawn(process.execPath, [scriptPath, 'start', '--daemon'], {
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: { ...process.env, LOG_LEVEL: process.env.LOG_LEVEL ?? 'info' },
    windowsHide: isWin,
  });

  child.unref();

  if (!child.pid) {
    throw new Error('Failed to spawn daemon process');
  }

  writeFileSync(pidPath(), String(child.pid));
  return { pid: child.pid, fresh: true };
}

export function startBackground(): void {
  try {
    const result = ensureDaemonRunning();
    console.log('');
    console.log(chalk.green(`  tota started in background (PID: ${result.pid})`));
    console.log(chalk.dim(`  Logs: ${logPath()}`));
    console.log(chalk.dim(`  Use \`tota stop\` to stop.`));
    console.log(chalk.dim(`  Use \`tota logs\` to view logs.`));
    console.log('');
  } catch (err: any) {
    console.log(chalk.red(`  Failed to start: ${err.message}`));
    process.exit(1);
  }
}

export function stopDaemon(): void {
  const status = getDaemonStatus();

  if (!status.pid) {
    console.log(chalk.yellow('  tota is not running as a daemon.'));
    console.log('');
    process.exit(0);
  }

  if (!status.running) {
    console.log(chalk.yellow(`  Stale PID file found (PID: ${status.pid} is not running). Cleaning up.`));
    try { unlinkSync(pidPath()); } catch {}
    console.log('');
    process.exit(0);
  }

  try {
    if (process.platform === 'win32') {
      process.kill(status.pid);
    } else {
      process.kill(status.pid, 'SIGTERM');
    }
    console.log(chalk.green(`  tota stopped (PID: ${status.pid})`));
  } catch {
    console.log(chalk.red(`  Failed to stop PID ${status.pid}. You may need to kill it manually.`));
  }

  try { unlinkSync(pidPath()); } catch {}
  console.log('');
}

export function restartDaemon(): void {
  const status = getDaemonStatus();

  if (status.running && status.pid) {
    console.log(chalk.yellow(`  Stopping tota (PID: ${status.pid})...`));
    try {
      if (process.platform === 'win32') {
        process.kill(status.pid);
      } else {
        process.kill(status.pid, 'SIGTERM');
      }
    } catch {
      // process may have already exited
    }
    try { unlinkSync(pidPath()); } catch {}
    console.log(chalk.green('  tota stopped.'));
  }

  console.log(chalk.yellow('  Starting tota...'));
  startBackground();
}

function formatLogLine(line: string): string {
  if (!line.trim()) return '';
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const time = obj['time'] ? new Date(obj['time'] as number).toLocaleString() : '?';
    const levelNum = typeof obj['level'] === 'number' ? (obj['level'] as number) : 30;
    let levelStr: string;
    if (levelNum >= 60) levelStr = chalk.bgRed.white('FATAL');
    else if (levelNum >= 50) levelStr = chalk.red('ERROR');
    else if (levelNum >= 40) levelStr = chalk.yellow(' WARN');
    else if (levelNum >= 30) levelStr = chalk.cyan(' INFO');
    else if (levelNum >= 20) levelStr = chalk.dim('DEBUG');
    else levelStr = chalk.dim('TRACE');

    let msg = String(obj['msg'] ?? '');
    const skip = new Set(['level', 'time', 'pid', 'hostname', 'name', 'msg', 'v']);
    const extra = Object.entries(obj)
      .filter(([k]) => !skip.has(k))
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('  ');
    if (extra) msg += chalk.dim(`  ${extra}`);
    return `${chalk.dim(`[${time}]`)} ${levelStr}  ${msg}`;
  } catch {
    return chalk.dim(line);
  }
}

export interface ShowLogsOptions {
  follow?: boolean;
  clear?: boolean;
  lines?: number;
}

export function showLogs(options: ShowLogsOptions = {}): void {
  const logFile = logPath();

  if (options.clear) {
    if (!existsSync(logFile)) {
      console.log(chalk.dim('  No log file to clear.'));
      return;
    }
    writeFileSync(logFile, '', 'utf-8');
    console.log(chalk.green('  ✓ Log file cleared.'));
    return;
  }

  if (!existsSync(logFile)) {
    console.log(chalk.dim('  No daemon log file found.'));
    console.log(chalk.dim('  Start tota daemon with `tota up` first.'));
    console.log('');
    return;
  }

  const numLines = options.lines ?? 100;
  const content = readFileSync(logFile, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim()).slice(-numLines);

  console.log('');
  for (const line of lines) {
    const formatted = formatLogLine(line);
    if (formatted) console.log(formatted);
  }

  if (!options.follow) {
    console.log('');
    return;
  }

  console.log(chalk.dim('\n  --- Live logs (Ctrl+C to stop) ---\n'));

  const tail = spawn('tail', ['-n', '0', '-f', logFile], { stdio: ['ignore', 'pipe', 'ignore'] });
  tail.stdout?.on('data', (data: Buffer) => {
    const rawLines = data.toString().split(/\r?\n/);
    for (const raw of rawLines) {
      const formatted = formatLogLine(raw);
      if (formatted) console.log(formatted);
    }
  });

  process.on('SIGINT', () => {
    tail.kill();
    process.exit(0);
  });

  tail.on('close', () => process.exit(0));
}

export function tryAutoDaemonize(): boolean {
  try {
    const result = ensureDaemonRunning();
    return result.pid > 0;
  } catch {
    return false;
  }
}