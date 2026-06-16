import { createServer, IncomingMessage, ServerResponse, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, createReadStream, mkdirSync, writeFileSync, unlinkSync, appendFileSync, readdirSync, realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { join, extname, basename, resolve as resolvePath, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { BaseChannel } from './base.js';
import type { ChannelType } from '../types/channel.js';
import { logger } from '../utils/logger.js';
import {
  loadConfig,
  saveConfig,
  getTotaHome,
  getMemoryDir,
} from '../utils/config.js';
import { loadSchedules, saveSchedules, type ScheduledTaskManifest, Scheduler } from '../core/scheduler.js';
import { ShortTermMemory, LongTermMemory } from '../memory/store.js';
import { UserMemoryStore } from '../memory/user-memory.js';
import { SkillLoader } from '../skills/loader.js';

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
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm', '.aac']);

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

async function readBodyRaw(req: IncomingMessage, maxBytes = 50 * 1024 * 1024): Promise<Buffer> {
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
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Parse a multipart/form-data body — lightweight, no external deps. */
function parseMultipart(body: Buffer, boundary: string): Map<string, { filename?: string; data: Buffer; contentType?: string }> {
  const results = new Map<string, { filename?: string; data: Buffer; contentType?: string }>();
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = body.indexOf(delim, start);
    if (idx === -1) break;
    if (start > 0) parts.push(body.subarray(start, idx));
    start = idx + delim.length;
    // skip \r\n after boundary
    if (body[start] === 0x0d) start += 2;
    else if (body[start] === 0x0a) start += 1;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerStr = part.subarray(0, headerEnd).toString('utf-8');
    let data = part.subarray(headerEnd + 4);
    // Remove trailing \r\n
    if (data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, data.length - 2);
    }
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerStr.match(/Content-Type:\s*(.+)/i);
    results.set(name, {
      filename: filenameMatch?.[1],
      data,
      contentType: contentTypeMatch?.[1]?.trim(),
    });
  }
  return results;
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return '***' + key.slice(-4);
}

// Restrict /api/file to these roots. Any other path returns 403.
const FILE_API_ROOTS = (() => {
  const totaHome = getTotaHome();
  return [
    totaHome,
    join(totaHome, 'memory'),
    join(totaHome, 'skills'),
    join(totaHome, 'tmp'),
    join(totaHome, 'tmp', 'uploads'),
    '/tmp',
    process.cwd(),
  ];
})();

function isPathAllowed(filePath: string): boolean {
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch {
    return false;
  }
  for (const root of FILE_API_ROOTS) {
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      continue;
    }
    const prefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
    if (real === realRoot || real.startsWith(prefix)) return true;
  }
  return false;
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
  /** H4: optional scheduler reference for activating schedule changes immediately. */
  private scheduler: Scheduler | null = null;

  constructor(private readonly port: number) {
    super();
    // dist/ui/ is a sibling of dist/index.js — resolve directly
    this.uiDistDir = fileURLToPath(new URL('./ui/', import.meta.url));
  }

  /** Inject the scheduler so schedule POST/PATCH take effect immediately. */
  setScheduler(scheduler: Scheduler | null): void {
    this.scheduler = scheduler;
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
        if (!isPathAllowed(filePath)) {
          logger.warn({ filePath }, 'Blocked /api/file request outside allowed roots');
          json(res, 403, { error: 'Forbidden: path is not in an allowed root' });
          return;
        }
        // Re-stat the realpath to defeat symlink races between existsSync and the stream open
        let stat;
        try { stat = statSync(realpathSync(filePath)); } catch { res.writeHead(404); res.end(); return; }
        if (stat.isDirectory()) { res.writeHead(400); res.end(); return; }
        const ext = extname(filePath).toLowerCase();
        const mimeType = MIME[ext] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': stat.size,
          'Cache-Control': 'private, max-age=60',
          'Content-Disposition': `inline; filename="${basename(filePath)}"`,
        });
        createReadStream(realpathSync(filePath)).pipe(res);
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
        // H4: stop the running cron if there is an in-memory scheduler.
        if (this.scheduler) this.scheduler.removeTask(id);
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

      // ─── File Upload ────────────────────────────────────────────────────
      if (url === '/api/upload' && method === 'POST') {
        try {
          const contentType = req.headers['content-type'] ?? '';
          const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
          if (!boundaryMatch) { json(res, 400, { error: 'Missing multipart boundary' }); return; }
          const rawBody = await readBodyRaw(req, 50 * 1024 * 1024);
          const parts = parseMultipart(rawBody, boundaryMatch[1]);
          const filePart = parts.get('file');
          if (!filePart || !filePart.filename) { json(res, 400, { error: 'No file field in upload' }); return; }
          const uploadDir = join(homedir(), '.tota', 'tmp', 'uploads', 'ui-user');
          mkdirSync(uploadDir, { recursive: true });
          const safeName = filePart.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const localPath = join(uploadDir, `${Date.now()}-${safeName}`);
          writeFileSync(localPath, filePart.data);
          logger.info({ localPath, size: filePart.data.length }, 'UI file uploaded');
          json(res, 200, { path: localPath, filename: filePart.filename, size: filePart.data.length });
        } catch (err: any) {
          if (err.code === 'ETOOLARGE') { json(res, 413, { error: 'File too large (max 50MB)' }); return; }
          logger.error({ err }, 'File upload error');
          json(res, 500, { error: 'Upload failed' });
        }
        return;
      }

      // ─── GET /api/config/agent ──────────────────────────────────────────
      if (url === '/api/config/agent' && method === 'GET') {
        const config = loadConfig();
        const c = config as any;
        json(res, 200, {
          name: config.identity?.name ?? 'tota',
          systemPrompt: c.identity?.personality ?? c.identity?.systemPrompt ?? '',
          temperature: c.temperature ?? 0.7,
          maxTokens: c.maxTokens ?? 4096,
          autoConfirm: c.autoConfirm ?? false,
          memoryEnabled: c.memory?.enabled !== false,
          schedulerEnabled: c.scheduler?.enabled !== false,
        });
        return;
      }

      // ─── PATCH /api/config/agent ─────────────────────────────────────────
      if (url === '/api/config/agent' && method === 'PATCH') {
        let patch: Record<string, unknown>;
        try { patch = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const config = loadConfig();
        const c = config as any;
        if (patch.name !== undefined) { if (!c.identity) c.identity = {}; c.identity.name = patch.name; }
        if (patch.systemPrompt !== undefined) { if (!c.identity) c.identity = {}; c.identity.personality = patch.systemPrompt; }
        if (patch.temperature !== undefined) c.temperature = patch.temperature;
        if (patch.maxTokens !== undefined) c.maxTokens = patch.maxTokens;
        if (patch.autoConfirm !== undefined) c.autoConfirm = patch.autoConfirm;
        if (patch.memoryEnabled !== undefined) { if (!c.memory) c.memory = {}; c.memory.enabled = patch.memoryEnabled; }
        if (patch.schedulerEnabled !== undefined) { if (!c.scheduler) c.scheduler = {}; c.scheduler.enabled = patch.schedulerEnabled; }
        saveConfig(config);
        json(res, 200, { saved: true });
        return;
      }

      // ─── DELETE /api/memory/short-term (clear all) ──────────────────────
      if (url === '/api/memory/short-term' && method === 'DELETE') {
        const memory = new ShortTermMemory(loadConfig());
        memory.clear('default');
        json(res, 200, { deleted: true });
        return;
      }

      // ─── DELETE /api/memory/long-term (clear all) ───────────────────────
      if (url === '/api/memory/long-term' && method === 'DELETE') {
        const ltDir = join(getMemoryDir(), 'long-term');
        const ltFile = join(ltDir, 'facts.jsonl');
        if (existsSync(ltFile)) writeFileSync(ltFile, '', 'utf-8');
        json(res, 200, { deleted: true });
        return;
      }

      // ─── DELETE /api/memory/short-term/:id ──────────────────────────────
      const stDeleteMatch = url.match(/^\/api\/memory\/short-term\/([^/]+)$/);
      if (stDeleteMatch && method === 'DELETE') {
        const id = decodeURIComponent(stDeleteMatch[1]);
        const memory = new ShortTermMemory(loadConfig());
        const deleted = await memory.deleteById('default', id);
        if (!deleted) { json(res, 404, { error: 'Entry not found' }); return; }
        json(res, 200, { deleted: true, id });
        return;
      }

      // ─── DELETE /api/memory/long-term/:id ───────────────────────────────
      const ltDeleteMatch = url.match(/^\/api\/memory\/long-term\/([^/]+)$/);
      if (ltDeleteMatch && method === 'DELETE') {
        const id = decodeURIComponent(ltDeleteMatch[1]);
        const memory = new LongTermMemory(loadConfig());
        const deleted = await memory.deleteById(id);
        if (!deleted) { json(res, 404, { error: 'Fact not found' }); return; }
        json(res, 200, { deleted: true, id });
        return;
      }

      // ─── PATCH /api/memory/short-term/:id ───────────────────────────────
      const stPatchMatch = url.match(/^\/api\/memory\/short-term\/([^/]+)$/);
      if (stPatchMatch && method === 'PATCH') {
        const id = decodeURIComponent(stPatchMatch[1]);
        let patch: Record<string, unknown>;
        try { patch = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const memory = new ShortTermMemory(loadConfig());
        const updated = await memory.updateById('default', id, {
          content: typeof patch.content === 'string' ? patch.content : undefined,
          role: typeof patch.role === 'string' ? (patch.role as any) : undefined,
        });
        if (!updated) { json(res, 404, { error: 'Entry not found' }); return; }
        json(res, 200, { id: updated.id, timestamp: updated.timestamp, content: updated.content, role: updated.role, tags: [] });
        return;
      }

      // ─── PATCH /api/memory/long-term/:id ────────────────────────────────
      const ltPatchMatch = url.match(/^\/api\/memory\/long-term\/([^/]+)$/);
      if (ltPatchMatch && method === 'PATCH') {
        const id = decodeURIComponent(ltPatchMatch[1]);
        let patch: Record<string, unknown>;
        try { patch = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const memory = new LongTermMemory(loadConfig());
        const content = typeof patch.content === 'string' ? patch.content : '';
        // Allow the caller to send either {content: "[topic] fact"} or {topic, fact} pairs
        const topicMatch = content.match(/^\[([^\]]+)\]\s*(.*)$/);
        const topic = topicMatch ? topicMatch[1] : (typeof patch.topic === 'string' ? patch.topic : undefined);
        const fact = topicMatch ? topicMatch[2] : (typeof patch.fact === 'string' ? patch.fact : content);
        const updated = await memory.updateById(id, { topic, fact });
        if (!updated) { json(res, 404, { error: 'Fact not found' }); return; }
        json(res, 200, { id: updated.id, timestamp: updated.timestamp, content: `[${updated.topic}] ${updated.fact}`, tags: [updated.source].filter(Boolean) });
        return;
      }

      // ─── POST /api/memory/short-term ────────────────────────────────────
      if (url === '/api/memory/short-term' && method === 'POST') {
        let body: Record<string, unknown>;
        try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const entry = {
          id: generateId(),
          timestamp: Date.now(),
          role: 'system' as const,
          content: (body.content as string) ?? '',
        };
        const memory = new ShortTermMemory(loadConfig());
        memory.add('default', entry);
        json(res, 201, { id: entry.id, timestamp: entry.timestamp, content: entry.content, tags: (body.tags as string[]) ?? [] });
        return;
      }

      // ─── POST /api/memory/long-term ─────────────────────────────────────
      if (url === '/api/memory/long-term' && method === 'POST') {
        let body: Record<string, unknown>;
        try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const content = (body.content as string) ?? '';
        const tags = (body.tags as string[]) ?? [];
        const topicMatch = content.match(/^\[([^\]]+)\]\s*(.*)$/);
        const topic = topicMatch ? topicMatch[1] : 'general';
        const fact = topicMatch ? topicMatch[2] : content;
        const entry = { id: generateId(), timestamp: Date.now(), topic, fact, source: tags[0] ?? 'ui' };
        const ltDir = join(getMemoryDir(), 'long-term');
        mkdirSync(ltDir, { recursive: true });
        appendFileSync(join(ltDir, 'facts.jsonl'), JSON.stringify(entry) + '\n', 'utf-8');
        json(res, 201, { id: entry.id, timestamp: entry.timestamp, content: `[${topic}] ${fact}`, tags });
        return;
      }

      // ─── DELETE /api/messages (clear chat history) ──────────────────────
      if (url === '/api/messages' && method === 'DELETE') {
        const memory = new ShortTermMemory(loadConfig());
        memory.clear('default');
        json(res, 200, { deleted: true });
        return;
      }

      // ─── PATCH /api/schedules/:id ───────────────────────────────────────
      const schedulePatchMatch = url.match(/^\/api\/schedules\/([^/]+)$/);
      if (schedulePatchMatch && method === 'PATCH') {
        const id = schedulePatchMatch[1];
        let patch: Record<string, unknown>;
        try { patch = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const tasks = loadSchedules();
        const existing = tasks.find((t) => t.id === id);
        if (!existing) { json(res, 404, { error: 'Schedule not found' }); return; }
        // H4: Update the in-memory scheduler so the new cron takes effect
        // immediately (otherwise the change only applies on restart).
        if (this.scheduler) {
          try {
            const updatePatch: Partial<Pick<ScheduledTaskManifest, 'cron' | 'description' | 'prompt' | 'delaySeconds' | 'executeAt' | 'skillName'>> = {};
            if (patch.description !== undefined) updatePatch.description = patch.description as string;
            if (patch.cron !== undefined) updatePatch.cron = patch.cron as string;
            if (patch.prompt !== undefined) updatePatch.prompt = patch.prompt as string;
            this.scheduler.updatePersistedTask(id, updatePatch);
          } catch (err: any) {
            json(res, 400, { error: `Failed to update schedule: ${err?.message ?? err}` });
            return;
          }
        } else {
          // No scheduler reference — fall back to file-only edit.
          const idx = tasks.findIndex((t) => t.id === id);
          const task = tasks[idx] as any;
          if (patch.description !== undefined) task.description = patch.description;
          if (patch.cron !== undefined) task.cron = patch.cron;
          if (patch.enabled !== undefined) task.enabled = patch.enabled;
          tasks[idx] = task;
          saveSchedules(tasks);
        }
        const refreshed = loadSchedules().find((t) => t.id === id);
        json(res, 200, refreshed ?? existing);
        return;
      }

      // ─── POST /api/schedules ────────────────────────────────────────────
      if (url === '/api/schedules' && method === 'POST') {
        let body: Record<string, unknown>;
        try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const task: ScheduledTaskManifest = {
          id: generateId(),
          description: (body.description as string) ?? '',
          cron: (body.cron as string) ?? '0 9 * * *',
          prompt: (body.prompt as string) ?? (body.description as string) ?? '',
          createdAt: new Date().toISOString(),
        };
        // H4: Persist + activate via the scheduler so the new task is
        // registered with node-cron right away (not waiting for a restart).
        if (this.scheduler) {
          if (task.cron) {
            try {
              this.scheduler.addPersistedTask(task);
            } catch (err: any) {
              json(res, 400, { error: `Failed to schedule: ${err?.message ?? err}` });
              return;
            }
          }
        } else {
          // No scheduler ref — fall back to file-only.
          const tasks = loadSchedules();
          tasks.push(task);
          saveSchedules(tasks);
        }
        json(res, 201, { ...task, enabled: true, nextRun: Date.now() + 60000 });
        return;
      }

      // ─── DELETE /api/skills/:name ───────────────────────────────────────
      const skillDeleteMatch = url.match(/^\/api\/skills\/([^/]+)$/);
      if (skillDeleteMatch && method === 'DELETE') {
        const name = decodeURIComponent(skillDeleteMatch[1]);
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
          json(res, 400, { error: 'Invalid skill name in URL.' });
          return;
        }
        const loader = new SkillLoader();
        const deleted = loader.deleteSkill(name);
        if (!deleted) {
          json(res, 404, { error: `Skill "${name}" not found.` });
          return;
        }
        json(res, 200, { deleted: true, name });
        return;
      }

      // ─── PATCH /api/skills/:name ───────────────────────────────────────
      const skillPatchMatch = url.match(/^\/api\/skills\/([^/]+)$/);
      if (skillPatchMatch && method === 'PATCH') {
        const name = decodeURIComponent(skillPatchMatch[1]);
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
          json(res, 400, { error: 'Invalid skill name in URL.' });
          return;
        }
        let patch: Record<string, unknown>;
        try { patch = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const loader = new SkillLoader();
        const skillFilePath = join(loader.getSkillsDir(), name, 'SKILL.md');
        if (!existsSync(skillFilePath)) {
          json(res, 404, { error: `Skill "${name}" not found.` });
          return;
        }
        // If a full content body is supplied, replace the file directly.
        if (typeof patch.content === 'string') {
          loader.saveSkill(name, patch.content);
        } else if (typeof patch.description === 'string') {
          // Patch only the description in the YAML frontmatter.
          const raw = readFileSync(skillFilePath, 'utf-8');
          const updated = raw.replace(
            /^(description:\s*).*$/m,
            `$1${(patch.description as string).replace(/[\r\n]+/g, ' ')}`,
          );
          if (updated === raw) {
            json(res, 400, { error: 'No description field found in SKILL.md frontmatter; supply a full content body instead.' });
            return;
          }
          writeFileSync(skillFilePath, updated, 'utf-8');
          loader.discover();
        } else {
          json(res, 400, { error: 'Patch must include "content" (full SKILL.md) or "description".' });
          return;
        }
        json(res, 200, { name, ...patch, persisted: true });
        return;
      }

      // ─── POST /api/skills ──────────────────────────────────────────────
      if (url === '/api/skills' && method === 'POST') {
        let body: Record<string, unknown>;
        try { body = JSON.parse(await readBody(req)); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        const name = (body.name as string) ?? 'unnamed-skill';
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
          json(res, 400, { error: 'Invalid skill name. Use only letters, digits, ".", "_", "-" (no separators or "..").' });
          return;
        }
        const description = (body.description as string) ?? '';
        const loader = new SkillLoader();
        const content = `---\nname: ${name}\ndescription: ${description}\nversion: 0.1.0\nallowed-tools:\n  - read_file\n  - list_dir\n---\n\n# ${name}\n\n${description}\n`;
        loader.saveSkill(name, content);
        json(res, 201, { name, description, enabled: body.enabled !== false });
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error({ err }, 'UI API error');
      json(res, 500, { error: 'Internal server error' });
    }
  }

  private serveStatic(url: string, res: ServerResponse): void {
    // Normalize and sanitise path — decode percent-encoded sequences THEN strip traversal
    let decoded: string;
    try { decoded = decodeURIComponent(url); } catch { decoded = url; }
    const safeUrl = decoded.replace(/\.\./g, '').replace(/\/+/g, '/') || '/';
    let fsPath = join(this.uiDistDir, safeUrl === '/' ? 'index.html' : safeUrl);
    // Ensure resolved path stays under uiDistDir
    if (!resolvePath(fsPath).startsWith(resolvePath(this.uiDistDir))) {
      fsPath = join(this.uiDistDir, 'index.html');
    }

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

  /**
   * H5: Resolve a targetId for send/sendFile/stream. The agent should pass
   * an explicit targetId. Without one, we ONLY fall back when exactly one
   * request is pending; otherwise we drop with a warning to avoid routing
   * a message to the wrong concurrent request.
   */
  private resolveTargetId(targetId?: string): string | null {
    if (targetId) return targetId;
    if (this.pending.size === 1) {
      return this.pending.keys().next().value ?? null;
    }
    if (this.pending.size > 1) {
      logger.warn(
        { pendingCount: this.pending.size },
        'send() called without targetId while multiple requests are pending — message dropped to prevent cross-request mix-up',
      );
    }
    return null;
  }

  async send(content: string, targetId?: string): Promise<void> {
    const id = this.resolveTargetId(targetId);
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
    const id = this.resolveTargetId(targetId);
    if (!id) return;
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
    const id = this.resolveTargetId(targetId);
    const chunks: string[] = [];
    for await (const chunk of content) {
      chunks.push(chunk);
      if (id) this.broadcast({ type: 'chunk', targetId: id, chunk });
    }
    const full = chunks.join('');
    // Resolve pending directly → sends 'done' without an extra 'message' broadcast
    // (the UI already has all the text from the chunk stream)
    if (id) {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.resolve(full);
      }
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
    const id = this.resolveTargetId(targetId);
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
