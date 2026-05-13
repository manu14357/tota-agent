import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createWebSearchTool } from './web-search.js';
import type { WebSearchConfig } from '../../utils/config.js';

// Helper to extract execute fn from a tool object
function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

function makeConfig(overrides: Partial<WebSearchConfig> = {}): WebSearchConfig {
  return {
    enabled: true,
    provider: 'auto',
    apiKey: '',
    maxResults: 3,
    ...overrides,
  };
}

describe('web_search tool — disabled state', () => {
  it('returns disabled message when enabled=false', async () => {
    const tool = createWebSearchTool(() => makeConfig({ enabled: false }));
    const result = await execute(tool, { query: 'test' });
    expect(result).toMatch(/disabled/i);
  });

  it('returns no-provider message when enabled but no API key', async () => {
    // Ensure env vars absent for this test
    const origBrave = process.env.BRAVE_API_KEY;
    const origSerper = process.env.SERPER_API_KEY;
    const origTavily = process.env.TAVILY_API_KEY;
    delete process.env.BRAVE_API_KEY;
    delete process.env.SERPER_API_KEY;
    delete process.env.TAVILY_API_KEY;

    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto', apiKey: '' }));
      const result = await execute(tool, { query: 'test' });
      expect(result).toMatch(/no provider|api key/i);
    } finally {
      if (origBrave !== undefined) process.env.BRAVE_API_KEY = origBrave;
      if (origSerper !== undefined) process.env.SERPER_API_KEY = origSerper;
      if (origTavily !== undefined) process.env.TAVILY_API_KEY = origTavily;
    }
  });

  it('returns missing key message when provider specified but key absent', async () => {
    const origSerper = process.env.SERPER_API_KEY;
    delete process.env.SERPER_API_KEY;
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'serper', apiKey: '' }));
      const result = await execute(tool, { query: 'test' });
      expect(result).toMatch(/api key|missing|key/i);
    } finally {
      if (origSerper !== undefined) process.env.SERPER_API_KEY = origSerper;
    }
  });
});

describe('web_search tool — provider detection', () => {
  it('detects brave when BRAVE_API_KEY is set in env', async () => {
    const fetches: RequestInit[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      fetches.push(url);
      return new Response(JSON.stringify({ web: { results: [{ title: 'R', url: 'https://example.com', description: 'Snippet' }] } }), { status: 200 });
    }) as any;

    process.env.BRAVE_API_KEY = 'test-brave-key';
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto', apiKey: '' }));
      const result = await execute(tool, { query: 'tota agent' });
      expect(result).toContain('brave');
      expect(result).toContain('example.com');
    } finally {
      delete process.env.BRAVE_API_KEY;
      globalThis.fetch = origFetch;
    }
  });

  it('returns formatted results with title, url, snippet', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      web: {
        results: [
          { title: 'Test Result', url: 'https://test.com', description: 'A test snippet' },
        ],
      },
    }), { status: 200 })) as any;

    process.env.BRAVE_API_KEY = 'fake-key';
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto' }));
      const result = await execute(tool, { query: 'hello' });
      expect(result).toContain('Test Result');
      expect(result).toContain('https://test.com');
      expect(result).toContain('A test snippet');
    } finally {
      delete process.env.BRAVE_API_KEY;
      globalThis.fetch = origFetch;
    }
  });

  it('returns no-results message when API returns empty array', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })) as any;

    process.env.BRAVE_API_KEY = 'fake-key';
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto' }));
      const result = await execute(tool, { query: 'nothing' });
      expect(result).toMatch(/no results/i);
    } finally {
      delete process.env.BRAVE_API_KEY;
      globalThis.fetch = origFetch;
    }
  });

  it('handles fetch failure gracefully', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error('network error'); }) as any;

    process.env.BRAVE_API_KEY = 'fake-key';
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto' }));
      const result = await execute(tool, { query: 'test' });
      expect(result).toMatch(/failed|error/i);
    } finally {
      delete process.env.BRAVE_API_KEY;
      globalThis.fetch = origFetch;
    }
  });
});

describe('web_search tool — serper provider', () => {
  it('uses serper endpoint and parses organic results', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        organic: [{ title: 'Serper Result', link: 'https://serper.com', snippet: 'Serper snippet' }],
      }), { status: 200 });
    }) as any;

    process.env.SERPER_API_KEY = 'test-serper';
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto', apiKey: '' }));
      const result = await execute(tool, { query: 'test serper' });
      expect(calls[0]).toContain('serper');
      expect(result).toContain('Serper Result');
    } finally {
      delete process.env.SERPER_API_KEY;
      globalThis.fetch = origFetch;
    }
  });
});

describe('web_search tool — tavily provider', () => {
  it('uses tavily endpoint and parses results', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        results: [{ title: 'Tavily Result', url: 'https://tavily.com', content: 'Tavily content' }],
      }), { status: 200 });
    }) as any;

    process.env.TAVILY_API_KEY = 'test-tavily';
    try {
      const tool = createWebSearchTool(() => makeConfig({ provider: 'auto', apiKey: '' }));
      const result = await execute(tool, { query: 'test tavily' });
      expect(calls[0]).toContain('tavily');
      expect(result).toContain('Tavily Result');
    } finally {
      delete process.env.TAVILY_API_KEY;
      globalThis.fetch = origFetch;
    }
  });
});

// ─── detectProvider regression: BRAVE_API_KEY env var takes precedence ────────
// Regression test for the dead-code bug in detectProvider() where the second
// condition `cfg.apiKey === process.env.BRAVE_API_KEY` was unreachable.
// After the fix: only BRAVE_API_KEY env var is checked.

describe('web_search tool — detectProvider fix regression', () => {
  it('uses brave when BRAVE_API_KEY env is set, regardless of cfg.apiKey', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 });
    }) as any;

    process.env.BRAVE_API_KEY = 'env-brave-key';
    // cfg.apiKey intentionally different to prove env wins, not cfg match
    const tool = createWebSearchTool(() => makeConfig({ provider: 'auto', apiKey: 'something-else' }));
    try {
      await execute(tool, { query: 'regression' });
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain('brave');
    } finally {
      delete process.env.BRAVE_API_KEY;
      globalThis.fetch = origFetch;
    }
  });

  it('falls through to serper when BRAVE_API_KEY is absent but SERPER_API_KEY is set', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ organic: [] }), { status: 200 });
    }) as any;

    delete process.env.BRAVE_API_KEY;
    process.env.SERPER_API_KEY = 'env-serper-key';
    const tool = createWebSearchTool(() => makeConfig({ provider: 'auto', apiKey: '' }));
    try {
      await execute(tool, { query: 'fallthrough' });
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain('serper');
    } finally {
      delete process.env.SERPER_API_KEY;
      globalThis.fetch = origFetch;
    }
  });
});
