import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync, unlinkSync, cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TotaConfig } from '../utils/config.js';
import { getMemoryDir, getTotaHome } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Minimal async mutex. Each named lock has its own queue so two unrelated
 * locks don't block each other. Used to make memory mutations atomic — a
 * PATCH/DELETE through the REST API must not race with a concurrent add().
 */
export class AsyncMutex {
  private chains = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    this.chains.set(key, previous.then(() => next));
    try {
      await previous;
      return await fn();
    } finally {
      release();
      // Clean up if no further waiters are queued
      if (this.chains.get(key) === next) {
        this.chains.delete(key);
      }
    }
  }
}

export function migrateLegacyMemory(): void {
  const legacyDir = resolve('memory');
  const newDir = getMemoryDir();
  if (!existsSync(legacyDir) || legacyDir === newDir) return;
  if (!existsSync(join(legacyDir, 'short-term')) && !existsSync(join(legacyDir, 'long-term')) && !existsSync(join(legacyDir, 'episodic')) && !existsSync(join(legacyDir, 'second-brain'))) return;
  logger.info({ from: legacyDir, to: newDir }, 'Migrating memory from legacy ./memory to ~/.tota/memory');
  mkdirSync(newDir, { recursive: true });
  for (const sub of ['short-term', 'long-term', 'episodic', 'second-brain']) {
    const src = join(legacyDir, sub);
    const dest = join(newDir, sub);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
    }
  }
  try {
    rmSync(legacyDir, { recursive: true, force: true });
    logger.info('Legacy memory directory removed');
  } catch {
    logger.warn('Could not remove legacy memory directory — please delete ./memory manually');
  }
}

export interface MemoryEntry {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount?: number;
  reasoning?: string;
  metadata?: Record<string, unknown>;
}

export interface LongTermFact {
  id: string;
  timestamp: number;
  topic: string;
  fact: string;
  source: string;
}

export interface EpisodicEvent {
  id: string;
  timestamp: number;
  type: string;
  summary: string;
  channelType: string;
  metadata?: Record<string, unknown>;
}

export class ShortTermMemory {
  private dir: string;
  private maxMessages: number;
  private conversations: Map<string, MemoryEntry[]> = new Map();
  private mutex = new AsyncMutex();

  constructor(config: TotaConfig) {
    this.dir = join(getMemoryDir(), 'short-term');
    this.maxMessages = config.memory.shortTermMaxMessages;
    mkdirSync(this.dir, { recursive: true });
  }

  add(conversationId: string, entry: MemoryEntry): void {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, this.loadFromDisk(conversationId));
    }
    const messages = this.conversations.get(conversationId)!;
    messages.push(entry);
    if (messages.length > this.maxMessages) {
      messages.splice(0, messages.length - this.maxMessages);
    }
    this.saveToDisk(conversationId, messages);
  }

  getRecent(conversationId: string, count: number = this.maxMessages): MemoryEntry[] {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, this.loadFromDisk(conversationId));
    }
    const messages = this.conversations.get(conversationId)!;
    return messages.slice(-count);
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId);
    const filepath = join(this.dir, `${conversationId}.json`);
    if (existsSync(filepath)) unlinkSync(filepath);
  }

  /**
   * M17: Atomically remove a single entry by id. Returns true if the entry
   * existed and was removed. The conversation's in-memory state and the
   * on-disk file are both updated under a mutex so a concurrent add() does
   * not get lost in a clear-and-readd race.
   */
  async deleteById(conversationId: string, id: string): Promise<boolean> {
    return this.mutex.runExclusive(`st:${conversationId}`, () => {
      const messages = this.conversations.get(conversationId) ?? this.loadFromDisk(conversationId);
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) {
        this.conversations.set(conversationId, messages);
        return false;
      }
      messages.splice(idx, 1);
      this.conversations.set(conversationId, messages);
      this.saveToDisk(conversationId, messages);
      return true;
    });
  }

  /**
   * M1: Atomically patch the content of a single entry. Returns the updated
   * entry, or null if not found. Avoids the read-modify-clear-readd pattern
   * that loses concurrent writes.
   */
  async updateById(conversationId: string, id: string, patch: Partial<Pick<MemoryEntry, 'content' | 'role' | 'reasoning' | 'metadata' | 'tokenCount'>>): Promise<MemoryEntry | null> {
    return this.mutex.runExclusive(`st:${conversationId}`, () => {
      const messages = this.conversations.get(conversationId) ?? this.loadFromDisk(conversationId);
      const entry = messages.find((m) => m.id === id);
      if (!entry) {
        this.conversations.set(conversationId, messages);
        return null;
      }
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.role !== undefined) entry.role = patch.role;
      if (patch.reasoning !== undefined) entry.reasoning = patch.reasoning;
      if (patch.metadata !== undefined) entry.metadata = patch.metadata;
      if (patch.tokenCount !== undefined) entry.tokenCount = patch.tokenCount;
      this.conversations.set(conversationId, messages);
      this.saveToDisk(conversationId, messages);
      return entry;
    });
  }

  private loadFromDisk(conversationId: string): MemoryEntry[] {
    const filepath = join(this.dir, `${conversationId}.json`);
    if (!existsSync(filepath)) return [];
    try {
      return JSON.parse(readFileSync(filepath, 'utf-8'));
    } catch {
      return [];
    }
  }

  private saveToDisk(conversationId: string, messages: MemoryEntry[]): void {
    const filepath = join(this.dir, `${conversationId}.json`);
    writeFileSync(filepath, JSON.stringify(messages), { encoding: 'utf-8', mode: 0o600 });
  }
}

