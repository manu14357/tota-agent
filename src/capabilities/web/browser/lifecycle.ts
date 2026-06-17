import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { logger } from '../../../utils/logger.js';

// Browser engine selection — 'chromium' | 'firefox' | 'webkit'
// Override with env: BROWSER_ENGINE=firefox tota
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';
let _activeEngine: BrowserEngine = (process.env.BROWSER_ENGINE as BrowserEngine) || 'chromium';

// Lazy browser instance — one shared instance per session
let _browserPromise: Promise<any> | null = null;
let _page: any | null = null;

export const SCREENSHOT_DIR = path.join(os.tmpdir(), 'tota-browser');

// Visible browser by default. Set PLAYWRIGHT_HEADLESS=true or CI=true to force headless.
const IS_HEADLESS = process.env.CI === 'true' || process.env.PLAYWRIGHT_HEADLESS === 'true';

export function getBrowserEngine(): BrowserEngine {
  return _activeEngine;
}

export async function setBrowserEngine(engine: BrowserEngine): Promise<void> {
  await closeBrowser();
  _activeEngine = engine;
}

/**
 * Read the active engine without going through the public API. Used internally
 * by tools that need to inspect or mutate the engine directly.
 */
export function getActiveEngine(): BrowserEngine {
  return _activeEngine;
}

/**
 * Set the active engine WITHOUT closing the current browser. Callers that need
 * the close-then-switch behavior should call closeBrowser() themselves first.
 */
export function setActiveEngine(engine: BrowserEngine): void {
  _activeEngine = engine;
}

async function getBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const pw = await import('playwright').catch((e) => {
      throw new Error(
        `playwright is not installed. Run: npm install playwright && npx playwright install chromium firefox webkit\n${e.message}`,
      );
    });
    const launcher = (pw as any)[_activeEngine];
    if (!launcher || typeof launcher.launch !== 'function') {
      throw new Error(`Unknown browser engine: ${_activeEngine}`);
    }
    const launchOptions: any = { headless: IS_HEADLESS };
    if (_activeEngine === 'chromium') {
      launchOptions.args = ['--no-sandbox', '--disable-setuid-sandbox'];
    }
    const browser = await launcher.launch(launchOptions);
    return browser;
  })().catch((err: any) => {
    _browserPromise = null; // reset so next call can retry with fresh engine
    throw err;
  });
  return _browserPromise;
}

export async function getPage(): Promise<any> {
  if (_page && !_page.isClosed()) return _page;
  const browser = await getBrowser();
  _page = await browser.newPage();
  // M11: Track the page lifecycle. If the page errors or closes
  // unexpectedly, the browser is in an unknown state — better to reset
  // the whole browser on the next call rather than risk a hang.
  _page.on('crash', () => {
    logger.warn('Browser page crashed — closing browser to force re-init on next use');
    closeBrowser().catch(() => {});
  });
  _page.on('close', () => {
    if (_page && !_browserPromise) return; // already cleaned up
    // Page was closed by us via closeBrowser() — nothing to do.
  });
  await _page.setViewportSize({ width: 1280, height: 800 });
  return _page;
}

/**
 * M10/M11: Force-reset both the page AND the browser. Use this on
 * persistent errors where the page may be in a wedged state but the
 * browser is still alive. The next call to getPage() will re-launch
 * a fresh browser.
 */
export async function resetBrowser(): Promise<void> {
  await closeBrowser();
}

export async function closeBrowser(): Promise<void> {
  if (_page) {
    await _page.close().catch(() => {});
    _page = null;
  }
  if (_browserPromise) {
    const browser = await _browserPromise.catch(() => null);
    if (browser) await browser.close().catch(() => {});
    _browserPromise = null;
  }
}

export function ensureScreenshotDir(): void {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
