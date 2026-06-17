import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import {
  getPage,
  closeBrowser,
  resetBrowser,
  ensureScreenshotDir,
  isAllowedUrl,
  getActiveEngine,
  setActiveEngine,
  SCREENSHOT_DIR,
} from './lifecycle.js';

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
      const prev = getActiveEngine();
      await closeBrowser();
      setActiveEngine(engine);
      return `Browser engine switched: ${prev} → ${engine}. The next browser_open will launch a ${engine} browser window.`;
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
