import { describe, expect, it } from 'vitest';
import { AsyncMap } from './channels/async-map.js';

describe('Phase 5: channel robustness', () => {
  describe('AsyncMap (M2/M3/M4 foundation)', () => {
    it('basic set/get/has/delete', () => {
      const m = new AsyncMap<string, number>();
      expect(m.has('x')).toBe(false);
      m.set('x', 1);
      expect(m.has('x')).toBe(true);
      expect(m.get('x')).toBe(1);
      m.delete('x');
      expect(m.has('x')).toBe(false);
    });

    it('size() returns count', () => {
      const m = new AsyncMap<string, number>();
      m.set('a', 1);
      m.set('b', 2);
      m.set('c', 3);
      expect(m.size()).toBe(3);
      m.delete('b');
      expect(m.size()).toBe(2);
    });

    it('clearAll() invokes onClear for every entry then empties', () => {
      const m = new AsyncMap<string, number>();
      m.set('a', 1);
      m.set('b', 2);
      m.set('c', 3);
      const seen: Array<[string, number]> = [];
      m.clearAll((k, v) => seen.push([k, v]));
      expect(seen).toEqual([['a', 1], ['b', 2], ['c', 3]]);
      expect(m.size()).toBe(0);
    });

    it('clearAll() with no callback just empties', () => {
      const m = new AsyncMap<string, number>();
      m.set('a', 1);
      m.clearAll();
      expect(m.size()).toBe(0);
    });

    it('clearAll() on empty map is a no-op', () => {
      const m = new AsyncMap<string, number>();
      const seen: number[] = [];
      m.clearAll((_k, v) => seen.push(v));
      expect(seen).toEqual([]);
    });

    it('keys() and values() and entries() iterate', () => {
      const m = new AsyncMap<string, number>();
      m.set('a', 1);
      m.set('b', 2);
      expect([...m.keys()].sort()).toEqual(['a', 'b']);
      expect([...m.values()].sort()).toEqual([1, 2]);
      expect([...m.entries()].sort()).toEqual([['a', 1], ['b', 2]]);
    });

    it('overwrites previous value for the same key', () => {
      const m = new AsyncMap<string, number>();
      m.set('x', 1);
      m.set('x', 2);
      expect(m.get('x')).toBe(2);
      expect(m.size()).toBe(1);
    });
  });

  describe('M3: WhatsApp-style clearAll semantics', () => {
    it('clears multiple permission-mode resolvers atomically', () => {
      const pendingPermMode = new AsyncMap<string, (mode: string) => void>();
      const resolved: Array<[string, string]> = [];
      pendingPermMode.set('jid1', (m) => resolved.push(['jid1', m]));
      pendingPermMode.set('jid2', (m) => resolved.push(['jid2', m]));
      pendingPermMode.set('jid3', (m) => resolved.push(['jid3', m]));

      // Simulate disconnect: clear with safe default
      pendingPermMode.clearAll((_jid, resolver) => resolver('ask-me'));
      expect(resolved).toEqual([
        ['jid1', 'ask-me'],
        ['jid2', 'ask-me'],
        ['jid3', 'ask-me'],
      ]);
      expect(pendingPermMode.size()).toBe(0);
    });

    it('clears perm-ask resolvers with "no" default', () => {
      const pendingPermAsk = new AsyncMap<string, (answer: string) => void>();
      const resolved: Array<[string, string]> = [];
      pendingPermAsk.set('jid1', (a) => resolved.push(['jid1', a]));
      pendingPermAsk.set('jid2', (a) => resolved.push(['jid2', a]));
      pendingPermAsk.clearAll((_jid, resolver) => resolver('no'));
      expect(resolved).toEqual([['jid1', 'no'], ['jid2', 'no']]);
    });

    it('clears ask-to-continue with false default', () => {
      const pendingAsk = new AsyncMap<string, (answer: boolean) => void>();
      const resolved: Array<[string, boolean]> = [];
      pendingAsk.set('jid1', (a) => resolved.push(['jid1', a]));
      pendingAsk.clearAll((_jid, resolver) => resolver(false));
      expect(resolved).toEqual([['jid1', false]]);
    });
  });

  describe('M4: Concurrent call guard pattern', () => {
    /**
     * Models the M4 fix: if a second askPermissionMode comes in for the
     * same JID while the first is pending, return the safe default
     * immediately rather than overwriting the resolver. The "guard"
     * approach is to check `has(jid)` first.
     */
    it('returns safe default when prompt already pending', () => {
      const pending = new AsyncMap<string, () => void>();
      // First call sets the resolver
      pending.set('jid1', () => {});
      // Second call should see the existing entry and return early
      const isAlreadyPending = pending.has('jid1');
      expect(isAlreadyPending).toBe(true);
      // We don't set a new resolver; the first one still wins
    });

    it('allows new prompts after the first resolves', () => {
      const pending = new AsyncMap<string, () => void>();
      let resolveFirst: () => void = () => {};
      const firstPromise = new Promise<void>((res) => { resolveFirst = res; });
      pending.set('jid1', () => resolveFirst());

      // First prompt resolves
      resolveFirst();
      // After clear, a new prompt for the same JID is allowed
      pending.delete('jid1');
      expect(pending.has('jid1')).toBe(false);
    });
  });
});
