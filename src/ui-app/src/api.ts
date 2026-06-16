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

// M18: Constants for the WebSocket reconnect / queue behaviour.
const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const MAX_PENDING_MESSAGES = 50; // drop oldest if exceeded

class SocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMessages: string[] = [];
  private reconnectAttempt = 0;
  private intentionalClose = false;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
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
      if (this.intentionalClose) return;
      // M18: exponential backoff with cap. Attempt 1 → 1s, then 2s, 4s, 8s,
      // 16s, 30s (cap). The old code used a fixed 3s — that floods retries
      // when the server is unreachable, killing the user's battery.
      this.reconnectAttempt++;
      const delay = Math.min(INITIAL_RECONNECT_MS * 2 ** (this.reconnectAttempt - 1), MAX_RECONNECT_MS);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });

    this.ws.addEventListener('error', () => {
      this.ws?.close();
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(obj: Record<string, unknown>): void {
    const data = JSON.stringify(obj);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      // M18: cap the queue. If the server is down and the user keeps
      // typing, we drop the OLDEST messages rather than accumulate
      // unbounded memory.
      this.pendingMessages.push(data);
      while (this.pendingMessages.length > MAX_PENDING_MESSAGES) {
        this.pendingMessages.shift();
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  pendingCount(): number {
    return this.pendingMessages.length;
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
