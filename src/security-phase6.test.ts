import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scheduler, saveSchedules, loadSchedules } from './core/scheduler.js';
import { ShortTermMemory, LongTermMemory, EpisodicMemory } from './memory/store.js';
import type { TotaConfig } from './utils/config.js';

function makeConfig(totaHome: string): TotaConfig {
  return {
    identity: { name: 'tota-test', owner: 'tester' },
    providers: {} as any,
    channels: {} as any,
    loopGuard: {
      maxSteps: 50, absoluteMax: 100, failedAbsoluteMax: 25,
      identicalThreshold: 5, similarThreshold: 8, sameToolThreshold: 10,
      noActionMax: 10, textRepeatThreshold: 3,
    },
    webSearch: { enabled: false, provider: 'auto', apiKey: '', maxResults: 5 },
    mcp: { servers: [] },
    github: { username: '', email: '', defaultOwner: '', defaultRepo: '' },
    memory: { shortTermMaxMessages: 100, secondBrain: { enabled: false, maxRecords: 50 } },
    heartbeat: { intervalMinutes: 60 },
    tokens: { dailyBudget: 1_000_000 },
    capabilities: { computer: { enabled: false } },
  } as unknown as TotaConfig;
}

describe('Phase 6: persistence, scheduling, browser, MCP', () => {
  let workDir: string;
  let totaHome: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tota-p6-test-'));
    totaHome = mkdtempSync(join(tmpdir(), 'tota-p6-home-'));
    process.env.TOTA_HOME = totaHome;
  });

  afterEach(() => {
    delete process.env.TOTA_HOME;
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    if (existsSync(totaHome)) rmSync(totaHome, { recursive: true, force: true });
  });

  describe('H6: scheduler timezone support', () => {
    it('addTask accepts a timezone', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      // We just verify the call doesn't throw and the task is registered.
      // The actual scheduling test would need to wait for a cron tick.
      scheduler.addTask({
        id: 'tz-test',
        cron: '0 9 * * *',
        timezone: 'America/Los_Angeles',
        description: 'morning reminder',
        handler: async () => {},
      });
      // Manifest is tracked but addTask (not addPersistedTask) doesn't add to manifests
      scheduler.stopAll();
    });

    it('addPersistedTask persists the timezone', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      scheduler.addPersistedTask({
        id: 'tz-persist',
        cron: '0 9 * * *',
        timezone: 'Europe/London',
        description: 'London morning',
        prompt: 'hi',
        createdAt: new Date().toISOString(),
      });
      const manifest = scheduler.getManifests().find((m) => m.id === 'tz-persist');
      expect(manifest?.timezone).toBe('Europe/London');
      scheduler.stopAll();
    });

    it('updatePersistedTask preserves the timezone', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      scheduler.addPersistedTask({
        id: 'tz-update',
        cron: '0 9 * * *',
        timezone: 'Asia/Tokyo',
        description: 'Tokyo morning',
        prompt: 'ohayo',
        createdAt: new Date().toISOString(),
      });
      scheduler.updatePersistedTask('tz-update', { description: 'updated' });
      const manifest = scheduler.getManifests().find((m) => m.id === 'tz-update');
      expect(manifest?.timezone).toBe('Asia/Tokyo');
      scheduler.stopAll();
    });
  });

  describe('M7: recently-expired delayed tasks fire on startup', () => {
    it('fires tasks that expired within the grace period', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      let fired = false;
      scheduler.setOnScheduledTask(async () => { fired = true; });

      // Persist a task that "expired" 30 seconds ago (well within 5-min grace)
      const manifest = {
        id: 'just-expired',
        cron: undefined,
        delaySeconds: 0,
        executeAt: new Date(Date.now() - 30_000).toISOString(),
        description: 'reminder',
        prompt: 'wake up',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      };
      saveSchedules([manifest]);
      // restorePersistedTasks is async (fire-and-forget for the onScheduledTask)
      scheduler.restorePersistedTasks();
      // Wait one microtask
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fired).toBe(true);
          scheduler.stopAll();
          resolve();
        }, 50);
      });
    });

    it('does NOT fire tasks that expired too long ago', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      let fired = false;
      scheduler.setOnScheduledTask(async () => { fired = true; });

      // Task that "expired" 1 hour ago — beyond the 5-minute grace
      const manifest = {
        id: 'long-expired',
        cron: undefined,
        delaySeconds: 0,
        executeAt: new Date(Date.now() - 3600_000).toISOString(),
        description: 'reminder',
        prompt: 'wake up',
        createdAt: new Date(Date.now() - 7200_000).toISOString(),
      };
      saveSchedules([manifest]);
      scheduler.restorePersistedTasks();
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fired).toBe(false);
          scheduler.stopAll();
          resolve();
        }, 50);
      });
    });
  });

  describe('M5: EpisodicMemory preserves important events', () => {
    it('prune() keeps events with metadata.important=true', () => {
      const config = makeConfig(totaHome);
      const mem = new EpisodicMemory(config);
      // Insert old + new + important
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const newDate = new Date();
      // We need to write directly to the JSONL since the API generates
      // ids/timestamps internally. Build the file manually.
      const dir = join(totaHome, 'memory', 'episodic');
      // Constructor already created the dir; just write the file
      const events = [
        { id: 'old', timestamp: oldDate.getTime(), type: 'note', summary: 'old unimport', channelType: 'cli' },
        { id: 'new', timestamp: newDate.getTime(), type: 'note', summary: 'new', channelType: 'cli' },
        { id: 'imp', timestamp: oldDate.getTime(), type: 'note', summary: 'old important', channelType: 'cli', metadata: { important: true } },
      ];
      // Re-create the memory by writing the file then loading
      const filepath = join(dir, 'events.jsonl');
      writeFileSync(filepath, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
      // Re-instantiate to read from disk
      const mem2 = new EpisodicMemory(config);
      const removed = mem2.prune(7);
      expect(removed).toBe(1); // only the old un-important event
      const remaining = mem2.getRecent(100);
      expect(remaining.find((e) => e.id === 'imp')).toBeDefined();
      expect(remaining.find((e) => e.id === 'old')).toBeUndefined();
      expect(remaining.find((e) => e.id === 'new')).toBeDefined();
    });

    it('record() with metadata persists it', () => {
      const config = makeConfig(totaHome);
      const mem = new EpisodicMemory(config);
      mem.record({ type: 'note', summary: 'important event', channelType: 'cli', metadata: { important: true } });
      const fresh = new EpisodicMemory(config);
      const all = fresh.getRecent(10);
      expect(all[0].metadata?.important).toBe(true);
    });
  });

  describe('L7: ShortTermMemory async getRecent', () => {
    it('getRecentAsync loads from disk without throwing on empty file', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      const result = await mem.getRecentAsync('default', 10);
      expect(result).toEqual([]);
    });

    it('getRecentAsync returns the messages that add() persists', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      mem.add('default', { id: 'a', timestamp: 1, role: 'user', content: 'hi' });
      mem.add('default', { id: 'b', timestamp: 2, role: 'assistant', content: 'hello' });
      const result = await mem.getRecentAsync('default', 10);
      expect(result.map((m) => m.id)).toEqual(['a', 'b']);
    });
  });
});
