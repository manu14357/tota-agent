import { createServer, IncomingMessage, ServerResponse, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { join, extname, basename, resolve as resolvePath, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { BaseChannel } from './base.js';
import type { ChannelType } from '../types/channel.js';
import { logger } from '../utils/logger.js';
import {
  loadConfig,
  saveConfig,
  getTotaHome,
} from '../utils/config.js';
import { loadSchedules, saveSchedules } from '../core/scheduler.js';
import { ShortTermMemory, LongTermMemory } from '../memory/store.js';
import { UserMemoryStore } from '../memory/user-memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function readBody(req: IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Too large'), { code: 'ETOOLARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return '***' + key.slice(-4);
}

// ---------------------------------------------------------------------------
// UI Channel
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (text: string) => void;
  timer: NodeJS.Timeout;
}

export class UIChannel extends BaseChannel {
  readonly type: ChannelType = 'ui';

  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private pending = new Map<string, PendingRequest>();
  private pendingPermission = new Map<string, (mode: import('./base.js').PermissionMode) => void>();
  private currentChannelId: string | null = null;
  private wsClients = new Set<WebSocket>();
  private uiDistDir: string;
  private readonly startedAt = Date.now();

  constructor(private readonly port: number) {
    super();
    // dist/ui/ is a sibling of dist/index.js — resolve directly
    this.uiDistDir = fileURLToPath(new URL('./ui/', import.meta.url));
  }

