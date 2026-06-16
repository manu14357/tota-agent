import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillLoader } from './skills/loader.js';
import { Scheduler, saveSchedules, loadSchedules } from './core/scheduler.js';
import { ShortTermMemory, LongTermMemory } from './memory/store.js';
import { AsyncMutex } from './memory/store.js';
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

describe('Phase 2: persistence round-trips', () => {
  let workDir: string;
  let totaHome: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tota-p2-test-'));
    totaHome = mkdtempSync(join(tmpdir(), 'tota-p2-home-'));
    process.env.TOTA_HOME = totaHome;
  });

  afterEach(() => {
    delete process.env.TOTA_HOME;
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    if (existsSync(totaHome)) rmSync(totaHome, { recursive: true, force: true });
  });

  describe('H2: SkillLoader.deleteSkill', () => {
    it('removes the skill directory and refreshes the discovery cache', () => {
      const loader = new SkillLoader(join(totaHome, 'skills'));
      loader.saveSkill('foo', '---\nname: foo\ndescription: d\n---\nbody');
      loader.saveSkill('bar', '---\nname: bar\ndescription: d\n---\nbody');
      expect(loader.discover().map(s => s.name).sort()).toEqual(['bar', 'foo']);

      const removed = loader.deleteSkill('foo');
      expect(removed).toBe(true);
      expect(loader.discover().map(s => s.name)).toEqual(['bar']);
    });

    it('returns false for non-existent skill', () => {
      const loader = new SkillLoader(join(totaHome, 'skills'));
      expect(loader.deleteSkill('ghost')).toBe(false);
    });

    it('rejects traversal in deleteSkill', () => {
      const loader = new SkillLoader(join(totaHome, 'skills'));
      expect(() => loader.deleteSkill('../escape')).toThrow(/Invalid skill name/);
    });
  });

  describe('H3: SkillLoader.saveSkill round-trip', () => {
    it('writes the content and the file is readable from disk', () => {
      const loader = new SkillLoader(join(totaHome, 'skills'));
      const content = '---\nname: rtf\ndescription: round-trip\n---\n# RTF\nbody';
      loader.saveSkill('rtf', content);
      const onDisk = readFileSync(join(totaHome, 'skills', 'rtf', 'SKILL.md'), 'utf-8');
      expect(onDisk).toBe(content);
    });

    it('PATCH with new content replaces the file end-to-end', () => {
      const loader = new SkillLoader(join(totaHome, 'skills'));
      loader.saveSkill('rtf', '---\nname: rtf\ndescription: original\n---\nold body');
      // Simulate a PATCH by writing new content via saveSkill
      const newContent = '---\nname: rtf\ndescription: updated\n---\nnew body';
      loader.saveSkill('rtf', newContent);
      const onDisk = readFileSync(join(totaHome, 'skills', 'rtf', 'SKILL.md'), 'utf-8');
      expect(onDisk).toBe(newContent);
      expect(onDisk).toContain('updated');
      expect(onDisk).not.toContain('original');
    });
  });

  describe('H4: Scheduler activation', () => {
    it('addPersistedTask registers the task with node-cron', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      const manifest = {
        id: 'test-1',
        cron: '0 9 * * *',
        description: 'morning reminder',
        prompt: 'say hi',
        createdAt: new Date().toISOString(),
      };
      scheduler.addPersistedTask(manifest);
      expect(scheduler.getManifests().find(m => m.id === 'test-1')).toBeDefined();
      // Manifest is persisted too via the in-memory map
      scheduler.persistSchedules();
      const reloaded = loadSchedules();
      expect(reloaded.find(t => t.id === 'test-1')).toBeDefined();
      scheduler.stopAll();
    });

    it('updatePersistedTask re-registers with the new cron', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      const manifest = {
        id: 'test-2',
        cron: '0 9 * * *',
        description: 'old',
        prompt: 'p',
        createdAt: new Date().toISOString(),
      };
      scheduler.addPersistedTask(manifest);
      const ok = scheduler.updatePersistedTask('test-2', { cron: '0 18 * * *', description: 'new' });
      expect(ok).toBe(true);
      const updated = scheduler.getManifests().find(m => m.id === 'test-2');
      expect(updated?.cron).toBe('0 18 * * *');
      expect(updated?.description).toBe('new');
      scheduler.stopAll();
    });

    it('updatePersistedTask rejects invalid cron expressions', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      scheduler.addPersistedTask({
        id: 'test-3',
        cron: '0 9 * * *',
        description: 'd',
        prompt: 'p',
        createdAt: new Date().toISOString(),
      });
      expect(() => scheduler.updatePersistedTask('test-3', { cron: 'not a cron' })).toThrow(/Invalid cron/);
      scheduler.stopAll();
    });

    it('updatePersistedTask returns false for unknown id', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      expect(scheduler.updatePersistedTask('does-not-exist', { description: 'x' })).toBe(false);
      scheduler.stopAll();
    });

    it('removeTask stops the cron and removes the manifest', () => {
      const config = makeConfig(totaHome);
      const scheduler = new Scheduler(config);
      scheduler.addPersistedTask({
        id: 'test-4',
        cron: '0 9 * * *',
        description: 'd',
        prompt: 'p',
        createdAt: new Date().toISOString(),
      });
      scheduler.removeTask('test-4');
      expect(scheduler.getManifests().find(m => m.id === 'test-4')).toBeUndefined();
      scheduler.stopAll();
    });
  });

  describe('M17: ShortTermMemory atomic delete', () => {
    it('deletes a single entry by id and persists', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      mem.add('default', { id: 'a', timestamp: 1, role: 'user', content: 'first' });
      mem.add('default', { id: 'b', timestamp: 2, role: 'assistant', content: 'reply' });
      mem.add('default', { id: 'c', timestamp: 3, role: 'user', content: 'third' });
      const ok = await mem.deleteById('default', 'b');
      expect(ok).toBe(true);
      const remaining = mem.getRecent('default', 10).map(m => m.id);
      expect(remaining).toEqual(['a', 'c']);
      // Reload from disk to confirm persistence
      const fresh = new ShortTermMemory(config);
      const reloaded = fresh.getRecent('default', 10).map(m => m.id);
      expect(reloaded).toEqual(['a', 'c']);
    });

    it('returns false when id not found', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      mem.add('default', { id: 'a', timestamp: 1, role: 'user', content: 'x' });
      expect(await mem.deleteById('default', 'nope')).toBe(false);
    });

    it('survives concurrent add() and deleteById() without losing entries', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      // Seed
      for (let i = 0; i < 10; i++) {
        mem.add('default', { id: `seed-${i}`, timestamp: i, role: 'user', content: `s${i}` });
      }
      // Concurrent: deleteById + 20 adds
      const deletions = Array.from({ length: 5 }, (_, i) => mem.deleteById('default', `seed-${i}`));
      const additions = Array.from({ length: 20 }, (_, i) => mem.add('default', {
        id: `new-${i}`,
        timestamp: 100 + i,
        role: 'user',
        content: `n${i}`,
      }));
      await Promise.all([...deletions, ...additions]);
      // After concurrent ops: 5 seed entries remain (seed-5..seed-9) + 20 new
      const ids = mem.getRecent('default', 100).map(m => m.id);
      expect(ids).toContain('seed-5');
      expect(ids).not.toContain('seed-0');
      expect(ids.filter(i => i.startsWith('new-')).length).toBe(20);
    });
  });

  describe('M1: ShortTermMemory atomic update', () => {
    it('updates content of a single entry and persists', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      mem.add('default', { id: 'a', timestamp: 1, role: 'user', content: 'original' });
      const updated = await mem.updateById('default', 'a', { content: 'updated' });
      expect(updated?.content).toBe('updated');
      const fresh = new ShortTermMemory(config);
      const reloaded = fresh.getRecent('default', 10);
      expect(reloaded.find(e => e.id === 'a')?.content).toBe('updated');
    });

    it('returns null when id not found', async () => {
      const config = makeConfig(totaHome);
      const mem = new ShortTermMemory(config);
      const result = await mem.updateById('default', 'ghost', { content: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('M17: LongTermMemory atomic delete', () => {
    it('deletes a fact by id and persists', async () => {
      const config = makeConfig(totaHome);
      const mem = new LongTermMemory(config);
      mem.add({ topic: 'a', fact: 'fact 1', source: 'test' });
      mem.add({ topic: 'b', fact: 'fact 2', source: 'test' });
      const all = mem.getAll();
      const target = all[0];
      const ok = await mem.deleteById(target.id);
      expect(ok).toBe(true);
      const fresh = new LongTermMemory(config);
      expect(fresh.getAll().length).toBe(1);
    });
  });

  describe('M1: LongTermMemory atomic update', () => {
    it('updates a fact by id and persists', async () => {
      const config = makeConfig(totaHome);
      const mem = new LongTermMemory(config);
      mem.add({ topic: 'a', fact: 'original', source: 'test' });
      const id = mem.getAll()[0].id;
      const updated = await mem.updateById(id, { topic: 'b', fact: 'updated' });
      expect(updated?.topic).toBe('b');
      expect(updated?.fact).toBe('updated');
      const fresh = new LongTermMemory(config);
      const reloaded = fresh.getAll().find(f => f.id === id);
      expect(reloaded?.topic).toBe('b');
    });
  });

  describe('AsyncMutex', () => {
    it('serializes operations on the same key', async () => {
      const mutex = new AsyncMutex();
      let counter = 0;
      const increment = () => mutex.runExclusive('k', async () => {
        const current = counter;
        await new Promise(r => setTimeout(r, 5));
        counter = current + 1;
      });
      await Promise.all([increment(), increment(), increment(), increment(), increment()]);
      expect(counter).toBe(5);
    });

    it('does not serialize operations on different keys', async () => {
      const mutex = new AsyncMutex();
      const order: string[] = [];
      const op = (key: string) => mutex.runExclusive(key, async () => {
        order.push(`start:${key}`);
        await new Promise(r => setTimeout(r, 10));
        order.push(`end:${key}`);
      });
      await Promise.all([op('a'), op('b')]);
      // Both started before either ended → concurrency
      expect(order[0]).toMatch(/^start:/);
      expect(order[1]).toMatch(/^start:/);
    });
  });
});
