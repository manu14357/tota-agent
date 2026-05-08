/**
 * Lightweight update checker.
 *
 * - Hits the npm registry once every 24 h (result cached in ~/.tota/update-check.json)
 * - Non-blocking: the check runs in the background while the agent starts
 * - After the banner prints, call `printUpdateNotice()` to display any pending notice
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

const PACKAGE_NAME = 'tota-agent';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

interface CacheFile {
  checkedAt: number;
  latestVersion: string;
}

interface UpdateResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

// Module-level promise so the check runs once and can be awaited later.
let _checkPromise: Promise<UpdateResult | null> | null = null;

function getCachePath(totaHome: string): string {
  return join(totaHome, 'update-check.json');
}

function readCache(cachePath: string): CacheFile | null {
  try {
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, 'utf8')) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(cachePath: string, data: CacheFile): void {
  try {
    mkdirSync(join(cachePath, '..'), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(data), 'utf8');
  } catch {
    // Non-fatal — if we can't write the cache, we just re-check next run
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Start the background update check. Call this early (non-awaited).
 * Pass the tota home directory and current package version.
 */
export function startUpdateCheck(totaHome: string, currentVersion: string): void {
  const cachePath = getCachePath(totaHome);
  _checkPromise = (async (): Promise<UpdateResult | null> => {
    // Try cache first
    const cache = readCache(cachePath);
    const now = Date.now();
    let latestVersion: string | null = null;

    if (cache && now - cache.checkedAt < CHECK_INTERVAL_MS) {
      // Cache is fresh — use it without hitting the network
      latestVersion = cache.latestVersion;
    } else {
      // Fetch from npm registry
      latestVersion = await fetchLatestVersion();
      if (latestVersion) {
        writeCache(cachePath, { checkedAt: now, latestVersion });
      } else if (cache) {
        // Network failed but we have stale cache — use it silently
        latestVersion = cache.latestVersion;
      }
    }

    if (!latestVersion) return null;

    return {
      currentVersion,
      latestVersion,
      hasUpdate: isNewerVersion(latestVersion, currentVersion),
    };
  })();
}

/**
 * Await the check result and print an update notice if a new version is available.
 * Safe to call even if startUpdateCheck() was never called.
 */
export async function printUpdateNotice(): Promise<void> {
  if (!_checkPromise) return;
  try {
    const result = await _checkPromise;
    if (!result?.hasUpdate) return;

    const { currentVersion, latestVersion } = result;
    const cols = Math.min(process.stdout.columns || 80, 72);
    const border = chalk.yellow('─'.repeat(cols));

    console.log('');
    console.log(border);
    console.log(
      chalk.yellow('  ★ Update available: ') +
      chalk.dim(`v${currentVersion}`) +
      chalk.yellow(' → ') +
      chalk.bold.green(`v${latestVersion}`)
    );
    console.log('');

    // Show new features for known version bumps
    const highlights = getHighlights(currentVersion, latestVersion);
    if (highlights.length > 0) {
      console.log(chalk.dim('  What\'s new:'));
      for (const line of highlights) {
        console.log(chalk.dim('    · ') + chalk.white(line));
      }
      console.log('');
    }

    console.log(
      chalk.dim('  Run ') +
      chalk.cyan('npm i -g tota-agent') +
      chalk.dim(' to upgrade')
    );
    console.log(border);
    console.log('');
  } catch {
    // Never crash the agent over an update check
  }
}

/**
 * Returns highlights for known version upgrades.
 * Keeps it minimal — only summarises what's actually new between versions.
 */
function getHighlights(from: string, to: string): string[] {
  // Version range: if upgrading from 0.0.1 to ≥ 0.0.2
  if (compareVersions(from, '0.0.1') <= 0 && compareVersions(to, '0.0.2') >= 0) {
    return [
      'web_search — Brave, Serper, Tavily support',
      'analyze_image — vision tool for local files and URLs',
      'run_code — Python, JS, TS, Bash, Ruby, Go sandbox',
      'delegate_task — sub-agent for complex tasks',
      'REST API channel — GET /status · POST /message',
      'MCP plugins — connect any JSON-RPC MCP server',
      '40+ built-in tools (was 31)',
    ];
  }
  return [];
}

/** Returns true if `latest` is strictly newer than `current`. */
function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

/**
 * Semver comparison — returns positive if a > b, negative if a < b, 0 if equal.
 * Handles simple X.Y.Z format (pre-release tags ignored).
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}
