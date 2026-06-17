import { describe, it, expect } from 'vitest';
import { fuzzyScore } from './arrow-select.js';

describe('fuzzyScore', () => {
  it('returns 0 for an empty query (everything matches)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('returns -1 when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'create-agent')).toBe(-1);
  });

  it('matches subsequences', () => {
    expect(fuzzyScore('cag', 'create-agent')).toBeGreaterThan(0);
  });

  it('ranks a prefix/word-start match above a scattered one', () => {
    const prefix = fuzzyScore('cre', 'create-agent');
    const scattered = fuzzyScore('cre', 'coverage-reporter'); // c..re scattered
    expect(prefix).toBeGreaterThan(scattered);
  });

  it('rewards contiguous runs', () => {
    const contig = fuzzyScore('agent', 'agent');
    const broken = fuzzyScore('agent', 'a-g-e-n-t');
    expect(contig).toBeGreaterThan(broken);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('AGENT', 'agent')).toBeGreaterThan(0);
  });

  it('can rank a list to surface the intended command', () => {
    const labels = ['Status', 'Create Agent (spawn a crew)', 'Agents (recent runs)', 'Memory', 'Tasks'];
    const ranked = labels
      .map((l) => ({ l, s: fuzzyScore('crea', l) }))
      .filter((e) => e.s >= 0)
      .sort((a, b) => b.s - a.s);
    expect(ranked[0].l).toBe('Create Agent (spawn a crew)');
  });
});
