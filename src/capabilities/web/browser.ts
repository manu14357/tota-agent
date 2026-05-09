import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Browser engine selection — 'chromium' | 'firefox' | 'webkit'
// Override with env: BROWSER_ENGINE=firefox tota
type BrowserEngine = 'chromium' | 'firefox' | 'webkit';
let _activeEngine: BrowserEngine = (process.env.BROWSER_ENGINE as BrowserEngine) || 'chromium';

// Lazy browser instance — one shared instance per session
let _browserPromise: Promise<any> | null = null;
let _page: any | null = null;

const SCREENSHOT_DIR = path.join(os.tmpdir(), 'tota-browser');

// Visible browser by default. Set PLAYWRIGHT_HEADLESS=true or CI=true to force headless.
const IS_HEADLESS = process.env.CI === 'true' || process.env.PLAYWRIGHT_HEADLESS === 'true';

export function getBrowserEngine(): BrowserEngine {
  return _activeEngine;
}

export async function setBrowserEngine(engine: BrowserEngine): Promise<void> {
  await closeBrowser();
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

async function getPage(): Promise<any> {
  if (_page && !_page.isClosed()) return _page;
  const browser = await getBrowser();
  _page = await browser.newPage();
  await _page.setViewportSize({ width: 1280, height: 800 });
  return _page;
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

function ensureScreenshotDir(): void {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

// ─── Tool: browser_open ──────────────────────────────────────────────────────

export function createBrowserOpenTool(
  sendFile: ((filePath: string) => Promise<void>) | undefined,
) {
  return tool({
    description:
      'Open a URL in the browser and optionally take a screenshot. Returns the page title, URL, and a text summary of visible content.',
    inputSchema: zodSchema(
      z.object({
        url: z.string().describe('Full URL to open, e.g. "https://example.com"'),
        screenshot: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, take a screenshot and send it to the user.'),
        wait_for: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .optional()
          .default('domcontentloaded')
          .describe('What to wait for before reading content.'),
      }),
    ),
    execute: async ({ url, screenshot = false, wait_for = 'domcontentloaded' }) => {
      if (!isAllowedUrl(url)) {
        return `Error: URL blocked for security reasons. Only http:// and https:// URLs are allowed.`;
      }
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: wait_for, timeout: 30000 });

        const title = await page.title();
        const currentUrl = page.url();

        // Extract visible text content
        const text: string = await page.evaluate(() => {
          const doc = (globalThis as any).document;
          const body = doc?.body;
          if (!body) return '';
          const cloned = body.cloneNode(true);
          cloned.querySelectorAll('script, style, nav, footer, .cookie, [aria-hidden="true"]').forEach((n: any) => n.remove());
          return (cloned.innerText || cloned.textContent || '').replace(/\s+/g, ' ').trim();
        });

        const truncatedText = text.slice(0, 3000) + (text.length > 3000 ? '\n...(truncated)' : '');

        let result = `URL: ${currentUrl}\nTitle: ${title}\n\n--- Page Content ---\n${truncatedText}`;

        if (screenshot && sendFile) {
          ensureScreenshotDir();
          const filename = `screenshot-${Date.now()}.png`;
          const screenshotPath = path.join(SCREENSHOT_DIR, filename);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          await sendFile(screenshotPath);
          result += `\n\nScreenshot saved and sent: ${screenshotPath}`;
        }

        return result;
      } catch (err: any) {
        if (err.message?.includes('playwright is not installed')) return `Error: ${err.message}`;
        _page = null; // reset page on error
        return `Error opening URL: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_click ─────────────────────────────────────────────────────

export function createBrowserClickTool() {
  return tool({
    description:
      'Click an element on the current browser page. Use a CSS selector or visible text to target the element.',
    inputSchema: zodSchema(
      z.object({
        selector: z
          .string()
          .optional()
          .describe('CSS selector of the element to click, e.g. "#submit-btn", ".nav-link"'),
        text: z
          .string()
          .optional()
          .describe('Visible text of the element to click (partial match). Used if selector not provided.'),
        timeout_ms: z.number().optional().default(5000).describe('Timeout in milliseconds.'),
      }),
    ),
    execute: async ({ selector, text, timeout_ms = 5000 }) => {
      if (!selector && !text) return `Error: Provide either "selector" or "text".`;
      try {
        const page = await getPage();
        if (selector) {
          await page.click(selector, { timeout: timeout_ms });
          return `Clicked element: ${selector}`;
        } else {
          await page.getByText(text!, { exact: false }).first().click({ timeout: timeout_ms });
          return `Clicked element with text: "${text}"`;
        }
      } catch (err: any) {
        return `Error clicking element: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_type ──────────────────────────────────────────────────────

export function createBrowserTypeTool() {
  return tool({
    description:
      'Type text into an input field on the current browser page. Can clear the field first. Works on SPAs like Google, Gmail, etc.',
    inputSchema: zodSchema(
      z.object({
        selector: z.string().describe('CSS selector of the input field, e.g. "input[name=email]", "#search", "input[type=email]"'),
        text: z.string().describe('Text to type into the field'),
        clear_first: z
          .boolean()
          .optional()
          .default(true)
          .describe('Clear existing text before typing. Default true.'),
        press_enter: z
          .boolean()
          .optional()
          .default(false)
          .describe('Press Enter after typing. Default false.'),
      }),
    ),
    execute: async ({ selector, text, clear_first = true, press_enter = false }) => {
      try {
        const page = await getPage();
        // Click to focus first (critical for SPAs)
        await page.click(selector, { timeout: 10000 });
        if (clear_first) {
          // Triple-click selects all text, then overwrite — more reliable than fill('') on SPAs
          await page.click(selector, { clickCount: 3 });
          await page.keyboard.press('Backspace');
        }
        // Use fill() for speed and reliability, then type remaining chars if needed
        await page.fill(selector, text);
        if (press_enter) {
          await page.keyboard.press('Enter');
        }
        return `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into ${selector}${press_enter ? ' and pressed Enter' : ''}`;
      } catch (err: any) {
        return `Error typing into element: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_screenshot ────────────────────────────────────────────────

export function createBrowserScreenshotTool(
  sendFile: ((filePath: string) => Promise<void>) | undefined,
) {
  return tool({
    description:
      'Take a screenshot of the current browser page and send it to the user.',
    inputSchema: zodSchema(
      z.object({
        full_page: z
          .boolean()
          .optional()
          .default(false)
          .describe('Capture the full scrollable page. Default is viewport only.'),
        element_selector: z
          .string()
          .optional()
          .describe('Optional CSS selector to screenshot only a specific element.'),
      }),
    ),
    execute: async ({ full_page = false, element_selector }) => {
      try {
        const page = await getPage();
        ensureScreenshotDir();
        const filename = `screenshot-${Date.now()}.png`;
        const screenshotPath = path.join(SCREENSHOT_DIR, filename);

        if (element_selector) {
          const element = await page.$(element_selector);
          if (!element) return `Error: Element not found: ${element_selector}`;
          await element.screenshot({ path: screenshotPath });
        } else {
          await page.screenshot({ path: screenshotPath, fullPage: full_page });
        }

        if (sendFile) {
          await sendFile(screenshotPath);
          return `Screenshot taken and sent: ${screenshotPath}`;
        }
        return `Screenshot saved: ${screenshotPath}`;
      } catch (err: any) {
        return `Error taking screenshot: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_extract ───────────────────────────────────────────────────

export function createBrowserExtractTool() {
  return tool({
    description:
      'Extract specific data from the current browser page using a CSS selector or by getting all visible text. Useful for scraping structured content.',
    inputSchema: zodSchema(
      z.object({
        selector: z
          .string()
          .optional()
          .describe('CSS selector to extract. Returns text of all matching elements.'),
        attribute: z
          .string()
          .optional()
          .describe('HTML attribute to extract instead of text content, e.g. "href", "src", "value"'),
        all_text: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, return all visible text on the page (ignores selector).'),
      }),
    ),
    execute: async ({ selector, attribute, all_text = false }) => {
      try {
        const page = await getPage();

        if (all_text) {
          const text: string = await page.evaluate(() => {
            const doc = (globalThis as any).document;
            return doc?.body?.innerText?.replace(/\s+/g, ' ')?.trim() ?? '';
          });
          return text.slice(0, 5000) + (text.length > 5000 ? '\n...(truncated)' : '');
        }

        if (!selector) return `Error: Provide "selector" or set "all_text" to true.`;

        const results: string[] = await page.evaluate(
          ({ sel, attr }: { sel: string; attr?: string }) => {
            const doc = (globalThis as any).document;
            const elements: any[] = Array.from(doc.querySelectorAll(sel));
            if (attr) {
              return elements.map((el: any) => el.getAttribute(attr) ?? '').filter(Boolean);
            }
            return elements.map((el: any) => el.innerText?.trim() ?? el.textContent?.trim() ?? '');
          },
          { sel: selector, attr: attribute },
        );

        if (results.length === 0) return `No elements found matching: ${selector}`;

        const output = results
          .slice(0, 50)
          .map((r, i) => `[${i + 1}] ${r}`)
          .join('\n');
        return `Found ${results.length} element(s) for "${selector}":\n\n${output}`;
      } catch (err: any) {
        return `Error extracting from page: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_scroll ────────────────────────────────────────────────────

export function createBrowserScrollTool() {
  return tool({
    description: 'Scroll the current browser page up or down, or to a specific position.',
    inputSchema: zodSchema(
      z.object({
        direction: z
          .enum(['up', 'down', 'top', 'bottom'])
          .optional()
          .default('down')
          .describe('Direction to scroll.'),
        pixels: z
          .number()
          .optional()
          .default(600)
          .describe('Number of pixels to scroll up/down. Default 600.'),
      }),
    ),
    execute: async ({ direction = 'down', pixels = 600 }) => {
      try {
        const page = await getPage();
        if (direction === 'top') {
          await page.evaluate(() => (globalThis as any).window.scrollTo(0, 0));
          return 'Scrolled to top of page';
        } else if (direction === 'bottom') {
          await page.evaluate(() => {
            const w = (globalThis as any).window;
            w.scrollTo(0, (globalThis as any).document.body.scrollHeight);
          });
          return 'Scrolled to bottom of page';
        } else {
          const delta = direction === 'up' ? -pixels : pixels;
          await page.evaluate((dy: number) => (globalThis as any).window.scrollBy(0, dy), delta);
          return `Scrolled ${direction} ${pixels}px`;
        }
      } catch (err: any) {
        return `Error scrolling: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_close ─────────────────────────────────────────────────────

export function createBrowserCloseTool() {
  return tool({
    description: 'Close the browser session and free up resources. Call this when done with browser tasks.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      await closeBrowser();
      return 'Browser session closed.';
    },
  });
}

// ─── Tool: browser_key ───────────────────────────────────────────────────────

export function createBrowserKeyTool() {
  return tool({
    description:
      'Press a keyboard key in the browser. Use this to press Enter, Tab, Escape, arrow keys, etc. after typing or between steps.',
    inputSchema: zodSchema(
      z.object({
        key: z
          .string()
          .describe(
            'Key to press. Examples: "Enter", "Tab", "Escape", "ArrowDown", "Space", "Backspace". ' +
            'Combinations: "Control+a", "Meta+a" (select all on Mac).',
          ),
        count: z
          .number()
          .optional()
          .default(1)
          .describe('Number of times to press the key. Default 1.'),
      }),
    ),
    execute: async ({ key, count = 1 }) => {
      try {
        const page = await getPage();
        for (let i = 0; i < count; i++) {
          await page.keyboard.press(key);
        }
        return `Pressed "${key}"${count > 1 ? ` × ${count}` : ''}`;
      } catch (err: any) {
        return `Error pressing key: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_wait ──────────────────────────────────────────────────────

export function createBrowserWaitTool() {
  return tool({
    description:
      'Wait for a CSS selector to appear on the page, or wait for navigation to complete. ' +
      'Use after clicking login buttons, form submissions, or navigating to a new page.',
    inputSchema: zodSchema(
      z.object({
        selector: z
          .string()
          .optional()
          .describe('CSS selector to wait for, e.g. ".inbox", "[aria-label=\'Inbox\']"'),
        timeout_ms: z
          .number()
          .optional()
          .default(15000)
          .describe('Timeout in milliseconds. Default 15000.'),
        wait_for_navigation: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, wait for page navigation instead of a selector.'),
      }),
    ),
    execute: async ({ selector, timeout_ms = 15000, wait_for_navigation = false }) => {
      try {
        const page = await getPage();
        if (wait_for_navigation) {
          await page.waitForLoadState('domcontentloaded', { timeout: timeout_ms });
          return `Page loaded. Current URL: ${page.url()}`;
        }
        if (!selector) return `Error: Provide "selector" or set "wait_for_navigation" to true.`;
        await page.waitForSelector(selector, { timeout: timeout_ms });
        return `Element found: ${selector}. Current URL: ${page.url()}`;
      } catch (err: any) {
        return `Timeout or error waiting: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_engine ───────────────────────────────────────────────────

export function createBrowserEngineTool() {
  return tool({
    description:
      'Switch the browser engine used for all browser tools. ' +
      'Choose between Chromium (default), Firefox, or WebKit (Safari-compatible). ' +
      'Closes the current browser session and reopens with the selected engine on the next browser_open call.',
    inputSchema: zodSchema(
      z.object({
        engine: z
          .enum(['chromium', 'firefox', 'webkit'])
          .describe(
            'Browser engine to use:\n' +
            '- "chromium" — Google Chrome-compatible. Best general-purpose choice. Default.\n' +
            '- "firefox" — Mozilla Firefox engine. Use for Firefox-specific rendering or privacy-focused sites.\n' +
            '- "webkit" — Apple WebKit (Safari engine). Use for iOS/macOS compatibility testing.',
          ),
      }),
    ),
    execute: async ({ engine }) => {
      const prev = _activeEngine;
      await closeBrowser();
      _activeEngine = engine;
      return `Browser engine switched: ${prev} → ${engine}. The next browser_open will launch a ${engine} browser window.`;
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
