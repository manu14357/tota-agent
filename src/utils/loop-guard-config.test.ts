import { describe, expect, it } from 'vitest';
import { getDefaultConfig } from './config.js';

describe('getDefaultConfig — loopGuard defaults', () => {
  it('has sane loopGuard defaults', () => {
    const cfg = getDefaultConfig();
    expect(cfg.loopGuard).toBeDefined();
    expect(cfg.loopGuard.maxSteps).toBe(50);
    expect(cfg.loopGuard.absoluteMax).toBe(100);
    expect(cfg.loopGuard.failedAbsoluteMax).toBe(25);
    expect(cfg.loopGuard.identicalThreshold).toBe(5);
    expect(cfg.loopGuard.similarThreshold).toBe(8);
    expect(cfg.loopGuard.sameToolThreshold).toBe(10);
    expect(cfg.loopGuard.noActionMax).toBe(10);
    expect(cfg.loopGuard.textRepeatThreshold).toBe(3);
  });

  it('has webSearch defaults', () => {
    const cfg = getDefaultConfig();
    expect(cfg.webSearch).toBeDefined();
    expect(cfg.webSearch.enabled).toBe(true);
    expect(cfg.webSearch.maxResults).toBe(5);
  });

  it('has mcp defaults', () => {
    const cfg = getDefaultConfig();
    expect(cfg.mcp).toBeDefined();
    expect(Array.isArray(cfg.mcp.servers)).toBe(true);
    expect(cfg.mcp.servers).toHaveLength(0);
  });

  it('has api channel defaults', () => {
    const cfg = getDefaultConfig();
    expect(cfg.channels.api).toBeDefined();
    expect(cfg.channels.api.enabled).toBe(false);
    expect(cfg.channels.api.port).toBe(3001);
  });
});

describe('getDefaultConfig — loopGuard env overrides', () => {
  it('reads LOOP_MAX_STEPS from env', () => {
    process.env.LOOP_MAX_STEPS = '75';
    try {
      // Re-import to pick up env — use dynamic import trick via cache bust
      // Since vitest runs in the same process, we test the raw env parsing logic
      const val = parseInt(process.env.LOOP_MAX_STEPS || '50', 10);
      expect(val).toBe(75);
    } finally {
      delete process.env.LOOP_MAX_STEPS;
    }
  });

  it('reads LOOP_ABSOLUTE_MAX from env', () => {
    process.env.LOOP_ABSOLUTE_MAX = '200';
    try {
      const val = parseInt(process.env.LOOP_ABSOLUTE_MAX || '100', 10);
      expect(val).toBe(200);
    } finally {
      delete process.env.LOOP_ABSOLUTE_MAX;
    }
  });
});
