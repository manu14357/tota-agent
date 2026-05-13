import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { BaseChannel } from './base.js';
import type { ChannelType } from '../types/channel.js';
import { logger } from '../utils/logger.js';

interface PendingRequest {
  resolve: (text: string) => void;
  timer: NodeJS.Timeout;
}

export class APIChannel extends BaseChannel {
  readonly type: ChannelType = 'api';

  private server: ReturnType<typeof createServer> | null = null;
  private pending = new Map<string, PendingRequest>();
  private currentChannelId: string | null = null;

  constructor(
    private readonly port: number,
    private readonly apiKey: string,
  ) {
    super();
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, () => {
        logger.info({ port: this.port }, 'API channel listening');
        this.ready = true;
        resolve();
      });
      this.server!.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    for (const [, pr] of this.pending) {
      clearTimeout(pr.timer);
      pr.resolve('[Server shutting down]');
    }
    this.pending.clear();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
    this.ready = false;
  }

  private unauthorized(res: ServerResponse): void {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  private notFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private methodNotAllowed(res: ServerResponse): void {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  private badRequest(res: ServerResponse, message: string): void {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  private isAuthorized(req: IncomingMessage): boolean {
    if (!this.apiKey) {
      // No key configured — restrict to loopback connections only
      const addr = req.socket.remoteAddress;
      return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    }

    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7) === this.apiKey;
    }
    const xApiKey = req.headers['x-api-key'];
    if (typeof xApiKey === 'string') {
      return xApiKey === this.apiKey;
    }
    return false;
  }

  private async readBody(req: IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy();
          reject(Object.assign(new Error('Request body too large'), { code: 'ETOOLARGE' }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url?.split('?')[0] ?? '/';

    if (!this.isAuthorized(req)) {
      return this.unauthorized(res);
    }

    if (url === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ready: this.ready }));
      return;
    }

    if (url === '/message' && req.method === 'POST') {
      let body: any;
      try {
        const raw = await this.readBody(req);
        body = JSON.parse(raw);
      } catch (err: any) {
        if (err.code === 'ETOOLARGE') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request body too large (max 10MB)' }));
          return;
        }
        return this.badRequest(res, 'Invalid JSON body');
      }

      const { content, timeout = 120 } = body;
      if (!content || typeof content !== 'string') {
        return this.badRequest(res, 'Missing "content" string in body');
      }

      const requestId = randomUUID();
      const timeoutMs = Math.min(Math.max(Number(timeout) || 120, 5), 600) * 1000;

      const responseText = await new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          resolve('[Request timed out]');
        }, timeoutMs);

        this.pending.set(requestId, { resolve, timer });
        this.currentChannelId = requestId;

        this.emit({
          id: requestId,
          content,
          channelType: 'api',
          channelId: requestId,
          timestamp: Date.now(),
          senderId: 'api-user',
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requestId, response: responseText }));
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return this.methodNotAllowed(res);
    }

    return this.notFound(res);
  }

  async send(content: string, targetId?: string): Promise<void> {
    const id = targetId ?? this.currentChannelId;
    if (!id) return;

    const pending = this.pending.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.resolve(content);
    }
  }

  async sendFile(filePath: string, targetId?: string): Promise<void> {
    await this.send(`[File: ${filePath}]`, targetId);
  }

  async stream(content: AsyncIterable<string>, targetId?: string): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of content) {
      chunks.push(chunk);
    }
    const full = chunks.join('');
    await this.send(full, targetId);
    return full;
  }

  async typing(): Promise<void> {
    // No-op for API channel
  }

  async askToContinue(): Promise<boolean> {
    return true; // Auto-approve for API channel
  }
}
