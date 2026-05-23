import { useEffect, useState } from 'react';
import { Activity, Cpu, Clock, Radio, RefreshCw, Bot } from 'lucide-react';
import { api, type AgentStatus } from '../api';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DashboardPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<AgentStatus>('/api/status')
      .then((s) => { setStatus(s); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Page header */}
      <div className="page-header">
        <h1>Overview</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {status && (
            <span
              className={`badge ${status.status === 'running' ? 'badge--ok' : 'badge--warn'}`}
            >
              {status.status}
            </span>
          )}
          <button
            className="btn btn--icon"
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
            Failed to load agent status: {error}
          </div>
        )}

        {!status && !error && (
          <div className="empty-state">
            <Bot size={32} />
            <p>Connecting to agent…</p>
          </div>
        )}

        {status && (
          <>
            {/* Stat cards */}
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              <div className="stat-card">
                <div className="stat-icon stat-icon--accent"><Activity size={18} /></div>
                <div>
                  <div className="stat-label">Status</div>
                  <div className="stat-value">{status.status}</div>
                  <div className="stat-sub">{status.name}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon stat-icon--info"><Cpu size={18} /></div>
                <div>
                  <div className="stat-label">Model</div>
                  <div className="stat-value" style={{ fontSize: 14 }}>{status.model}</div>
                  <div className="stat-sub">{status.provider}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon stat-icon--ok"><Clock size={18} /></div>
                <div>
                  <div className="stat-label">Uptime</div>
                  <div className="stat-value">{formatUptime(status.uptime ?? 0)}</div>
                  <div className="stat-sub">since start</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon stat-icon--warn"><Radio size={18} /></div>
                <div>
                  <div className="stat-label">Channels</div>
                  <div className="stat-value">{(status.activeChannels ?? []).length}</div>
                  <div className="stat-sub">active</div>
                </div>
              </div>
            </div>

            {/* Active channels */}
            {(status.activeChannels ?? []).length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <p className="section-heading">Active channels</p>
                {(status.activeChannels ?? []).map((ch) => (
                  <div key={ch} className="channel-row">
                    <span className="status-dot status-dot--ok" />
                    <span className="channel-name">{ch}</span>
                    <span className="channel-sub">connected</span>
                  </div>
                ))}
              </div>
            )}

            {/* Agent info */}
            <div className="card">
              <p className="section-heading">Agent info</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  ['Name', status.name],
                  ['Provider', status.provider],
                  ['Model', status.model],
                  ['Version', (status as unknown as Record<string, string>)['version'] ?? '1.2.0'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
