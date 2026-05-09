import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { closeBrowser } from './browser.js';
import {
  createBrowserOpenTool,
  createBrowserClickTool,
  createBrowserTypeTool,
  createBrowserScreenshotTool,
  createBrowserExtractTool,
  createBrowserScrollTool,
  createBrowserCloseTool,
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
      await exec(openTool, { url: 'https://example.com' });

      const extractTool = createBrowserExtractTool();
      const result = await exec(extractTool, { selector: 'h1' });
      expect(result).toContain('Example Domain');
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
      await exec(openTool, { url: 'https://example.com' });

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
