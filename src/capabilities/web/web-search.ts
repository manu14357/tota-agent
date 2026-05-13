import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import type { WebSearchConfig } from '../../utils/config.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchBrave(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Brave Search HTTP ${resp.status}`);
  const data = await resp.json() as any;
  return (data.web?.results || []).slice(0, maxResults).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }));
}

async function searchSerper(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Serper HTTP ${resp.status}`);
  const data = await resp.json() as any;
  return (data.organic || []).slice(0, maxResults).map((r: any) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
  }));
}

async function searchTavily(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
  const data = await resp.json() as any;
  return (data.results || []).slice(0, maxResults).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
  }));
}

function detectProvider(cfg: WebSearchConfig): 'brave' | 'serper' | 'tavily' | null {
  if (cfg.provider !== 'auto') return cfg.provider;
  if (process.env.BRAVE_API_KEY) return 'brave';
  if (process.env.SERPER_API_KEY) return 'serper';
  if (process.env.TAVILY_API_KEY) return 'tavily';
  return null;
}

function resolveApiKey(provider: 'brave' | 'serper' | 'tavily', cfg: WebSearchConfig): string {
  if (cfg.apiKey) return cfg.apiKey;
  if (provider === 'brave') return process.env.BRAVE_API_KEY || '';
  if (provider === 'serper') return process.env.SERPER_API_KEY || '';
  if (provider === 'tavily') return process.env.TAVILY_API_KEY || '';
  return '';
}

export function createWebSearchTool(getConfig: () => WebSearchConfig | undefined) {
  return tool({
    description: 'Search the web for up-to-date information. Returns titles, URLs, and summaries of the top results. Use this when you need current information not in your training data.',
    inputSchema: zodSchema(z.object({
      query: z.string().describe('The search query'),
      maxResults: z.number().int().min(1).max(10).optional().describe('Number of results to return (default: 5)'),
    })),
    execute: async ({ query, maxResults }) => {
      const cfg = getConfig();
      if (!cfg?.enabled) {
        return 'Web search is disabled. Set WEB_SEARCH_ENABLED=true and add a BRAVE_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY in your .env to enable it.';
      }

      const provider = detectProvider(cfg);
      if (!provider) {
        return 'Web search is enabled but no provider API key was found. Add BRAVE_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY to your .env file.';
      }

      const apiKey = resolveApiKey(provider, cfg);
      if (!apiKey) {
        return `Web search provider "${provider}" is selected but its API key is missing. Add the appropriate key to your .env file.`;
      }

      const limit = maxResults ?? cfg.maxResults ?? 5;

      try {
        logger.info({ query, provider, limit }, 'Web search');
        let results: SearchResult[];

        if (provider === 'brave') {
          results = await searchBrave(query, apiKey, limit);
        } else if (provider === 'serper') {
          results = await searchSerper(query, apiKey, limit);
        } else {
          results = await searchTavily(query, apiKey, limit);
        }

        if (results.length === 0) {
          return `No results found for: "${query}"`;
        }

        const formatted = results.map((r, i) =>
          `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
        ).join('\n\n');

        return `Search results for "${query}" (via ${provider}):\n\n${formatted}`;
      } catch (err: any) {
        logger.warn({ query, provider, err: err.message }, 'Web search failed');
        return `Web search failed: ${err.message}`;
      }
    },
  });
}
