import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, RefreshCw, Send, Bot, Cpu } from 'lucide-react';
import {
  api,
  socket,
  type Orchestration,
  type AgentNode,
  type AgentNodeStatus,
  type WSMessage,
} from '../api';

const STATUS: Record<AgentNodeStatus | 'planning', { color: string; glyph: string; label: string }> = {
  queued:   { color: 'var(--text-muted)', glyph: '○', label: 'Queued' },
  running:  { color: 'var(--info, var(--accent))', glyph: '◐', label: 'Running' },
  done:     { color: 'var(--ok)', glyph: '●', label: 'Done' },
  error:    { color: 'var(--danger)', glyph: '✕', label: 'Error' },
  planning: { color: 'var(--info, var(--accent))', glyph: '◐', label: 'Planning' },
};

function elapsed(node: { startedAt?: number; finishedAt?: number }): string {
  if (!node.startedAt) return '';
  const end = node.finishedAt ?? Date.now();
  const ms = Math.max(0, end - node.startedAt);
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Card for a single agent node (orchestrator root or worker). */
function NodeCard({
  node,
  root,
  onClick,
  innerRef,
}: {
  node: AgentNode;
  root?: boolean;
  onClick?: () => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  const s = STATUS[node.status];
  return (
    <div
      ref={innerRef}
      onClick={onClick}
      className="card"
      style={{
        width: root ? 280 : 220,
        padding: 12,
        cursor: onClick ? 'pointer' : 'default',
        border: `1px solid ${s.color}`,
        boxShadow: node.status === 'running' ? `0 0 0 3px color-mix(in srgb, ${s.color} 18%, transparent)` : undefined,
        transition: 'box-shadow .2s var(--ease-out, ease)',
        background: 'var(--panel)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {root ? <Network size={15} /> : <Bot size={14} />}
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>{node.label}</span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: s.color,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span style={node.status === 'running' ? { animation: 'spin 1.4s linear infinite', display: 'inline-block' } : undefined}>
            {s.glyph}
          </span>
          {s.label}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
        {node.role}
      </div>
      {!root && (
        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 6, maxHeight: 48, overflow: 'hidden' }}>
          {node.task.slice(0, 140)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 10.5, color: 'var(--text-muted)' }}>
        {node.startedAt && <span>{elapsed(node)}</span>}
        {node.error && <span style={{ color: 'var(--danger)' }}>{node.error.slice(0, 60)}</span>}
      </div>
    </div>
  );
}

/** The node graph for one orchestration with SVG connector edges. */
function Canvas({ orc, onSelect }: { orc: Orchestration; onSelect: (n: AgentNode) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const workerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [edges, setEdges] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; color: string }>>([]);

  const root = orc.nodes.find((n) => !n.parentId);
  const workers = useMemo(() => orc.nodes.filter((n) => n.parentId), [orc.nodes]);

  const recompute = useCallback(() => {
    const c = containerRef.current;
    const r = rootRef.current;
    if (!c || !r) return;
    const cb = c.getBoundingClientRect();
    const rb = r.getBoundingClientRect();
    const x1 = rb.left + rb.width / 2 - cb.left + c.scrollLeft;
    const y1 = rb.bottom - cb.top + c.scrollTop;
    const next: typeof edges = [];
    for (const w of workers) {
      const el = workerRefs.current.get(w.id);
      if (!el) continue;
      const wb = el.getBoundingClientRect();
      next.push({
        x1,
        y1,
        x2: wb.left + wb.width / 2 - cb.left + c.scrollLeft,
        y2: wb.top - cb.top + c.scrollTop,
        color: STATUS[w.status].color,
      });
    }
    setEdges(next);
  }, [workers]);

  useEffect(() => { recompute(); }, [recompute, orc]);
  useEffect(() => {
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', recompute);
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
  }, [recompute]);

  if (!root) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'auto', height: '100%', padding: 24 }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {edges.map((e, i) => {
          const midY = (e.y1 + e.y2) / 2;
          return (
            <path
              key={i}
              d={`M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
              fill="none"
              stroke={e.color}
              strokeWidth={2}
              opacity={0.55}
            />
          );
        })}
      </svg>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 48 }}>
        <NodeCard node={root} root innerRef={(el) => { rootRef.current = el; }} onClick={() => onSelect(root)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', maxWidth: '100%' }}>
          {workers.map((w) => (
            <NodeCard
              key={w.id}
              node={w}
              onClick={() => onSelect(w)}
              innerRef={(el) => {
                if (el) workerRefs.current.set(w.id, el);
                else workerRefs.current.delete(w.id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [orchestrations, setOrchestrations] = useState<Record<string, Orchestration>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentNode | null>(null);
  const [goal, setGoal] = useState('');
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);

  const upsert = useCallback((orc: Orchestration) => {
    setOrchestrations((prev) => ({ ...prev, [orc.id]: orc }));
    setOrder((prev) => (prev.includes(orc.id) ? prev : [orc.id, ...prev]));
    setSelectedId((cur) => cur ?? orc.id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<Orchestration[]>('/api/agents');
      const map: Record<string, Orchestration> = {};
      for (const o of list) map[o.id] = o;
      setOrchestrations(map);
      setOrder(list.map((o) => o.id));
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    } catch {
      /* server may not expose it yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates over the websocket.
  useEffect(() => {
    socket.connect();
    const off = socket.subscribe((msg: WSMessage) => {
      if (msg.type !== 'agentEvent') return;
      const ev = msg.event;
      if (ev.kind === 'orchestration_start' || ev.kind === 'orchestration_end') {
        upsert(ev.orchestration);
      } else {
        setOrchestrations((prev) => {
          const orc = prev[ev.orchestrationId];
          if (!orc) return prev;
          const nodes = ev.kind === 'node_added'
            ? (orc.nodes.some((n) => n.id === ev.node.id) ? orc.nodes : [...orc.nodes, ev.node])
            : orc.nodes.map((n) => (n.id === ev.node.id ? ev.node : n));
          return { ...prev, [ev.orchestrationId]: { ...orc, nodes } };
        });
      }
    });
    return off;
  }, [upsert]);

  const launch = () => {
    const text = goal.trim();
    if (!text) return;
    socket.send({ type: 'chat', content: `/create-agent ${count > 1 ? count + ' ' : ''}${text}` });
    setGoal('');
  };

  const runs = order.map((id) => orchestrations[id]).filter(Boolean);
  const selected = selectedId ? orchestrations[selectedId] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <h1>Agents</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge--neutral">{runs.length} runs</span>
          <button className="btn btn--icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Launcher */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <Cpu size={15} style={{ color: 'var(--text-muted)' }} />
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && launch()}
          className="field-input"
          placeholder="Goal for the crew, e.g. compare the top open-source vector databases"
          style={{ flex: 1 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          agents
          <input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            className="field-input"
            style={{ width: 56 }}
          />
        </label>
        <button className="btn btn--primary" onClick={launch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Send size={13} /> Launch
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Run list */}
        <aside style={{ width: 230, borderRight: '1px solid var(--border)', overflow: 'auto', padding: 8 }}>
          {runs.length === 0 && (
            <div className="empty-state" style={{ padding: 16 }}>
              <Network size={28} />
              <p style={{ fontSize: 12 }}>No agent runs yet. Launch one above.</p>
            </div>
          )}
          {runs.map((o) => {
            const st = STATUS[o.status];
            const active = o.id === selectedId;
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: 6,
                  borderRadius: 'var(--r-md, 8px)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--bg-hover, var(--panel))' : 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: st.color }}>{st.glyph}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {o.nodes.filter((n) => n.parentId).length} agents
                  </span>
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.goal}
                </div>
              </button>
            );
          })}
        </aside>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {selected ? (
            <Canvas orc={selected} onSelect={setDetail} />
          ) : (
            <div className="empty-state" style={{ height: '100%' }}>
              <Network size={36} />
              <p>Select or launch a run to see the agent canvas.</p>
            </div>
          )}
        </div>

        {/* Detail drawer */}
        {detail && (
          <aside style={{ width: 340, borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 16, background: 'var(--panel)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: STATUS[detail.status].color }}>{STATUS[detail.status].glyph}</span>
              <strong style={{ color: 'var(--text-strong)' }}>{detail.label}</strong>
              <button className="btn btn--icon" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{detail.role}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Task</div>
            <div style={{ fontSize: 12.5, color: 'var(--text)', margin: '4px 0 12px', whiteSpace: 'pre-wrap' }}>{detail.task}</div>
            {detail.output && (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Output</div>
                <pre style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {detail.output}
                </pre>
              </>
            )}
            {detail.error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{detail.error}</div>}
          </aside>
        )}
      </div>
    </div>
  );
}
