import { describe, expect, it, vi } from 'vitest';
import { loadMCPTools } from './mcp-loader.js';
import type { MCPServerConfig } from '../../utils/config.js';

function makeServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: 'test',
    url: 'http://localhost:9999/mcp',
    enabled: true,
    ...overrides,
  };
}

describe('loadMCPTools', () => {
  it('returns empty object when no servers provided', async () => {
    const tools = await loadMCPTools([]);
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('skips disabled servers', async () => {
    const tools = await loadMCPTools([makeServer({ enabled: false })]);
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('loads tools from a mock MCP server', async () => {
    const origFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      // First call: tools/list
      if (callCount === 1) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'echo', description: 'Echo the input', inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Text to echo' } }, required: ['text'] } },
              { name: 'add', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } },
            ],
          },
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as any;

    try {
      const tools = await loadMCPTools([makeServer()]);
      expect(Object.keys(tools)).toContain('mcp_test_echo');
      expect(Object.keys(tools)).toContain('mcp_test_add');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('prefixes tool names with mcp_<serverName>_', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1,
      result: { tools: [{ name: 'do_thing' }] },
    }), { status: 200 })) as any;

    try {
      const tools = await loadMCPTools([makeServer({ name: 'myserver' })]);
      expect(Object.keys(tools)).toContain('mcp_myserver_do_thing');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles server fetch error gracefully and returns empty', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error('connection refused'); }) as any;

    try {
      const tools = await loadMCPTools([makeServer()]);
      expect(Object.keys(tools)).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles HTTP error response gracefully', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('', { status: 500 })) as any;

    try {
      const tools = await loadMCPTools([makeServer()]);
      expect(Object.keys(tools)).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('calls tools/call and returns result string', async () => {
    const origFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn(async (_, init: any) => {
      callCount++;
      const body = JSON.parse(init.body);
      if (body.method === 'tools/list') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id: 1,
          result: { tools: [{ name: 'greet', description: 'Say hello', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }] },
        }), { status: 200 });
      }
      if (body.method === 'tools/call') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id: 2,
          result: { content: [{ type: 'text', text: `Hello, ${body.params.arguments.name}!` }] },
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as any;

    try {
      const tools = await loadMCPTools([makeServer()]);
      const greetTool = tools['mcp_test_greet'] as any;
      expect(greetTool).toBeDefined();
      const result = await greetTool.execute({ name: 'tota' });
      expect(result).toBe('Hello, tota!');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('sends apiKey as Authorization header when provided', async () => {
    const origFetch = globalThis.fetch;
    const headers: Record<string, string>[] = [];
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      headers.push(init.headers || {});
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } }), { status: 200 });
    }) as any;

    try {
      await loadMCPTools([makeServer({ apiKey: 'secret-token' })]);
      expect(headers[0]['Authorization']).toBe('Bearer secret-token');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('loads tools from multiple servers', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      const toolName = urlStr.includes('9001') ? 'tool_a' : 'tool_b';
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { tools: [{ name: toolName }] },
      }), { status: 200 });
    }) as any;

    try {
      const tools = await loadMCPTools([
        makeServer({ name: 'server1', url: 'http://localhost:9001/mcp' }),
        makeServer({ name: 'server2', url: 'http://localhost:9002/mcp' }),
      ]);
      expect(Object.keys(tools)).toContain('mcp_server1_tool_a');
      expect(Object.keys(tools)).toContain('mcp_server2_tool_b');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