export class LongTermMemory {
  private filepath: string;
  private facts: LongTermFact[] = [];
  private mutex = new AsyncMutex();

  constructor(config: TotaConfig) {
    this.filepath = join(getMemoryDir(), 'long-term', 'facts.jsonl');
    mkdirSync(join(getMemoryDir(), 'long-term'), { recursive: true });
    this.load();
  }

  add(fact: Omit<LongTermFact, 'id' | 'timestamp'>): void {
    const entry: LongTermFact = {
      id: generateId(),
      timestamp: Date.now(),
      ...fact,
    };
    this.facts.push(entry);
    appendFileSync(this.filepath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  search(query: string, limit: number = 5): LongTermFact[] {
    const lowerQuery = query.toLowerCase();
    const terms = lowerQuery.split(/\s+/);
    return this.facts
      .filter(f => {
        const text = `${f.topic} ${f.fact}`.toLowerCase();
        return terms.some(t => text.includes(t));
      })
      .slice(-limit);
  }

  getAll(): LongTermFact[] {
    return [...this.facts];
  }

  /**
   * M17: Atomically remove a single fact by id. Returns true if found.
   * Uses an atomic temp-file rename to avoid corrupting the JSONL on crash.
   */
  async deleteById(id: string): Promise<boolean> {
    return this.mutex.runExclusive('lt:delete', () => {
      const idx = this.facts.findIndex((f) => f.id === id);
      if (idx === -1) return false;
      this.facts.splice(idx, 1);
      this.persistAll();
      return true;
    });
  }

  /**
   * M1: Atomically update a single fact by id.
   */
  async updateById(id: string, patch: Partial<Pick<LongTermFact, 'topic' | 'fact' | 'source'>>): Promise<LongTermFact | null> {
    return this.mutex.runExclusive('lt:update', () => {
      const fact = this.facts.find((f) => f.id === id);
      if (!fact) return null;
      if (patch.topic !== undefined) fact.topic = patch.topic;
      if (patch.fact !== undefined) fact.fact = patch.fact;
      if (patch.source !== undefined) fact.source = patch.source;
      this.persistAll();
      return fact;
    });
  }

  /** Rewrite the entire JSONL file. Called only under the mutex. */
  private persistAll(): void {
    writeFileSync(this.filepath, this.facts.map((f) => JSON.stringify(f)).join('\n') + (this.facts.length ? '\n' : ''), 'utf-8');
  }

  private load(): void {
    if (!existsSync(this.filepath)) return;
    const lines = readFileSync(this.filepath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean);
    this.facts = lines
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter((f): f is LongTermFact => f !== null);
  }
}

export class EpisodicMemory {
  private filepath: string;
  private events: EpisodicEvent[] = [];

  constructor(config: TotaConfig) {
    this.filepath = join(getMemoryDir(), 'episodic', 'events.jsonl');
    mkdirSync(join(getMemoryDir(), 'episodic'), { recursive: true });
    this.load();
  }

  record(event: Omit<EpisodicEvent, 'id' | 'timestamp'>): void {
    const entry: EpisodicEvent = {
      id: generateId(),
      timestamp: Date.now(),
      ...event,
    };
    this.events.push(entry);
    appendFileSync(this.filepath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  getRecent(count: number = 20): EpisodicEvent[] {
    return this.events.slice(-count);
  }

  prune(olderThanDays: number = 7): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const before = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= cutoff || e.metadata?.important);
    const removed = before - this.events.length;
    if (removed > 0) {
      writeFileSync(this.filepath, this.events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
    }
    return removed;
  }

  private load(): void {
    if (!existsSync(this.filepath)) return;
    const lines = readFileSync(this.filepath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean);
    this.events = lines
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter((e): e is EpisodicEvent => e !== null);
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}