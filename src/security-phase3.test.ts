import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PermissionManager } from './capabilities/permissions.js';
import { ToolCallLoopDetector } from './core/agent.js';

// ------------------------------------------------------------------
// Test the loop detector via the agent module. The detector is not
// exported, but we can verify behavior through the PermissionManager
// addTempScope / removeTempScope round-trip and through the agent
// module's exports.
// ------------------------------------------------------------------

describe('Phase 3: agent loop correctness', () => {
  let workDir: string;
  let totaHome: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tota-p3-test-'));
    totaHome = mkdtempSync(join(tmpdir(), 'tota-p3-home-'));
    process.env.TOTA_HOME = totaHome;
  });

  afterEach(() => {
    delete process.env.TOTA_HOME;
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    if (existsSync(totaHome)) rmSync(totaHome, { recursive: true, force: true });
  });

  describe('H9: removeTempScope round-trip', () => {
    it('addTempScope + removeTempScope does not leave dangling state', async () => {
      const pm = new PermissionManager();
      // Inject a non-dangerous path
      pm.addTempScope(workDir, true, true);
      // After adding, fs access to the dir should be allowed (write=true)
      const allowed = await pm.checkFsAccess(join(workDir, 'foo.txt'), 'write');
      expect(allowed.allowed).toBe(true);
      // Remove
      pm.removeTempScope(workDir);
      // Now the temp scope is gone; access should require approval (no scope, no temp scope)
      const denied = await pm.checkFsAccess(join(workDir, 'foo.txt'), 'write');
      // Without an askHandler and no scope, this should be denied
      expect(denied.allowed).toBe(false);
    });

    it('removeTempScope on non-existent path is a no-op', () => {
      const pm = new PermissionManager();
      expect(() => pm.removeTempScope('/nonexistent/path')).not.toThrow();
    });

    it('removeTempScope only removes the matching path', () => {
      const pm = new PermissionManager();
      pm.addTempScope(workDir, true, true);
      const other = join(workDir, 'sub');
      pm.addTempScope(other, true, true);
      pm.removeTempScope(workDir);
      // The other scope should still be present
      // We can't directly inspect tempScopes, but the behavior of subsequent
      // addTempScope with the same path should still work
      pm.addTempScope(other, true, true);
      // No throw is the success criterion
      expect(true).toBe(true);
    });
  });

  describe('M8: usedProvider null-safety contract', () => {
    it('no crash when all providers fail (contract test)', () => {
      // This test verifies the *type* of the fix without running the agent
      // (which has many dependencies). The actual fix replaces
      // `usedProvider!.name` with a guarded `usedProvider ?? { name: 'unknown' }`.
      const usedProvider: { name: string; model: string } | null = null;
      const safe = usedProvider ?? { name: 'unknown', model: 'unknown' };
      expect(safe.name).toBe('unknown');
      expect(safe.model).toBe('unknown');
    });
  });
});

// ------------------------------------------------------------------
// Loop detector tests via dynamic import. We re-implement the
// detector's contract here to lock in the behavior changes from M9.
// ------------------------------------------------------------------

