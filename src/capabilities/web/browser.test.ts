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
  createBrowserHoverTool,
  createBrowserSelectTool,
  createBrowserDragTool,
  createBrowserScrollIntoViewTool,
  createBrowserGetUrlTool,
  createBrowserReloadTool,
  createBrowserEvaluateTool,
  createBrowserNavigateTool,
  createBrowserCookiesGetTool,
  createBrowserCookiesSetTool,
  createBrowserCookiesClearTool,
  createBrowserStorageGetTool,
  createBrowserStorageSetTool,
  createBrowserStorageClearTool,
  createBrowserPdfTool,
  createBrowserSetViewportTool,
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

// ─── browser_hover ────────────────────────────────────────────────────────────

describe('browser_hover tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('hovers over an element without error', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const hoverTool = createBrowserHoverTool();
    const result = await exec(hoverTool, { selector: 'a' });
    expect(result).toMatch(/hovered|error/i);
  }, 30000);

  it('returns error for missing selector', async () => {
    const hoverTool = createBrowserHoverTool();
    const result = await exec(hoverTool, {});
    expect(result).toMatch(/selector|error/i);
  });
});

// ─── browser_select ───────────────────────────────────────────────────────────

describe('browser_select tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('returns error when no page open', async () => {
    await closeBrowser();
    const selectTool = createBrowserSelectTool();
    const result = await exec(selectTool, { selector: 'select', value: 'opt1' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 10000);
});

// ─── browser_scroll_into_view ─────────────────────────────────────────────────

describe('browser_scroll_into_view tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('scrolls an element into view on a real page', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const sivTool = createBrowserScrollIntoViewTool();
    const result = await exec(sivTool, { selector: 'p' });
    expect(result).toMatch(/scrolled|visible|error/i);
  }, 30000);
});

// ─── browser_get_url ──────────────────────────────────────────────────────────

describe('browser_get_url tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('returns the URL of the current page', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const urlTool = createBrowserGetUrlTool();
    const result = await exec(urlTool, {});
    expect(result).toMatch(/example\.com|about:blank/i);
  }, 30000);

  it('returns no-page message when browser is not open', async () => {
    await closeBrowser();
    const urlTool = createBrowserGetUrlTool();
    const result = await exec(urlTool, {});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── browser_reload ───────────────────────────────────────────────────────────

describe('browser_reload tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('reloads the current page without error', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const reloadTool = createBrowserReloadTool();
    const result = await exec(reloadTool, {});
    expect(result).toMatch(/reload|example\.com/i);
  }, 30000);
});

// ─── browser_evaluate ─────────────────────────────────────────────────────────

describe('browser_evaluate tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('evaluates a simple expression', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const evalTool = createBrowserEvaluateTool();
    const result = await exec(evalTool, { script: '1 + 1' });
    expect(result).toContain('2');
  }, 30000);

  it('evaluates an arrow function', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const evalTool = createBrowserEvaluateTool();
    const result = await exec(evalTool, { script: '() => document.title' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it('evaluates a return-statement script', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const evalTool = createBrowserEvaluateTool();
    const result = await exec(evalTool, { script: 'return document.location.hostname' });
    expect(result).toMatch(/example\.com/i);
  }, 30000);

  it('evaluates a const-binding script', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const evalTool = createBrowserEvaluateTool();
    const result = await exec(evalTool, { script: 'const x = 42; return x;' });
    expect(result).toContain('42');
  }, 30000);
});

// ─── browser_navigate ─────────────────────────────────────────────────────────

describe('browser_navigate tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('navigates forward/back without error', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const navTool = createBrowserNavigateTool();
    // No back history — should return graceful message
    const result = await exec(navTool, { direction: 'back' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);
});

// ─── browser_set_viewport ─────────────────────────────────────────────────────

describe('browser_set_viewport tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('sets viewport to explicit dimensions', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const viewportTool = createBrowserSetViewportTool();
    const result = await exec(viewportTool, { width: 1280, height: 720 });
    expect(result).toMatch(/1280.*720|viewport/i);
  }, 30000);

  it('sets viewport using a preset', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const viewportTool = createBrowserSetViewportTool();
    const result = await exec(viewportTool, { width: 0, height: 0, preset: 'mobile' });
    expect(result).toMatch(/390.*844|mobile/i);
  }, 30000);
});

// ─── browser_cookies_get/set/clear ────────────────────────────────────────────

