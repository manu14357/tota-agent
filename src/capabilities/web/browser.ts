import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { logger } from '../../utils/logger.js';

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
          return (cloned.textContent || '').replace(/\s+/g, ' ').trim();
        });

        const truncatedText = text.slice(0, 8000) + (text.length > 8000 ? '\n...(truncated)' : '');

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
        // M10: When the page errors, fully reset the browser so the next
        // call gets a clean instance. Otherwise a wedged browser can hang
        // the agent indefinitely.
        await resetBrowser();
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
        double_click: z.boolean().optional().default(false).describe('If true, double-click the element instead of a single click.'),
      }),
    ),
    execute: async ({ selector, text, timeout_ms = 5000, double_click = false }) => {
      if (!selector && !text) return `Error: Provide either "selector" or "text".`;
      const clickCount = double_click ? 2 : 1;
      const verb = double_click ? 'Double-clicked' : 'Clicked';
      try {
        const page = await getPage();
        if (selector) {
          await page.click(selector, { timeout: timeout_ms, clickCount });
          return `${verb} element: ${selector}`;
        } else {
          await page.getByText(text!, { exact: false }).first().click({ timeout: timeout_ms, clickCount });
          return `${verb} element with text: "${text}"`;
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
        // Scroll into view, then click to focus (critical for SPAs and long pages)
        await page.locator(selector).scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await page.click(selector, { timeout: 10000 });
        if (clear_first) {
          await page.fill(selector, '');
        }
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
          await page.waitForURL('**', { timeout: timeout_ms });
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

// ─── Tool: browser_hover ─────────────────────────────────────────────────────

export function createBrowserHoverTool() {
  return tool({
    description:
      'Hover over an element on the current browser page. Useful for triggering dropdown menus, tooltips, and hover states.',
    inputSchema: zodSchema(
      z.object({
        selector: z
          .string()
          .optional()
          .describe('CSS selector of the element to hover, e.g. ".menu-item", "#dropdown"'),
        text: z
          .string()
          .optional()
          .describe('Visible text of the element to hover (partial match). Used if selector not provided.'),
        timeout_ms: z.number().optional().default(5000).describe('Timeout in milliseconds.'),
      }),
    ),
    execute: async ({ selector, text, timeout_ms = 5000 }) => {
      if (!selector && !text) return `Error: Provide either "selector" or "text".`;
      try {
        const page = await getPage();
        if (selector) {
          await page.hover(selector, { timeout: timeout_ms });
          return `Hovered over element: ${selector}`;
        } else {
          await page.getByText(text!, { exact: false }).first().hover({ timeout: timeout_ms });
          return `Hovered over element with text: "${text}"`;
        }
      } catch (err: any) {
        return `Error hovering element: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_select ────────────────────────────────────────────────────

export function createBrowserSelectTool() {
  return tool({
    description: 'Select an option in a <select> dropdown on the current browser page.',
    inputSchema: zodSchema(
      z.object({
        selector: z.string().describe('CSS selector of the <select> element, e.g. "#country", "select[name=size]"'),
        value: z
          .string()
          .optional()
          .describe('The option value attribute to select, e.g. "us" for <option value="us">United States</option>'),
        label: z
          .string()
          .optional()
          .describe('The visible option text to select, e.g. "United States". Used if value not provided.'),
        timeout_ms: z.number().optional().default(5000).describe('Timeout in milliseconds.'),
      }),
    ),
    execute: async ({ selector, value, label, timeout_ms = 5000 }) => {
      if (!value && !label) return `Error: Provide either "value" or "label".`;
      try {
        const page = await getPage();
        if (value !== undefined) {
          await page.selectOption(selector, { value }, { timeout: timeout_ms });
          return `Selected option with value "${value}" in ${selector}`;
        } else {
          await page.selectOption(selector, { label: label! }, { timeout: timeout_ms });
          return `Selected option with label "${label}" in ${selector}`;
        }
      } catch (err: any) {
        return `Error selecting option: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_drag ──────────────────────────────────────────────────────

export function createBrowserDragTool() {
  return tool({
    description:
      'Drag an element (or screen coordinates) to a target element (or coordinates) on the current browser page.',
    inputSchema: zodSchema(
      z.object({
        source_selector: z.string().optional().describe('CSS selector of the element to drag from.'),
        target_selector: z.string().optional().describe('CSS selector of the element to drag to.'),
        source_x: z.number().optional().describe('X coordinate (pixels) to drag from. Used if source_selector not provided.'),
        source_y: z.number().optional().describe('Y coordinate (pixels) to drag from. Used if source_selector not provided.'),
        target_x: z.number().optional().describe('X coordinate (pixels) to drag to. Used if target_selector not provided.'),
        target_y: z.number().optional().describe('Y coordinate (pixels) to drag to. Used if target_selector not provided.'),
        timeout_ms: z.number().optional().default(5000).describe('Timeout in milliseconds.'),
      }),
    ),
    execute: async ({ source_selector, target_selector, source_x, source_y, target_x, target_y, timeout_ms = 5000 }) => {
      try {
        const page = await getPage();
        if (source_selector && target_selector) {
          await page.dragAndDrop(source_selector, target_selector, { timeout: timeout_ms });
          return `Dragged "${source_selector}" to "${target_selector}"`;
        } else if (source_x !== undefined && source_y !== undefined && target_x !== undefined && target_y !== undefined) {
          await page.mouse.move(source_x, source_y);
          await page.mouse.down();
          await page.mouse.move(target_x, target_y, { steps: 10 });
          await page.mouse.up();
          return `Dragged from (${source_x}, ${source_y}) to (${target_x}, ${target_y})`;
        } else {
          return `Error: Provide either source_selector + target_selector, or source_x/source_y + target_x/target_y.`;
        }
      } catch (err: any) {
        return `Error dragging: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_scroll_into_view ─────────────────────────────────────────

export function createBrowserScrollIntoViewTool() {
  return tool({
    description: 'Scroll a specific element into the visible viewport on the current browser page.',
    inputSchema: zodSchema(
      z.object({
        selector: z.string().describe('CSS selector of the element to scroll into view.'),
        timeout_ms: z.number().optional().default(5000).describe('Timeout in milliseconds.'),
      }),
    ),
    execute: async ({ selector, timeout_ms = 5000 }) => {
      try {
        const page = await getPage();
        await page.locator(selector).scrollIntoViewIfNeeded({ timeout: timeout_ms });
        return `Scrolled "${selector}" into view`;
      } catch (err: any) {
        return `Error scrolling element into view: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_get_url ───────────────────────────────────────────────────

export function createBrowserGetUrlTool() {
  return tool({
    description:
      'Get the current URL and page title of the browser. Useful for verifying navigation or checking the current state.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      try {
        const page = await getPage();
        const url = page.url();
        const title = await page.title();
        return `URL: ${url}\nTitle: ${title}`;
      } catch (err: any) {
        return `Error getting URL: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_reload ────────────────────────────────────────────────────

export function createBrowserReloadTool() {
  return tool({
    description: 'Reload (refresh) the current browser page.',
    inputSchema: zodSchema(
      z.object({
        wait_for: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .optional()
          .default('domcontentloaded')
          .describe('What to wait for after reload.'),
      }),
    ),
    execute: async ({ wait_for = 'domcontentloaded' }) => {
      try {
        const page = await getPage();
        await page.reload({ waitUntil: wait_for, timeout: 30000 });
        return `Page reloaded. Current URL: ${page.url()}`;
      } catch (err: any) {
        return `Error reloading page: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_evaluate ──────────────────────────────────────────────────

export function createBrowserEvaluateTool() {
  return tool({
    description:
      'Execute JavaScript in the current browser page context and return the result. ' +
      'Use for reading DOM state, computing values, or triggering page-side logic.',
    inputSchema: zodSchema(
      z.object({
        script: z
          .string()
          .describe(
            'JavaScript expression or function body to evaluate in the page. ' +
            'Examples: "document.title", "document.querySelectorAll(\'a\').length", "() => window.scrollY"',
          ),
      }),
    ),
    execute: async ({ script }) => {
      try {
        const page = await getPage();
        const trimmed = script.trim();
        // Detect if the script is already a callable function definition
        const looksLikeFn =
          trimmed.startsWith('function') ||
          trimmed.startsWith('async function') ||
          /^async\s*\(/.test(trimmed) ||
          /^\(.*\)\s*=>/.test(trimmed) ||
          /^[a-zA-Z_$][\w$]*\s*=>/.test(trimmed);
        // If it contains statements (return/const/let/var/if/for/;), wrap as an async IIFE
        const looksLikeStatements =
          !looksLikeFn &&
          (/\breturn\b/.test(trimmed) ||
            /\bconst\b/.test(trimmed) ||
            /\blet\b/.test(trimmed) ||
            /\bvar\b/.test(trimmed) ||
            trimmed.includes(';'));
        // page.evaluate(string) treats the string as an expression, so:
        // - pure expressions pass through unchanged (e.g. "1 + 1" → 2)
        // - function definitions need to be immediately invoked ("(fn)()") so
        //   the result value is returned, not the function object itself
        // - statement blocks need an async IIFE wrapper so `return` / `const` work
        const scriptToEval = looksLikeFn
          ? `(${trimmed})()`
          : looksLikeStatements
            ? `(async () => { ${trimmed} })()`
            : trimmed;
        const result = await page.evaluate(scriptToEval);
        if (result === undefined || result === null) return 'Result: null';
        return `Result: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`;
      } catch (err: any) {
        return `Error evaluating script: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_navigate ──────────────────────────────────────────────────

export function createBrowserNavigateTool() {
  return tool({
    description:
      'Navigate to a URL in the browser without extracting page content. Faster than browser_open when you just need to change the page.',
    inputSchema: zodSchema(
      z.object({
        url: z.string().describe('Full URL to navigate to, e.g. "https://example.com/page"'),
        wait_for: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .optional()
          .default('domcontentloaded')
          .describe('What to wait for before returning.'),
      }),
    ),
    execute: async ({ url, wait_for = 'domcontentloaded' }) => {
      if (!isAllowedUrl(url)) {
        return `Error: URL blocked for security reasons. Only http:// and https:// URLs are allowed.`;
      }
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: wait_for, timeout: 30000 });
        return `Navigated to: ${page.url()}`;
      } catch (err: any) {
        // M10: full reset on navigation error
        await resetBrowser();
        return `Error navigating to URL: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_cookies_get ───────────────────────────────────────────────

export function createBrowserCookiesGetTool() {
  return tool({
    description:
      'Get all cookies from the current browser session. Useful for inspecting auth tokens and session state.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      try {
        const page = await getPage();
        const cookies = await page.context().cookies();
        if (cookies.length === 0) return 'No cookies found in current session.';
        const formatted = cookies
          .map((c: any) => `${c.name}=${c.value} (domain=${c.domain}, path=${c.path})`)
          .join('\n');
        return `Cookies (${cookies.length}):\n${formatted}`;
      } catch (err: any) {
        return `Error getting cookies: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_cookies_set ───────────────────────────────────────────────

export function createBrowserCookiesSetTool() {
  return tool({
    description:
      'Set a cookie in the current browser session. Use for injecting auth tokens or session cookies.',
    inputSchema: zodSchema(
      z.object({
        name: z.string().describe('Cookie name'),
        value: z.string().describe('Cookie value'),
        domain: z.string().optional().describe('Cookie domain, e.g. "example.com"'),
        path: z.string().optional().default('/').describe('Cookie path (default "/")'),
        expires: z.number().optional().describe('Expiry as Unix timestamp in seconds'),
        httpOnly: z.boolean().optional().default(false).describe('Set HttpOnly flag'),
        secure: z.boolean().optional().default(false).describe('Set Secure flag'),
        sameSite: z
          .enum(['Strict', 'Lax', 'None'])
          .optional()
          .describe('SameSite attribute'),
      }),
    ),
    execute: async ({ name, value, domain, path = '/', expires, httpOnly = false, secure = false, sameSite }) => {
      try {
        const page = await getPage();
        const currentUrl = page.url();
        const cookieDomain = domain ?? (currentUrl !== 'about:blank' ? new URL(currentUrl).hostname : undefined);
        if (!cookieDomain) {
          return `Error: Provide "domain" or navigate to a page first so the domain can be inferred.`;
        }
        const cookie: any = { name, value, domain: cookieDomain, path, httpOnly, secure };
        if (expires !== undefined) cookie.expires = expires;
        if (sameSite !== undefined) cookie.sameSite = sameSite;
        await page.context().addCookies([cookie]);
        return `Cookie "${name}" set for domain "${cookieDomain}"`;
      } catch (err: any) {
        return `Error setting cookie: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_cookies_clear ─────────────────────────────────────────────

export function createBrowserCookiesClearTool() {
  return tool({
    description:
      'Clear all cookies from the current browser session. Use for resetting auth state or starting a clean session.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      try {
        const page = await getPage();
        await page.context().clearCookies();
        return 'All cookies cleared.';
      } catch (err: any) {
        return `Error clearing cookies: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_storage_get ───────────────────────────────────────────────

export function createBrowserStorageGetTool() {
  return tool({
    description:
      'Read items from localStorage or sessionStorage on the current page. Useful for reading auth tokens, preferences, and app state.',
    inputSchema: zodSchema(
      z.object({
        kind: z
          .enum(['local', 'session'])
          .describe('"local" for localStorage, "session" for sessionStorage'),
        key: z
          .string()
          .optional()
          .describe('Specific key to read. Omit to read all items.'),
      }),
    ),
    execute: async ({ kind, key }) => {
      try {
        const page = await getPage();
        const values: Record<string, string> = await page.evaluate(
          ({ kind: k, key: itemKey }: { kind: string; key?: string }) => {
            const store = k === 'session' ? (globalThis as any).sessionStorage : (globalThis as any).localStorage;
            if (itemKey) {
              const v = store.getItem(itemKey);
              return v === null ? {} : { [itemKey]: v };
            }
            const out: Record<string, string> = {};
            for (let i = 0; i < store.length; i++) {
              const storeKey = store.key(i);
              if (storeKey) {
                const val = store.getItem(storeKey);
                if (val !== null) out[storeKey] = val;
              }
            }
            return out;
          },
          { kind, key },
        );
        const entries = Object.entries(values);
        if (entries.length === 0) return key ? `Key "${key}" not found in ${kind}Storage.` : `${kind}Storage is empty.`;
        return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
      } catch (err: any) {
        return `Error reading ${kind}Storage: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_storage_set ───────────────────────────────────────────────

export function createBrowserStorageSetTool() {
  return tool({
    description:
      'Write an item to localStorage or sessionStorage on the current page.',
    inputSchema: zodSchema(
      z.object({
        kind: z
          .enum(['local', 'session'])
          .describe('"local" for localStorage, "session" for sessionStorage'),
        key: z.string().describe('Storage key to write'),
        value: z.string().describe('Value to store (always stored as string)'),
      }),
    ),
    execute: async ({ kind, key, value }) => {
      try {
        const page = await getPage();
        await page.evaluate(
          ({ kind: k, key: itemKey, value: val }: { kind: string; key: string; value: string }) => {
            const store = k === 'session' ? (globalThis as any).sessionStorage : (globalThis as any).localStorage;
            store.setItem(itemKey, val);
          },
          { kind, key, value },
        );
        return `Set ${kind}Storage["${key}"] = "${value.slice(0, 100)}${value.length > 100 ? '...' : ''}"`;
      } catch (err: any) {
        return `Error writing to ${kind}Storage: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_storage_clear ─────────────────────────────────────────────

export function createBrowserStorageClearTool() {
  return tool({
    description:
      'Clear all items from localStorage or sessionStorage on the current page.',
    inputSchema: zodSchema(
      z.object({
        kind: z
          .enum(['local', 'session'])
          .describe('"local" for localStorage, "session" for sessionStorage'),
      }),
    ),
    execute: async ({ kind }) => {
      try {
        const page = await getPage();
        await page.evaluate((k: string) => {
          const store = k === 'session' ? (globalThis as any).sessionStorage : (globalThis as any).localStorage;
          store.clear();
        }, kind);
        return `${kind}Storage cleared.`;
      } catch (err: any) {
        return `Error clearing ${kind}Storage: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_pdf ───────────────────────────────────────────────────────

export function createBrowserPdfTool(
  sendFile: ((filePath: string) => Promise<void>) | undefined,
) {
  return tool({
    description:
      'Save the current browser page as a PDF file. Only supported with Chromium. Returns the PDF file path.',
    inputSchema: zodSchema(
      z.object({
        filename: z
          .string()
          .optional()
          .describe('Output filename (default: "page-<timestamp>.pdf"). Must end with .pdf'),
        full_page: z
          .boolean()
          .optional()
          .default(true)
          .describe('Capture the full scrollable page (default true).'),
        landscape: z
          .boolean()
          .optional()
          .default(false)
          .describe('Use landscape orientation (default false).'),
      }),
    ),
    execute: async ({ filename, full_page = true, landscape = false }) => {
      if (_activeEngine !== 'chromium') {
        return `Error: browser_pdf is only supported with the chromium engine. Current engine: ${_activeEngine}. Switch with browser_engine first.`;
      }
      try {
        const page = await getPage();
        ensureScreenshotDir();
        const name = filename ?? `page-${Date.now()}.pdf`;
        const safeName = name.endsWith('.pdf') ? name : `${name}.pdf`;
        const pdfPath = path.join(SCREENSHOT_DIR, path.basename(safeName));
        await page.pdf({
          path: pdfPath,
          printBackground: true,
          landscape,
          ...(full_page ? {} : { pageRanges: '1' }),
        });
        if (sendFile) {
          await sendFile(pdfPath);
          return `PDF saved and sent: ${pdfPath}`;
        }
        return `PDF saved: ${pdfPath}`;
      } catch (err: any) {
        return `Error generating PDF: ${err.message}`;
      }
    },
  });
}

// ─── Tool: browser_set_viewport ──────────────────────────────────────────────

export function createBrowserSetViewportTool() {
  return tool({
    description:
      'Set the browser viewport size. Use for testing responsive layouts or mobile/tablet emulation.',
    inputSchema: zodSchema(
      z.object({
        width: z.number().int().min(200).max(3840).describe('Viewport width in pixels'),
        height: z.number().int().min(200).max(2160).describe('Viewport height in pixels'),
        preset: z
          .enum(['desktop', 'laptop', 'tablet', 'mobile', 'mobile-landscape'])
          .optional()
          .describe(
            'Preset name as a shortcut. Overrides width/height if provided:\n' +
            '- "desktop" → 1920×1080\n' +
            '- "laptop" → 1280×800\n' +
            '- "tablet" → 768×1024\n' +
            '- "mobile" → 390×844 (iPhone 14)\n' +
            '- "mobile-landscape" → 844×390',
          ),
      }),
    ),
    execute: async ({ width, height, preset }) => {
      const PRESETS: Record<string, { width: number; height: number }> = {
        desktop: { width: 1920, height: 1080 },
        laptop: { width: 1280, height: 800 },
        tablet: { width: 768, height: 1024 },
        mobile: { width: 390, height: 844 },
        'mobile-landscape': { width: 844, height: 390 },
      };
      try {
        const page = await getPage();
        const size = preset ? PRESETS[preset] : { width, height };
        await page.setViewportSize(size);
        return `Viewport set to ${size.width}×${size.height}${preset ? ` (${preset})` : ''}`;
      } catch (err: any) {
        return `Error setting viewport: ${err.message}`;
      }
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