  async start(): Promise<void> {
    this.httpServer = createServer((req, res) => {
      void this.handleHttp(req, res);
    });

    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws) => this.handleWsConnection(ws));

    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = req.url?.split('?')[0];
      if (url === '/ws') {
        if (!isLoopback(req)) {
          socket.destroy();
          return;
        }
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, '127.0.0.1', () => {
        logger.info({ port: this.getPort() }, 'UI server listening on http://127.0.0.1');
        this.ready = true;
        resolve();
      });
      this.httpServer!.once('error', reject);
    });
  }

  getPort(): number {
    const addr = this.httpServer?.address();
    return typeof addr === 'object' && addr !== null ? addr.port : this.port;
  }

  async stop(): Promise<void> {
    for (const [, pr] of this.pending) {
      clearTimeout(pr.timer);
      pr.resolve('[Server shutting down]');
    }
    this.pending.clear();
    this.wss?.close();
    await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
    this.httpServer = null;
    this.ready = false;
  }

  // --- WebSocket ---

  private handleWsConnection(ws: WebSocket): void {
    this.wsClients.add(ws);
    ws.on('close', () => this.wsClients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; content?: string; requestId?: string; mode?: string };
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (msg.type === 'chat' && msg.content) {
          this.handleChatMessage(ws, msg.content);
          return;
        }
        if (msg.type === 'permissionResponse' && msg.requestId) {
          const resolver = this.pendingPermission.get(msg.requestId);
          if (resolver) {
            this.pendingPermission.delete(msg.requestId);
            resolver(msg.mode === 'allow-all' ? 'allow-all' : 'ask-me');
          }
        }
      } catch {
        // ignore malformed messages
      }
    });
  }

  private handleChatMessage(ws: WebSocket, content: string): void {
    const requestId = randomUUID();
    this.currentChannelId = requestId;

    const send = (obj: object) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    send({ type: 'status', status: 'thinking', requestId });

    const timeoutMs = 120_000;
    const timer = setTimeout(() => {
      this.pending.delete(requestId);
      send({ type: 'done', requestId, response: '[Request timed out]' });
    }, timeoutMs);

    this.pending.set(requestId, {
      resolve: (text) => {
        clearTimeout(timer);
        send({ type: 'done', requestId, response: text });
      },
      timer,
    });

    this.emit({
      id: requestId,
      content,
      channelType: 'ui',
      channelId: requestId,
      timestamp: Date.now(),
      senderId: 'ui-user',
    });
  }

  // Broadcast a message to all connected WS clients (used for streaming)
  broadcast(obj: object): void {
    const data = JSON.stringify(obj);
    for (const ws of this.wsClients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  // --- HTTP ---

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isLoopback(req)) {
      json(res, 403, { error: 'Forbidden: loopback only' });
      return;
    }

    const rawUrl = req.url ?? '/';
    const [pathname, queryStr] = rawUrl.split('?');
    const url = pathname;
    const method = req.method ?? 'GET';

    // Add CORS headers for localhost development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // --- REST API ---
    if (url.startsWith('/api/')) {
      await this.handleApi(method, url, queryStr ?? '', req, res);
      return;
    }

    // --- Logo assets: serve from dist/ui/ (copied there during build) ---
    if (url === '/tota-agent.png' || url === '/tota-agent-txt.png') {
      const logoPath = join(this.uiDistDir, url.slice(1));
      if (existsSync(logoPath)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=86400' });
        createReadStream(logoPath).pipe(res);
      } else {
        res.writeHead(404); res.end();
      }
      return;
    }

    // --- Static files ---
    this.serveStatic(url, res);
  }

  private async handleApi(
    method: string,
    url: string,
    _queryStr: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      // GET /api/file?path=<encoded_path> — serve a local file (loopback only)
      if (url === '/api/file' && method === 'GET') {
        const params = new URLSearchParams(_queryStr);
        const rawPath = params.get('path') ?? '';
        if (!rawPath) { json(res, 400, { error: 'Missing path' }); return; }
        const filePath = isAbsolute(rawPath) ? rawPath : resolvePath(rawPath);
        if (!existsSync(filePath)) { res.writeHead(404); res.end(); return; }
        const stat = statSync(filePath);
        if (stat.isDirectory()) { res.writeHead(400); res.end(); return; }
        const ext = extname(filePath).toLowerCase();
        const mimeType = MIME[ext] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': stat.size,
          'Cache-Control': 'private, max-age=60',
          'Content-Disposition': `inline; filename="${basename(filePath)}"`,
        });
        createReadStream(filePath).pipe(res);
        return;
      }

      // GET /api/status
      if (url === '/api/status' && method === 'GET') {
        const config = loadConfig();
        const defaultProvider = config.providers.default as string;
        const providerConf = (config.providers as unknown as Record<string, { model?: string }>)[defaultProvider];
        json(res, 200, {
          name: config.identity?.name ?? 'tota',
          status: this.ready ? 'running' : 'sleeping',
          provider: defaultProvider ?? 'unknown',
          model: providerConf?.model ?? 'unknown',
          uptime: Math.floor((Date.now() - this.startedAt) / 1000),
          activeChannels: ['ui'],
          version: '1.2.0',
        });
        return;
      }

      // GET /api/config
      if (url === '/api/config' && method === 'GET') {
        const config = loadConfig();
        // Mask all API keys before sending
        const safe = JSON.parse(JSON.stringify(config));
        for (const [prov, pconf] of Object.entries(safe.providers ?? {})) {
          if (pconf && typeof pconf === 'object' && 'apiKey' in pconf) {
            (safe.providers[prov] as Record<string, unknown>).apiKey = maskKey(
              (pconf as Record<string, unknown>).apiKey as string,
            );
          }
        }
        if (safe.channels?.telegram?.botToken) {
          safe.channels.telegram.botToken = maskKey(safe.channels.telegram.botToken);
        }
        if (safe.channels?.api?.apiKey) {
          safe.channels.api.apiKey = maskKey(safe.channels.api.apiKey);
        }
        json(res, 200, safe);
        return;
      }

      // PATCH /api/config
      if (url === '/api/config' && method === 'PATCH') {
        let patch: Record<string, unknown>;
        try {
          patch = JSON.parse(await readBody(req));
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }
        const config = loadConfig();
        // Deep merge top-level sections only (no key replacement if value is masked)
        const configAny = config as unknown as Record<string, unknown>;
        for (const [section, value] of Object.entries(patch)) {
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            configAny[section] = { ...(configAny[section] as object), ...value };
          } else {
            configAny[section] = value;
          }
        }
        saveConfig(config);
        json(res, 200, { saved: true });
        return;
      }

      // GET /api/providers
      if (url === '/api/providers' && method === 'GET') {
        const config = loadConfig();
        const result = Object.entries(config.providers)
          .filter(([key]) => key !== 'default')
          .map(([name, pconf]) => {
            const p = pconf as unknown as Record<string, unknown>;
            return {
              name,
              ...p,
              apiKey: p['apiKey'] ? maskKey(p['apiKey'] as string) : '',
            };
          });
        json(res, 200, result);
        return;
      }

      // PATCH /api/providers/:name
      const providerMatch = url.match(/^\/api\/providers\/([^/]+)$/);
      if (providerMatch && method === 'PATCH') {
        const name = providerMatch[1];
        let patch: Record<string, unknown>;
        try {
          patch = JSON.parse(await readBody(req));
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }
        const config = loadConfig();
        const providers = config.providers as unknown as Record<string, Record<string, unknown>>;
        if (!providers[name]) {
          json(res, 404, { error: 'Provider not found' });
          return;
        }
        // Don't overwrite key with masked value
        if (typeof patch.apiKey === 'string' && patch.apiKey.startsWith('***')) {
          delete patch.apiKey;
        }
        providers[name] = { ...providers[name], ...patch };
        saveConfig(config);
        json(res, 200, { saved: true });
        return;
      }

      // GET /api/memory/short-term
      if (url === '/api/memory/short-term' && method === 'GET') {
        // Return the most recent 50 messages from the default conversation
        const memory = new ShortTermMemory(loadConfig());
        const recent = memory.getRecent('default', 50);
        json(res, 200, recent);
        return;
      }

      // GET /api/memory/long-term
      if (url === '/api/memory/long-term' && method === 'GET') {
        const memory = new LongTermMemory(loadConfig());
        const facts = memory.getAll().map((f) => ({
          id: f.id,
          timestamp: f.timestamp,
          content: `[${f.topic}] ${f.fact}`,
          tags: [f.source].filter(Boolean),
        }));
        json(res, 200, facts);
        return;
      }

      // GET /api/memory/second-brain
      if (url === '/api/memory/second-brain' && method === 'GET') {
        const cfg = loadConfig();
        const store = new UserMemoryStore(cfg);
        const summary = store.getSummary();
        json(res, 200, summary);
        return;
      }

      // GET /api/schedules
      if (url === '/api/schedules' && method === 'GET') {
        json(res, 200, loadSchedules());
        return;
      }

      // DELETE /api/schedules/:id
      const scheduleDeleteMatch = url.match(/^\/api\/schedules\/([^/]+)$/);
      if (scheduleDeleteMatch && method === 'DELETE') {
        const id = scheduleDeleteMatch[1];
        const tasks = loadSchedules().filter((t) => t.id !== id);
        saveSchedules(tasks);
        json(res, 200, { deleted: true });
        return;
      }

      // GET /api/skills
      if (url === '/api/skills' && method === 'GET') {
        const { SkillLoader } = await import('../skills/loader.js');
        const loader = new SkillLoader();
        const skills = loader.discover();
        json(res, 200, skills);
        return;
      }

      // GET /api/logs
      if (url === '/api/logs' && method === 'GET') {
        const logPath = join(getTotaHome(), 'daemon.log');
        if (!existsSync(logPath)) {
          json(res, 200, []);
          return;
        }
        try {
          const raw = readFileSync(logPath, 'utf-8');
          const lines = raw.trim().split('\n').filter(Boolean).slice(-200);
          const parsed = lines.map((l) => {
            try { return JSON.parse(l); } catch { return { msg: l }; }
          });
          json(res, 200, parsed);
        } catch {
          json(res, 200, []);
        }
        return;
      }

      // GET /api/telegram/users
      if (url === '/api/telegram/users' && method === 'GET') {
        const config = loadConfig();
        json(res, 200, {
          admins: config.channels.telegram.admins,
          members: config.channels.telegram.members,
          pending: config.channels.telegram.pending,
        });
        return;
      }

      // DELETE /api/telegram/users/:userId
      const telegramUserMatch = url.match(/^\/api\/telegram\/users\/(\d+)$/);
      if (telegramUserMatch && method === 'DELETE') {
        const userId = Number(telegramUserMatch[1]);
        const config = loadConfig();
        config.channels.telegram.admins = config.channels.telegram.admins.filter(
          (u) => u.userId !== userId,
        );
        config.channels.telegram.members = config.channels.telegram.members.filter(
          (u) => u.userId !== userId,
        );
        saveConfig(config);
        json(res, 200, { deleted: true });
        return;
      }

      // GET /api/whatsapp/users
      if (url === '/api/whatsapp/users' && method === 'GET') {
        const config = loadConfig();
        json(res, 200, {
          approved: config.channels.whatsapp.approved,
          pending: config.channels.whatsapp.pending,
        });
        return;
      }

      // DELETE /api/whatsapp/users/:phone
      const waUserMatch = url.match(/^\/api\/whatsapp\/users\/(.+)$/);
      if (waUserMatch && method === 'DELETE') {
        const phone = decodeURIComponent(waUserMatch[1]);
        const config = loadConfig();
        config.channels.whatsapp.approved = config.channels.whatsapp.approved.filter(
          (u) => u.phone !== phone,
        );
        saveConfig(config);
        json(res, 200, { deleted: true });
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error({ err }, 'UI API error');
      json(res, 500, { error: 'Internal server error' });
    }
  }

  private serveStatic(url: string, res: ServerResponse): void {
    // Normalize and sanitise path
    const safeUrl = url.replace(/\.\./g, '').replace(/\/+/g, '/') || '/';
    let fsPath = join(this.uiDistDir, safeUrl === '/' ? 'index.html' : safeUrl);

    // SPA fallback: no extension → index.html
    if (!existsSync(fsPath) || (existsSync(fsPath) && statSync(fsPath).isDirectory())) {
      fsPath = join(this.uiDistDir, 'index.html');
    }

    if (!existsSync(fsPath)) {
      // No UI built yet — serve a minimal loading page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>tota</title><style>*{box-sizing:border-box;margin:0}body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#e2e8f0}div{text-align:center}img{width:72px;height:72px;border-radius:16px;margin-bottom:16px}h1{font-size:1.75rem;font-weight:700;margin-bottom:8px}p{color:#64748b;margin-bottom:20px}code{background:#1e293b;padding:8px 18px;border-radius:8px;font-size:.875rem;font-family:monospace}</style></head>
<body><div><img src="/tota-agent.png" alt="tota"><h1>tota agent</h1><p>UI assets not built yet.</p><code>npm run build:ui</code></div></body></html>`);
      return;
    }

    const ext = extname(fsPath).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    createReadStream(fsPath).pipe(res);
  }

  // --- BaseChannel contract ---

  async send(content: string, targetId?: string): Promise<void> {
    const id = targetId ?? this.currentChannelId;
    if (!id) return;

    // Only treat [Using: tool_name] formatted messages as intermediate tool steps.
    // Everything else (errors, final answers) should resolve the pending request.
    const isToolStep = /^\[Using:\s*.+\]$/.test(content.trim());

    const pending = this.pending.get(id);
    if (pending && isToolStep) {
      // Intermediate tool step — show progress in UI without finalizing the request
      this.broadcast({ type: 'step', targetId: id, content });
    } else if (pending) {
      // Final message (error, answer, budget exceeded, etc.) — resolve pending → sends 'done'
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.resolve(content);
    } else {
      // No pending — broadcast as a standalone message
      this.broadcast({ type: 'message', targetId: id, content });
    }
  }

  async sendFile(filePath: string, targetId?: string): Promise<void> {
    const id = targetId ?? this.currentChannelId;
    const name = basename(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME[ext] ?? 'application/octet-stream';
    const isImage = IMAGE_EXTS.has(ext);
    let size = 0;
    try { size = statSync(filePath).size; } catch { /* ignore */ }
    this.broadcast({
      type: 'file',
      targetId: id,
      filePath,
      name,
      mimeType,
      isImage,
      size,
    });
  }

  async stream(content: AsyncIterable<string>, targetId?: string): Promise<string> {
    const id = targetId ?? this.currentChannelId ?? '';
    const chunks: string[] = [];
    for await (const chunk of content) {
      chunks.push(chunk);
      this.broadcast({ type: 'chunk', targetId: id, chunk });
    }
    const full = chunks.join('');
    // Resolve pending directly → sends 'done' without an extra 'message' broadcast
    // (the UI already has all the text from the chunk stream)
    const pending = this.pending.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.resolve(full);
    }
    return full;
  }

  async typing(): Promise<void> {
    this.broadcast({ type: 'status', status: 'typing' });
  }

  async askToContinue(): Promise<boolean> {
    return true;
  }

  async askPermissionMode(targetId?: string): Promise<import('./base.js').PermissionMode> {
    const id = targetId ?? this.currentChannelId;
    if (!id) return 'ask-me';
    return new Promise((resolve) => {
      this.broadcast({ type: 'askPermission', targetId: id });
      this.pendingPermission.set(id, resolve);
      const timer = setTimeout(() => {
        if (this.pendingPermission.has(id)) {
          this.pendingPermission.delete(id);
          resolve('ask-me');
        }
      }, 60_000);
      // override resolve to also clear timer
      const orig = resolve;
      this.pendingPermission.set(id, (mode) => { clearTimeout(timer); orig(mode); });
    });
  }
}
