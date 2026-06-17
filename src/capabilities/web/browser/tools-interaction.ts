import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { getPage, ensureScreenshotDir, SCREENSHOT_DIR } from './lifecycle.js';

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