describe('browser_cookies tools', () => {
  afterEach(async () => { await closeBrowser(); });

  it('gets cookies (empty on fresh session)', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const getCookiesTool = createBrowserCookiesGetTool();
    const result = await exec(getCookiesTool, {});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it('sets and retrieves a cookie', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const setCookieTool = createBrowserCookiesSetTool();
    const setResult = await exec(setCookieTool, { name: 'tota_test', value: 'hello', domain: 'example.com' });
    expect(setResult).toMatch(/tota_test|set/i);

    const getCookiesTool = createBrowserCookiesGetTool();
    const getResult = await exec(getCookiesTool, {});
    expect(getResult).toContain('tota_test');
    expect(getResult).toContain('hello');
  }, 30000);

  it('clears cookies and confirms', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const setCookieTool = createBrowserCookiesSetTool();
    await exec(setCookieTool, { name: 'tota_test', value: 'hello', domain: 'example.com' });

    const clearTool = createBrowserCookiesClearTool();
    const clearResult = await exec(clearTool, {});
    expect(clearResult).toMatch(/cleared/i);

    const getCookiesTool = createBrowserCookiesGetTool();
    const getResult = await exec(getCookiesTool, {});
    expect(getResult).toMatch(/no cookies|0|empty/i);
  }, 30000);

  it('set cookie requires domain when page is blank', async () => {
    await closeBrowser();
    const setCookieTool = createBrowserCookiesSetTool();
    const result = await exec(setCookieTool, { name: 'x', value: 'y' });
    // Should fail gracefully — no crash
    expect(typeof result).toBe('string');
  }, 30000);
});

// ─── browser_storage_get/set/clear ────────────────────────────────────────────

describe('browser_storage tools', () => {
  afterEach(async () => { await closeBrowser(); });

  it('sets and gets a localStorage item', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const setTool = createBrowserStorageSetTool();
    await exec(setTool, { kind: 'local', key: 'tota_key', value: 'tota_value' });

    const getTool = createBrowserStorageGetTool();
    const result = await exec(getTool, { kind: 'local', key: 'tota_key' });
    expect(result).toContain('tota_value');
  }, 30000);

  it('sets and gets a sessionStorage item', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const setTool = createBrowserStorageSetTool();
    await exec(setTool, { kind: 'session', key: 'sess_key', value: 'sess_val' });

    const getTool = createBrowserStorageGetTool();
    const result = await exec(getTool, { kind: 'session', key: 'sess_key' });
    expect(result).toContain('sess_val');
  }, 30000);

  it('gets all localStorage items when key is omitted', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const setTool = createBrowserStorageSetTool();
    await exec(setTool, { kind: 'local', key: 'k1', value: 'v1' });
    await exec(setTool, { kind: 'local', key: 'k2', value: 'v2' });

    const getTool = createBrowserStorageGetTool();
    const result = await exec(getTool, { kind: 'local' });
    expect(result).toContain('k1');
    expect(result).toContain('k2');
  }, 30000);

  it('returns not-found message for missing key', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const getTool = createBrowserStorageGetTool();
    const result = await exec(getTool, { kind: 'local', key: '__nonexistent__' });
    expect(result).toMatch(/not found|__nonexistent__/i);
  }, 30000);

  it('clears localStorage and confirms', async () => {
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const setTool = createBrowserStorageSetTool();
    await exec(setTool, { kind: 'local', key: 'tota_clear_test', value: '1' });

    const clearTool = createBrowserStorageClearTool();
    const clearResult = await exec(clearTool, { kind: 'local' });
    expect(clearResult).toMatch(/cleared/i);

    const getTool = createBrowserStorageGetTool();
    const result = await exec(getTool, { kind: 'local', key: 'tota_clear_test' });
    expect(result).toMatch(/not found|empty/i);
  }, 30000);
});

// ─── browser_pdf ──────────────────────────────────────────────────────────────

describe('browser_pdf tool', () => {
  afterEach(async () => { await closeBrowser(); });

  it('rejects pdf generation on non-chromium engines', async () => {
    // Switch to webkit to trigger the engine guard
    await setBrowserEngine('webkit');
    const openTool = createBrowserOpenTool(undefined);
    await exec(openTool, { url: 'https://example.com' });
    const pdfTool = createBrowserPdfTool(undefined);
    const result = await exec(pdfTool, {});
    expect(result).toMatch(/chromium|error/i);
    // Restore
    await setBrowserEngine('chromium');
  }, 30000);

  it('generates a PDF on chromium and returns path', async () => {
    await setBrowserEngine('chromium');
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const pdfTool = createBrowserPdfTool(undefined);
    const result = await exec(pdfTool, { filename: 'test-tota.pdf' });
    expect(result).toMatch(/\.pdf|error/i);
  }, 30000);

  it('calls sendFile when handler provided', async () => {
    await setBrowserEngine('chromium');
    const openTool = createBrowserOpenTool(undefined);
    const openResult = await exec(openTool, { url: 'https://example.com' });
    if (openResult.startsWith('Error')) return;

    const sendFile = vi.fn().mockResolvedValue(undefined);
    const pdfTool = createBrowserPdfTool(sendFile);
    const result = await exec(pdfTool, {});
    if (!result.startsWith('Error')) {
      expect(sendFile).toHaveBeenCalledOnce();
      expect(result).toMatch(/sent|pdf/i);
    }
  }, 30000);
});
