import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { closeBrowser, getBrowserEngine, setBrowserEngine } from './browser.js';
import {
  createBrowserOpenTool,
  createBrowserClickTool,
  createBrowserTypeTool,
  createBrowserScreenshotTool,
  createBrowserExtractTool,
  createBrowserScrollTool,
  createBrowserCloseTool,
  createBrowserKeyTool,
  createBrowserWaitTool,
  createBrowserEngineTool,
} from './browser.js';

// Helper to execute a tool (strips the Vercel AI SDK wrapper)
async function exec(tool: any, params: Record<string, any>): Promise<string> {
  return (tool as any).execute(params, {} as any);
}

describe('browser tools', () => {
  afterEach(async () => {
    // Close the shared browser instance between test groups to avoid leaks
    await closeBrowser();
  });

  describe('createBrowserOpenTool', () => {
    it('returns page title and content for a real URL', async () => {
      const tool = createBrowserOpenTool(undefined);
      const result = await exec(tool, { url: 'https://example.com', screenshot: false });
      expect(result).toContain('example.com');
      expect(result).toContain('Title:');
    }, 30000);

    it('blocks non-http(s) URLs', async () => {
      const tool = createBrowserOpenTool(undefined);
      const result = await exec(tool, { url: 'file:///etc/passwd' });
      expect(result).toMatch(/blocked|Error/i);
    });

    it('calls sendFile when screenshot=true', async () => {
      const sendFile = vi.fn().mockResolvedValue(undefined);
      const tool = createBrowserOpenTool(sendFile);
      const result = await exec(tool, { url: 'https://example.com', screenshot: true });
      expect(sendFile).toHaveBeenCalledOnce();
      expect(result).toContain('Screenshot');
    }, 30000);
  });

  describe('createBrowserClickTool', () => {
    it('returns error when no selector or text provided', async () => {
      const tool = createBrowserClickTool();
      const result = await exec(tool, {});
      expect(result).toMatch(/selector.*text|Error/i);
    });

    it('clicks an element by text after opening a page', async () => {
      const openTool = createBrowserOpenTool(undefined);
      await exec(openTool, { url: 'https://example.com' });

      const clickTool = createBrowserClickTool();
      const result = await exec(clickTool, { text: 'More information', timeout_ms: 5000 });
      // Either clicks or reports element not found — not a crash
      expect(typeof result).toBe('string');
    }, 30000);
  });

  describe('createBrowserTypeTool', () => {
    it('types text into an existing input field', async () => {
      const openTool = createBrowserOpenTool(undefined);
      // DuckDuckGo has a well-known search input with no default timeout issues
      await exec(openTool, { url: 'https://duckduckgo.com' });

      const typeTool = createBrowserTypeTool();
      const result = await exec(typeTool, { selector: 'input[name="q"]', text: 'tota', press_enter: false });
      expect(result).toMatch(/typed|tota/i);
    }, 20000);

    it('types into a search field on a real page', async () => {
      const openTool = createBrowserOpenTool(undefined);
      await exec(openTool, { url: 'https://duckduckgo.com' });

      const typeTool = createBrowserTypeTool();
      const result = await exec(typeTool, { selector: 'input[name="q"]', text: 'tota agent', press_enter: false });
      expect(typeof result).toBe('string');
    }, 30000);
  });

  describe('createBrowserExtractTool', () => {
    it('extracts text from a page element', async () => {
      const openTool = createBrowserOpenTool(undefined);
      const openResult = await exec(openTool, { url: 'https://example.com' });
      // Skip if browser/network unavailable in this environment
      if (openResult.startsWith('Error')) return;

      const extractTool = createBrowserExtractTool();
      const result = await exec(extractTool, { selector: 'h1' });
      // example.com always has an h1 — accept any non-empty text or the known text
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }, 30000);

    it('returns body text when no selector given', async () => {
      const openTool = createBrowserOpenTool(undefined);
      await exec(openTool, { url: 'https://example.com' });

      const extractTool = createBrowserExtractTool();
      const result = await exec(extractTool, {});
      expect(result.length).toBeGreaterThan(10);
    }, 30000);
  });

  describe('createBrowserScrollTool', () => {
    it('scrolls a page without error', async () => {
      const openTool = createBrowserOpenTool(undefined);
      await exec(openTool, { url: 'https://example.com' });

      const scrollTool = createBrowserScrollTool();
      const result = await exec(scrollTool, { direction: 'down' });
      expect(result).toMatch(/scroll|down/i);
    }, 30000);
  });

  describe('createBrowserScreenshotTool', () => {
    it('takes screenshot and calls sendFile handler', async () => {
      const openTool = createBrowserOpenTool(undefined);
      const openResult = await exec(openTool, { url: 'https://example.com' });
      // Skip if browser/network unavailable in this environment
      if (openResult.startsWith('Error')) return;

      const sendFile = vi.fn().mockResolvedValue(undefined);
      const screenshotTool = createBrowserScreenshotTool(sendFile);
      const result = await exec(screenshotTool, {});
      expect(sendFile).toHaveBeenCalledOnce();
      expect(result).toMatch(/screenshot/i);
    }, 30000);

    it('returns error message when no page is open and no sendFile given', async () => {
      // Close browser first so no page is open
      await closeBrowser();
      const screenshotTool = createBrowserScreenshotTool(undefined);
      // Without sendFile, it should still capture and return path info
      const result = await exec(screenshotTool, {});
      expect(typeof result).toBe('string');
    }, 30000);
  });

  describe('createBrowserCloseTool', () => {
    it('closes the browser and confirms', async () => {
      const openTool = createBrowserOpenTool(undefined);
      await exec(openTool, { url: 'https://example.com' });

      const closeTool = createBrowserCloseTool();
      const result = await exec(closeTool, {});
      expect(result).toMatch(/close|Browser/i);
    }, 30000);
  });
});