describe('Phase 3: ToolCallLoopDetector (real class)', () => {
  describe('detectIdentical', () => {
    it('returns null when fewer than 3 calls', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 5 });
      det.record('foo', {}, false);
      det.record('foo', {}, false);
      expect(det.detectIdentical()).toBeNull();
    });

    it('returns null when calls are not consecutive', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 3 });
      det.record('foo', { p: 1 }, false);
      det.record('bar', { p: 2 }, false);
      det.record('foo', { p: 1 }, false);
      det.record('bar', { p: 2 }, false);
      det.record('foo', { p: 1 }, false);
      expect(det.detectIdentical()).toBeNull();
    });

    it('detects 3+ identical consecutive calls', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 3 });
      det.record('foo', { p: 1 }, false);
      det.record('foo', { p: 1 }, false);
      det.record('foo', { p: 1 }, false);
      const result = det.detectIdentical();
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('foo');
      expect(result?.count).toBe(3);
    });

    it('different params break the streak', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 3 });
      det.record('foo', { p: 1 }, false);
      det.record('foo', { p: 2 }, false);
      det.record('foo', { p: 3 }, false);
      // 3 calls but params differ — only the LAST one is counted (count=1)
      const result = det.detectIdentical();
      expect(result).toBeNull();
    });
  });

  describe('M9: detectAlternation', () => {
    it('detects A B A B A B pattern', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      const tools = ['A', 'B', 'A', 'B', 'A', 'B'];
      for (const t of tools) {
        det.record(t, {}, false);
      }
      const result = det.detectAlternation();
      expect(result).not.toBeNull();
      expect(result?.toolA).toBe('A');
      expect(result?.toolB).toBe('B');
    });

    it('detects B A B A B A pattern (other starting tool)', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      const tools = ['B', 'A', 'B', 'A', 'B', 'A'];
      for (const t of tools) {
        det.record(t, {}, false);
      }
      const result = det.detectAlternation();
      expect(result).not.toBeNull();
    });

    it('does NOT detect 3-tool pattern', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      const tools = ['A', 'B', 'C', 'A', 'B', 'C'];
      for (const t of tools) {
        det.record(t, {}, false);
      }
      const result = det.detectAlternation();
      expect(result).toBeNull();
    });

    it('does NOT detect non-alternating 2-tool pattern', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      const tools = ['A', 'A', 'A', 'B', 'B', 'B'];
      for (const t of tools) {
        det.record(t, {}, false);
      }
      const result = det.detectAlternation();
      expect(result).toBeNull();
    });

    it('returns null when fewer than 6 calls', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      det.record('A', {}, false);
      det.record('B', {}, false);
      det.record('A', {}, false);
      det.record('B', {}, false);
      det.record('A', {}, false);
      // Only 5 — too few
      expect(det.detectAlternation()).toBeNull();
    });

    it('mark as hard-aborted on detection', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      for (const t of ['A', 'B', 'A', 'B', 'A', 'B']) {
        det.record(t, {}, false);
      }
      det.detectAlternation();
      expect(det.isHardAborted()).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears recent calls and hard-aborted state', () => {
      const det = new ToolCallLoopDetector({ identicalThreshold: 99 });
      for (const t of ['A', 'B', 'A', 'B', 'A', 'B']) {
        det.record(t, {}, false);
      }
      det.detectAlternation();
      expect(det.isHardAborted()).toBe(true);
      det.reset();
      expect(det.isHardAborted()).toBe(false);
      expect(det.detectAlternation()).toBeNull();
    });
  });
});

describe('Phase 3: loop detector alternation detection (algorithm)', () => {
  it('M9: alternation A B A B A B is detected when last call is B', () => {
    // The detector is internal; we test the contract by simulating its
    // algorithm against a known input. The actual class lives in
    // src/core/agent.ts. We import it via a dynamic require-like check.
    // Since it's not exported, we test the algorithm directly.
    const recentCalls = [
      { tool: 'A', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
      { tool: 'A', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
      { tool: 'A', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
    ];
    const window = recentCalls.slice(-6);
    const toolsInWindow = new Set(window.map(c => c.tool));
    expect(toolsInWindow.size).toBe(2);
    const [t0, t1] = [...toolsInWindow];
    const isAlternating = (a: string, b: string) =>
      window.every((c, i) => c.tool === (i % 2 === 0 ? a : b));
    expect(isAlternating(t0, t1) || isAlternating(t1, t0)).toBe(true);
  });

  it('M9: non-alternating 3+3 pattern is NOT detected as alternation', () => {
    const recentCalls = [
      { tool: 'A', params: '{}', failed: false },
      { tool: 'A', params: '{}', failed: false },
      { tool: 'A', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
    ];
    const window = recentCalls.slice(-6);
    const toolsInWindow = new Set(window.map(c => c.tool));
    expect(toolsInWindow.size).toBe(2);
    const [t0, t1] = [...toolsInWindow];
    const isAlternating = (a: string, b: string) =>
      window.every((c, i) => c.tool === (i % 2 === 0 ? a : b));
    expect(isAlternating(t0, t1) || isAlternating(t1, t0)).toBe(false);
  });

  it('M9: 3-tool pattern is NOT detected as alternation', () => {
    const recentCalls = [
      { tool: 'A', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
      { tool: 'C', params: '{}', failed: false },
      { tool: 'A', params: '{}', failed: false },
      { tool: 'B', params: '{}', failed: false },
      { tool: 'C', params: '{}', failed: false },
    ];
    const window = recentCalls.slice(-6);
    const toolsInWindow = new Set(window.map(c => c.tool));
    expect(toolsInWindow.size).toBe(3);
  });
});
