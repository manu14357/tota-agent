// ─── REST helpers ────────────────────────────────────────────────────────────

const BASE = '';  // same origin in production; proxied in dev

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ─── WebSocket client ─────────────────────────────────────────────────────────

export type WSMessage =
  | { type: 'message'; targetId: string; content: string }
  | { type: 'chunk'; targetId: string; chunk: string }
  | { type: 'step'; targetId: string; content: string }
  | { type: 'status'; status: string; requestId?: string }
  | { type: 'done'; requestId: string; response: string }
  | { type: 'file'; targetId: string; filePath: string; name: string; mimeType: string; isImage: boolean; size: number }
  | { type: 'askPermission'; targetId: string }
  | { type: 'pong' }
  | { type: 'error'; message: string };

type Listener = (msg: WSMessage) => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMessages: string[] = [];

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      // Flush pending
      for (const m of this.pendingMessages) this.ws?.send(m);
      this.pendingMessages = [];
    });

    this.ws.addEventListener('message', (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as WSMessage;
        this.listeners.forEach((l) => l(parsed));
      } catch {
        // ignore malformed frames
      }
    });

    this.ws.addEventListener('close', () => {
      this.ws = null;
      // Auto-reconnect after 3 s
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    });

    this.ws.addEventListener('error', () => {
      this.ws?.close();
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(obj: Record<string, unknown>): void {
    const data = JSON.stringify(obj);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.pendingMessages.push(data);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const socket = new SocketClient();

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface AgentStatus {
  name: string;
  status: 'running' | 'sleeping' | 'error';
  provider: string;
  model: string;
  uptime: number;
  activeChannels: string[];
}

export interface Provider {
  name: string;
  enabled: boolean;
  apiKey: string;
  model: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: number;
  tags?: string[];
}

export interface Schedule {
  id: string;
  description: string;
  cron: string;
  nextRun: number;
  lastRun?: number;
  enabled: boolean;
}

export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
}

export interface LogEntry {
  level: string;
  msg: string;
  time: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  streaming?: boolean;
}
