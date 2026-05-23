import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import { api, type LogEntry } from '../api';

export default function LogsPage() {
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [filter, setFilter]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    api.get<LogEntry[]>('/api/logs')
      .then((l) => setLogs(Array.isArray(l) ? l : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [logs]);

  const filtered = filter
    ? logs.filter((l) => JSON.stringify(l).toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <h1>Logs</h1>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs…"
          className="field-input"
          style={{ width: 220, marginLeft: 'auto', textTransform: 'none' }}
        />
        <button className="btn btn--icon" onClick={load} disabled={loading} title="Refresh">
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      <div
        style={{
          flex: '1 1 0', overflowY: 'auto', padding: '12px 16px',
          background: 'var(--bg)',
        }}
      >
        {filtered.length === 0 ? (
          <div className="empty-state">
            <ScrollText size={32} />
            <p>{filter ? 'No matching log entries.' : 'No log entries yet.'}</p>
          </div>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className="log-line">
              <span className="log-time">{new Date(l.time).toLocaleTimeString()}</span>
              <span className={`log-level log-level--${l.level ?? 'info'}`}>{l.level}</span>
              <span className="log-msg">{l.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
