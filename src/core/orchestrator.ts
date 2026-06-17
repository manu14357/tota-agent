// Multi-agent orchestrator.
//
// Spawns one or many sub-agents from a single high-level goal, tracks each
// one's lifecycle, and streams lifecycle events so the web UI canvas can
// render them live. The actual LLM work (planning, running a crew agent,
// synthesizing) is injected so this module stays pure and testable.

import { logger } from '../utils/logger.js';

export const MAX_AGENTS = 8;

export interface CreateAgentRequest {
  count: number;
  role?: string;
  goal: string;
}

function clampCount(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), MAX_AGENTS);
}

/**
 * Parse the free-form argument string of `/create-agent`. Supports:
 *   /create-agent build a todo app                 → 1 general agent
 *   /create-agent 3 research the best vector DBs    → 3 agents on one goal
 *   /create-agent 3 researchers compare X and Y     → 3 "researcher" agents
 *   /create-agent count=2 role="QA engineer" find bugs in src/
 *   /create-agent senior reviewer | audit the auth flow   (role | goal)
 */
export function parseCreateAgentCommand(raw: string): CreateAgentRequest {
  let text = (raw ?? '').trim();
  let count = 1;
  let role: string | undefined;
  let sawExplicitCount = false;

  const countEq = text.match(/\bcount\s*=\s*(\d+)/i);
  if (countEq) {
    count = clampCount(parseInt(countEq[1], 10));
    sawExplicitCount = true;
    text = text.replace(countEq[0], '').trim();
  }

  const roleEq = text.match(/\brole\s*=\s*"([^"]+)"/i) ?? text.match(/\brole\s*=\s*'([^']+)'/i);
  if (roleEq) {
    role = roleEq[1].trim();
    text = text.replace(roleEq[0], '').trim();
  }

  // Leading number ("3 …"), optionally followed by a noun describing the workers.
  if (!sawExplicitCount) {
    const num = text.match(/^(\d+)\b\s*/);
    if (num) {
      count = clampCount(parseInt(num[1], 10));
      text = text.slice(num[0].length).trim();

      // Drop a generic worker noun ("agents", "workers").
      const generic = text.match(/^(agents?|workers?|sub-?agents?)\b\s*/i);
      if (generic) {
        text = text.slice(generic[0].length).trim();
      } else if (!role) {
        // Infer a role only when a noun is followed by a connective, so we
        // don't mistake a leading verb ("2 compare X") for a role.
        const roleMatch = text.match(/^([a-zA-Z][a-zA-Z-]*)\s+(?:to|that|who)\s+(.*)$/i);
        if (roleMatch) {
          role = `You are a ${roleMatch[1].replace(/s$/i, '')}.`;
          text = roleMatch[2].trim();
        }
      }
    }
  }

  // Strip a leading connective ("to …", "that …", ": …").
  text = text.replace(/^(to|that|who|:|-)\s+/i, '').trim();

  // "role | goal" form.
  if (!role && text.includes('|')) {
    const [r, ...rest] = text.split('|');
    if (rest.length && r.trim()) {
      role = r.trim();
      text = rest.join('|').trim();
    }
  }

  return { count, role, goal: text };
}

export type AgentNodeStatus = 'queued' | 'running' | 'done' | 'error';
export type OrchestrationStatus = 'planning' | 'running' | 'done' | 'error';

export interface AgentNode {
  id: string;
  orchestrationId: string;
  /** null for the root orchestrator node, otherwise the orchestrator id. */
  parentId: string | null;
  /** Short display label, e.g. "orchestrator" or "agent-1". */
  label: string;
  role: string;
  task: string;
  status: AgentNodeStatus;
  output?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface Orchestration {
  id: string;
  goal: string;
  status: OrchestrationStatus;
  createdAt: number;
  finishedAt?: number;
  /** Includes the root orchestrator node followed by each worker node. */
  nodes: AgentNode[];
  summary?: string;
}

export type AgentLifecycleEvent =
  | { kind: 'orchestration_start'; orchestration: Orchestration }
  | { kind: 'node_added'; orchestrationId: string; node: AgentNode }
  | { kind: 'node_update'; orchestrationId: string; node: AgentNode }
  | { kind: 'orchestration_end'; orchestration: Orchestration };

export type AgentEventSink = (event: AgentLifecycleEvent) => void;

/** Produces a distinct (role, task, label) for each worker the user asked for. */
export type PlanFn = (
  goal: string,
  count: number,
) => Promise<Array<{ role: string; task: string; label: string }>>;

/** Runs a single crew agent and returns its final text output. */
export type CrewRunFn = (role: string, task: string, allowedTools?: string[]) => Promise<string>;

/** Combines the worker outputs into one answer for the user. */
export type SynthesizeFn = (
  goal: string,
  results: Array<{ label: string; role: string; output: string }>,
) => Promise<string>;

export interface OrchestratorDeps {
  plan: PlanFn;
  runCrew: CrewRunFn;
  synthesize: SynthesizeFn;
  emit?: AgentEventSink;
  /** A monotonic id generator. Injected so tests can be deterministic. */
  genId?: () => string;
  /** Max orchestrations to keep in memory for the /agents view. */
  historyLimit?: number;
}

export interface RunOptions {
  count?: number;
  role?: string;
  allowedTools?: string[];
}

const DEFAULT_HISTORY_LIMIT = 25;

let idCounter = 0;
function defaultGenId(): string {
  idCounter += 1;
  return `orc_${idCounter.toString(36)}_${Math.floor(performance.now()).toString(36)}`;
}

export class AgentOrchestrator {
  private orchestrations = new Map<string, Orchestration>();
  private order: string[] = [];

