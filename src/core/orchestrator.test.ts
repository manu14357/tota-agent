import { describe, it, expect } from 'vitest';
import {
  parseCreateAgentCommand,
  AgentOrchestrator,
  MAX_AGENTS,
  type AgentLifecycleEvent,
} from './orchestrator.js';

describe('parseCreateAgentCommand', () => {
  it('defaults to a single general agent', () => {
    const r = parseCreateAgentCommand('build a todo app');
    expect(r.count).toBe(1);
    expect(r.role).toBeUndefined();
    expect(r.goal).toBe('build a todo app');
  });

  it('parses a leading count with a generic noun', () => {
    const r = parseCreateAgentCommand('3 agents research vector databases');
    expect(r.count).toBe(3);
    expect(r.goal).toBe('research vector databases');
    expect(r.role).toBeUndefined();
  });

  it('parses a leading count with no noun', () => {
    const r = parseCreateAgentCommand('2 compare X and Y');
    expect(r.count).toBe(2);
    expect(r.goal).toBe('compare X and Y');
  });

  it('infers a role from a descriptive noun and strips a "to" connective', () => {
    const r = parseCreateAgentCommand('3 researchers to compare databases');
    expect(r.count).toBe(3);
    expect(r.role).toBe('You are a researcher.');
    expect(r.goal).toBe('compare databases');
  });

  it('honors explicit count= and role=', () => {
    const r = parseCreateAgentCommand('count=2 role="QA engineer" find bugs in src/');
    expect(r.count).toBe(2);
    expect(r.role).toBe('QA engineer');
    expect(r.goal).toBe('find bugs in src/');
  });

  it('supports the "role | goal" form', () => {
    const r = parseCreateAgentCommand('senior reviewer | audit the auth flow');
    expect(r.role).toBe('senior reviewer');
    expect(r.goal).toBe('audit the auth flow');
  });

  it('clamps the count to the maximum', () => {
    const r = parseCreateAgentCommand('999 do everything');
    expect(r.count).toBe(MAX_AGENTS);
  });
});

describe('AgentOrchestrator', () => {
  it('runs a single agent without planning and emits lifecycle events', async () => {
    const events: AgentLifecycleEvent[] = [];
    let idn = 0;
    const orc = new AgentOrchestrator({
      plan: async () => { throw new Error('plan should not be called for count=1'); },
      runCrew: async (_role, task) => `did: ${task}`,
      synthesize: async () => { throw new Error('synthesize should not be called for one worker'); },
      emit: (e) => events.push(e),
      genId: () => `id${++idn}`,
    });

    const { orchestration, summary } = await orc.run('write tests', { count: 1 });

    expect(summary).toBe('did: write tests');
    expect(orchestration.status).toBe('done');
    const workers = orchestration.nodes.filter((n) => n.parentId);
    expect(workers).toHaveLength(1);
    expect(workers[0].status).toBe('done');
    expect(events[0].kind).toBe('orchestration_start');
    expect(events.at(-1)!.kind).toBe('orchestration_end');
  });

  it('plans, runs N workers concurrently, and synthesizes', async () => {
    const orc = new AgentOrchestrator({
      plan: async (goal, count) =>
        Array.from({ length: count }, (_, i) => ({ label: `w${i}`, role: `role${i}`, task: `${goal}#${i}` })),
      runCrew: async (_role, task) => `out:${task}`,
      synthesize: async (_goal, results) => results.map((r) => r.output).join('|'),
      genId: () => 'fixed',
    });

    const { orchestration, summary } = await orc.run('do research', { count: 3 });
    expect(orchestration.nodes.filter((n) => n.parentId)).toHaveLength(3);
    expect(summary).toBe('out:do research#0|out:do research#1|out:do research#2');
    expect(orc.list()).toHaveLength(1);
  });

  it('falls back deterministically when planning throws', async () => {
    const orc = new AgentOrchestrator({
      plan: async () => { throw new Error('planner down'); },
      runCrew: async (_role, task) => `ok:${task.slice(0, 4)}`,
      synthesize: async (_g, results) => `synth(${results.length})`,
      genId: () => 'fb',
    });
    const { orchestration, summary } = await orc.run('goal', { count: 2 });
    expect(orchestration.nodes.filter((n) => n.parentId)).toHaveLength(2);
    expect(summary).toBe('synth(2)');
  });

  it('marks a worker error but still completes', async () => {
    const orc = new AgentOrchestrator({
      plan: async (_g, count) => Array.from({ length: count }, (_, i) => ({ label: `w${i}`, role: 'r', task: `t${i}` })),
      runCrew: async (_role, task) => { if (task === 't0') throw new Error('boom'); return 'fine'; },
      synthesize: async (_g, results) => results.map((r) => r.output).join(','),
      genId: () => 'e',
    });
    const { orchestration } = await orc.run('g', { count: 2 });
    const workers = orchestration.nodes.filter((n) => n.parentId);
    expect(workers.find((w) => w.task === 't0')!.status).toBe('error');
    expect(orchestration.status).toBe('done');
  });
});
