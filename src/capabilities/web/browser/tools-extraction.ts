import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import {
  getPage,
  ensureScreenshotDir,
  getActiveEngine,
  SCREENSHOT_DIR,
} from './lifecycle.js';

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
      if (getActiveEngine() !== 'chromium') {
        return `Error: browser_pdf is only supported with the chromium engine. Current engine: ${getActiveEngine()}. Switch with browser_engine first.`;
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