  constructor(private deps: OrchestratorDeps) {}

  private get historyLimit(): number {
    return this.deps.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  }

  private genId(): string {
    return (this.deps.genId ?? defaultGenId)();
  }

  private emit(event: AgentLifecycleEvent): void {
    try {
      this.deps.emit?.(event);
    } catch (err) {
      logger.warn({ err }, 'Agent event sink threw');
    }
  }

  /** Snapshot of all tracked orchestrations, newest first (for the UI/CLI). */
  list(): Orchestration[] {
    return this.order
      .map((id) => this.orchestrations.get(id))
      .filter((o): o is Orchestration => Boolean(o))
      .reverse();
  }

  get(id: string): Orchestration | undefined {
    return this.orchestrations.get(id);
  }

  private remember(orc: Orchestration): void {
    this.orchestrations.set(orc.id, orc);
    this.order.push(orc.id);
    while (this.order.length > this.historyLimit) {
      const evicted = this.order.shift();
      if (evicted) this.orchestrations.delete(evicted);
    }
  }

  /**
   * Run the full multi-agent flow for a goal and return a synthesized answer.
   * Lifecycle events are emitted throughout so the UI can render progress.
   */
  async run(goal: string, opts: RunOptions = {}): Promise<{ orchestration: Orchestration; summary: string }> {
    const count = Math.max(1, Math.min(opts.count ?? 1, 8)); // hard cap to avoid runaway fan-out
    const now = Date.now();
    const id = this.genId();

    const rootNode: AgentNode = {
      id: `${id}:root`,
      orchestrationId: id,
      parentId: null,
      label: 'orchestrator',
      role: 'Orchestrator',
      task: goal,
      status: 'running',
      createdAt: now,
      startedAt: now,
    };

    const orchestration: Orchestration = {
      id,
      goal,
      status: 'planning',
      createdAt: now,
      nodes: [rootNode],
    };
    this.remember(orchestration);
    this.emit({ kind: 'orchestration_start', orchestration });

    // ── Plan ──────────────────────────────────────────────────────────────
    let plans: Array<{ role: string; task: string; label: string }>;
    try {
      if (count === 1) {
        plans = [{ role: opts.role || 'General agent', task: goal, label: 'agent-1' }];
      } else {
        plans = await this.deps.plan(goal, count);
      }
    } catch (err) {
      logger.warn({ err }, 'Orchestrator planning failed; using deterministic fallback');
      plans = [];
    }

    // Deterministic fallback / normalization: always end up with exactly `count`
    // worker specs, even if the planner returned too few or threw.
    if (plans.length === 0) {
      plans = Array.from({ length: count }, (_, i) => ({
        role: opts.role || 'General agent',
        task: count === 1 ? goal : `${goal}\n\n(You are worker ${i + 1} of ${count}. Focus on a distinct facet of the goal and avoid duplicating the others.)`,
        label: `agent-${i + 1}`,
      }));
    } else if (plans.length !== count) {
      plans = plans.slice(0, count);
      while (plans.length < count) {
        const i = plans.length;
        plans.push({ role: opts.role || 'General agent', task: goal, label: `agent-${i + 1}` });
      }
    }

    // Create worker nodes (queued) and announce them.
    const workers: AgentNode[] = plans.map((p, i) => {
      const node: AgentNode = {
        id: `${id}:w${i + 1}`,
        orchestrationId: id,
        parentId: rootNode.id,
        label: p.label || `agent-${i + 1}`,
        role: p.role,
        task: p.task,
        status: 'queued',
        createdAt: Date.now(),
      };
      orchestration.nodes.push(node);
      this.emit({ kind: 'node_added', orchestrationId: id, node });
      return node;
    });

    orchestration.status = 'running';
    this.emit({ kind: 'node_update', orchestrationId: id, node: rootNode });

    // ── Run all workers concurrently ─────────────────────────────────────
    const settled = await Promise.all(
      workers.map(async (node) => {
        node.status = 'running';
        node.startedAt = Date.now();
        this.emit({ kind: 'node_update', orchestrationId: id, node });
        try {
          const output = await this.deps.runCrew(node.role, node.task, opts.allowedTools);
          node.status = 'done';
          node.output = output;
          node.finishedAt = Date.now();
          this.emit({ kind: 'node_update', orchestrationId: id, node });
          return { label: node.label, role: node.role, output };
        } catch (err: any) {
          node.status = 'error';
          node.error = err?.message ?? String(err);
          node.finishedAt = Date.now();
          this.emit({ kind: 'node_update', orchestrationId: id, node });
          return { label: node.label, role: node.role, output: `[failed: ${node.error}]` };
        }
      }),
    );

    // ── Synthesize ────────────────────────────────────────────────────────
    let summary: string;
    if (settled.length === 1) {
      summary = settled[0].output;
    } else {
      try {
        summary = await this.deps.synthesize(goal, settled);
      } catch (err) {
        logger.warn({ err }, 'Orchestrator synthesis failed; concatenating outputs');
        summary = settled.map((r) => `### ${r.label} (${r.role})\n${r.output}`).join('\n\n');
      }
    }

    rootNode.status = orchestration.nodes.some((n) => n.parentId && n.status === 'error') && settled.every((r) => r.output.startsWith('[failed:'))
      ? 'error'
      : 'done';
    rootNode.output = summary;
    rootNode.finishedAt = Date.now();
    orchestration.summary = summary;
    orchestration.status = rootNode.status === 'error' ? 'error' : 'done';
    orchestration.finishedAt = Date.now();
    this.emit({ kind: 'node_update', orchestrationId: id, node: rootNode });
    this.emit({ kind: 'orchestration_end', orchestration });

    return { orchestration, summary };
  }
}
