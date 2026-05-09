import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Lazy browser instance — one shared instance per session
let _browserPromise: Promise<any> | null = null;
let _page: any | null = null;

const SCREENSHOT_DIR = path.join(os.tmpdir(), 'tota-browser');

async function getBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const { chromium } = await import('playwright').catch((e) => {
      throw new Error(`playwright is not installed. Run: npm install playwright && npx playwright install chromium\n${e.message}`);
    });
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return browser;
  })();
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
      'Type text into an input field on the current browser page. Can clear the field first.',
    inputSchema: zodSchema(
      z.object({
        selector: z.string().describe('CSS selector of the input field, e.g. "input[name=email]", "#search"'),
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
        if (clear_first) {
          await page.fill(selector, '');
        }
        await page.type(selector, text, { delay: 30 });
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
