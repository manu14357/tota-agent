import { tool, zodSchema } from 'ai';
import type { Tool } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import type { MCPServerConfig } from '../../utils/config.js';

interface MCPToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

async function fetchMCPTools(server: MCPServerConfig): Promise<MCPToolDef[]> {
  const resp = await fetch(server.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(server.apiKey ? { 'Authorization': `Bearer ${server.apiKey}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = await resp.json() as any;
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return (body.result?.tools || body.result || []) as MCPToolDef[];
}

async function callMCPTool(server: MCPServerConfig, toolName: string, args: Record<string, unknown>): Promise<string> {
  const resp = await fetch(server.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(server.apiKey ? { 'Authorization': `Bearer ${server.apiKey}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = await resp.json() as any;
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));

  const result = body.result;
  if (typeof result === 'string') return result;
  if (Array.isArray(result?.content)) {
    return result.content.map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
  }
  return JSON.stringify(result);
}

function buildToolSchema(inputSchema?: Record<string, any>): z.ZodTypeAny {
  if (!inputSchema || inputSchema.type !== 'object' || !inputSchema.properties) {
    return z.record(z.unknown()).optional().default({});
  }
  const shape: Record<string, z.ZodTypeAny> = {};
  const required: string[] = inputSchema.required || [];
  for (const [key, propDef] of Object.entries(inputSchema.properties as Record<string, any>)) {
    let field: z.ZodTypeAny;
    switch (propDef.type) {
      case 'string': field = z.string(); break;
      case 'number': field = z.number(); break;
      case 'integer': field = z.number().int(); break;
      case 'boolean': field = z.boolean(); break;
      case 'array': field = z.array(z.unknown()); break;
      default: field = z.unknown();
    }
    if (propDef.description) field = (field as any).describe(propDef.description);
    if (!required.includes(key)) field = field.optional();
    shape[key] = field;
  }
  return z.object(shape);
}

export async function loadMCPTools(servers: MCPServerConfig[]): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};
  // M13: track which prefixed names we've already registered so a collision
  // surfaces as a warning instead of silently overwriting the first
  // server's tool. The most common cause is two servers with the same
  // `server.name` field — uncommon, but possible if the user hand-edits
  // tota.yaml.
  const seenNames = new Map<string, string>(); // prefixedName -> server.name

  // Single pass: load tools and detect collisions inline. Loading each
  // server once is important — some test mocks return different responses
  // for the second tools/list call.
  for (const server of servers) {
    if (!server.enabled) continue;

    let mcpTools: MCPToolDef[];
    try {
      logger.info({ server: server.name, url: server.url }, 'Loading MCP tools');
      mcpTools = await fetchMCPTools(server);
      logger.info({ server: server.name, count: mcpTools.length }, 'Loaded MCP tool definitions');
    } catch (err: any) {
      logger.warn({ server: server.name, err: err.message }, 'Failed to load MCP tools from server');
      continue;
    }

    for (const def of mcpTools) {
      // M13: short prefix by default (mcp_<toolName>). If we've already
      // seen this def name from another server, fall back to the full
      // prefix (mcp_<serverName>_<toolName>) to disambiguate. Same-server
      // collisions (two tools with the same name) get the full prefix
      // automatically.
      const alreadySeenFromOtherServer = seenNames.has(`mcp_${def.name}`)
        && seenNames.get(`mcp_${def.name}`) !== server.name;
      const prefixedName = alreadySeenFromOtherServer
        ? `mcp_${server.name}_${def.name}`
        : `mcp_${def.name}`;

      if (seenNames.has(prefixedName) && seenNames.get(prefixedName) !== server.name) {
        logger.warn(
          { prefixedName, existingServer: seenNames.get(prefixedName), newServer: server.name },
          'MCP tool name collision — overwriting previous tool with same name',
        );
      }
      seenNames.set(prefixedName, server.name);

      const schema = buildToolSchema(def.inputSchema);
      tools[prefixedName] = tool({
        description: def.description
          ? `[MCP:${server.name}] ${def.description}`
          : `MCP tool "${def.name}" from server "${server.name}"`,
        inputSchema: zodSchema(schema as z.ZodType<Record<string, unknown>>),
        execute: async (args: Record<string, unknown>) => {
          try {
            return await callMCPTool(server, def.name, args);
          } catch (err: any) {
            logger.warn({ server: server.name, tool: def.name, err: err.message }, 'MCP tool call failed');
            return `MCP tool "${def.name}" failed: ${err.message}`;
          }
        },
      }) as Tool;
    }
  }

  return tools;
}