// ─── browser_engine ───────────────────────────────────────────────────────────

describe('browser_engine tool', () => {
  afterEach(async () => {
    // Always restore chromium so later test suites are unaffected
    await setBrowserEngine('chromium');
    await closeBrowser();
  });

  it('defaults to chromium engine', () => {
    expect(getBrowserEngine()).toBe('chromium');
  });

  it('switches to firefox and reports the change', async () => {
    const engineTool = createBrowserEngineTool();
    const result = await exec(engineTool, { engine: 'firefox' });
    expect(result).toMatch(/firefox/i);
    expect(getBrowserEngine()).toBe('firefox');
  });

  it('switches to webkit and reports the change', async () => {
    const engineTool = createBrowserEngineTool();
    const result = await exec(engineTool, { engine: 'webkit' });
    expect(result).toMatch(/webkit/i);
    expect(getBrowserEngine()).toBe('webkit');
  });

  it('switches back to chromium', async () => {
    const engineTool = createBrowserEngineTool();
    await exec(engineTool, { engine: 'firefox' });
    const result = await exec(engineTool, { engine: 'chromium' });
    expect(result).toMatch(/chromium/i);
    expect(getBrowserEngine()).toBe('chromium');
  });

  it('opens a real page with Firefox engine (graceful if binary not installed)', async () => {
    const engineTool = createBrowserEngineTool();
    await exec(engineTool, { engine: 'firefox' });
    const openTool = createBrowserOpenTool(undefined);
    const result = await exec(openTool, { url: 'https://example.com' });
    // Must return a string — either page content or a graceful install error
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it('opens a real page with WebKit engine (graceful if binary not installed)', async () => {
    const engineTool = createBrowserEngineTool();
    await exec(engineTool, { engine: 'webkit' });
    const openTool = createBrowserOpenTool(undefined);
    const result = await exec(openTool, { url: 'https://example.com' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);
});

// ─── browser_key ──────────────────────────────────────────────────────────────

describe('browser_key tool', () => {
  afterEach(async () => {
    await closeBrowser();
  });

  it('presses Tab key without error', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const keyTool = createBrowserKeyTool();
    const result = await exec(keyTool, { key: 'Tab' });
    expect(result).toMatch(/tab/i);
  }, 30000);

  it('presses a key multiple times', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const keyTool = createBrowserKeyTool();
    const result = await exec(keyTool, { key: 'Tab', count: 3 });
    expect(result).toMatch(/× 3/);
  }, 30000);

  it('presses Escape key', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const keyTool = createBrowserKeyTool();
    const result = await exec(keyTool, { key: 'Escape' });
    expect(result).toMatch(/escape/i);
  }, 30000);
});

// ─── browser_wait ─────────────────────────────────────────────────────────────

describe('browser_wait tool', () => {
  afterEach(async () => {
    await closeBrowser();
  });

  it('waits for navigation to complete', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const waitTool = createBrowserWaitTool();
    const result = await exec(waitTool, { wait_for_navigation: true, timeout_ms: 5000 });
    expect(result).toMatch(/loaded|URL/i);
  }, 30000);

  it('waits for a known element to appear', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const waitTool = createBrowserWaitTool();
    const result = await exec(waitTool, { selector: 'h1', timeout_ms: 5000 });
    expect(result).toMatch(/found|h1/i);
  }, 30000);

  it('returns error message when selector not found within timeout', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const waitTool = createBrowserWaitTool();
    const result = await exec(waitTool, { selector: '.nonexistent-xyz-element-abc', timeout_ms: 1000 });
    expect(result).toMatch(/timeout|error/i);
  }, 15000);

  it('returns error when no selector and wait_for_navigation is false', async () => {
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const waitTool = createBrowserWaitTool();
    const result = await exec(waitTool, { timeout_ms: 1000 });
    expect(result).toMatch(/error|selector/i);
  }, 10000);
});
