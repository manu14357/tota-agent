import { useEffect, useState } from 'react';
import { Trash2, Clock, RefreshCw, Plus, X, Check, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { api, type Schedule } from '../api';

function cronDesc(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  if (cron === '* * * * *') return 'Every minute';
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour';
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
  }
  return cron;
}

/* ── Add/Edit Modal ── */
function ScheduleModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Schedule;
  onClose: () => void;
  onSave: (data: { description: string; cron: string; enabled: boolean }) => Promise<void>;
}) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [cron, setCron] = useState(initial?.cron ?? '0 9 * * *');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!cron.trim()) { setError('Cron expression is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ description: description.trim(), cron: cron.trim(), enabled });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{initial ? 'Edit Schedule' : 'New Schedule'}</span>
          <button className="btn btn--icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <label>
            <span className="field-label">Task description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field-input"
              placeholder="e.g. Send daily summary report"
              autoFocus
            />
          </label>
          <label>
            <span className="field-label">Cron expression</span>
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              className="field-input"
              placeholder="0 9 * * *"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {cron && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                ↳ {cronDesc(cron)}
              </span>
            )}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="field-label" style={{ margin: 0 }}>Enabled</span>
            <button
              onClick={() => setEnabled(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: enabled ? 'var(--accent)' : 'var(--text-muted)', display: 'flex' }}
            >
              {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            </button>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : <><Check size={13} /> {initial ? 'Update' : 'Create'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading]     = useState(false);
  const [modal, setModal] = useState<{ entry?: Schedule } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<Schedule[]>('/api/schedules')
      .then((s) => setSchedules(Array.isArray(s) ? s : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    await api.delete(`/api/schedules/${id}`).catch(() => {});
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  const toggle = async (s: Schedule) => {
    const updated = await api.patch<Schedule>(`/api/schedules/${s.id}`, { enabled: !s.enabled }).catch(() => s);
    setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, ...updated } : x));
  };

  const save = async (data: { description: string; cron: string; enabled: boolean }) => {
    const entry = modal?.entry;
    if (entry) {
      const updated = await api.patch<Schedule>(`/api/schedules/${entry.id}`, data);
      setSchedules(prev => prev.map(s => s.id === entry.id ? { ...s, ...updated } : s));
    } else {
      const created = await api.post<Schedule>('/api/schedules', data);
      setSchedules(prev => [created, ...prev]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <h1>Scheduler</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge--neutral">{schedules.length} tasks</span>
          <button className="btn btn--secondary" onClick={() => setModal({})} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> New Task
          </button>
          <button className="btn btn--icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {schedules.length === 0 ? (
          <div className="empty-state">
            <Clock size={32} />
            <p>No scheduled tasks.</p>
            <button className="btn btn--primary" onClick={() => setModal({})} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
              <Plus size={13} /> Create first task
            </button>
          </div>
        ) : (
          <div className="card">
            {schedules.map((s) => (
              <div key={s.id} className="schedule-row" style={{ opacity: s.enabled ? 1 : 0.55 }}>
                <div
                  style={{
                    width: 34, height: 34, borderRadius: 'var(--r-md)',
                    background: 'var(--accent-subtle)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Clock size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="schedule-name">{s.description}</p>
                  <p className="schedule-meta">
                    <code className="schedule-cron">{s.cron}</code>
                    {' · '}
                    {cronDesc(s.cron)}
                    {s.nextRun ? <> · Next: {new Date(s.nextRun).toLocaleString()}</> : null}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => void toggle(s)}
                    className="btn btn--icon"
                    title={s.enabled ? 'Disable' : 'Enable'}
                    style={{ color: s.enabled ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {s.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <button
                    onClick={() => setModal({ entry: s })}
                    className="btn btn--icon"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => void remove(s.id)}
                    className="btn btn--icon"
                    title="Delete"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal !== null && (
        <ScheduleModal
          initial={modal.entry}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
