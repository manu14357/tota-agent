import { useEffect, useState } from 'react';
import { Trash2, Brain, MessageSquare, RefreshCw, Plus, X, Pencil, Check } from 'lucide-react';
import { api, type MemoryEntry } from '../api';

/* ── Add/Edit Modal ── */
function MemoryModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: MemoryEntry;
  onClose: () => void;
  onSave: (content: string, tags: string[]) => Promise<void>;
}) {
  const [content, setContent] = useState(initial?.content ?? '');
  const [tagsRaw, setTagsRaw] = useState(initial?.tags?.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!content.trim()) { setError('Content is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      await onSave(content.trim(), tags);
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
          <span className="modal-title">{initial ? 'Edit Memory' : 'Add Memory'}</span>
          <button className="btn btn--icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <label>
            <span className="field-label">Content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="field-input"
              rows={4}
              placeholder="What should the agent remember?"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              autoFocus
            />
          </label>
          <label>
            <span className="field-label">Tags <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(comma-separated, optional)</span></span>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className="field-input"
              placeholder="e.g. work, personal, reminder"
            />
          </label>
          {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : <><Check size={13} /> {initial ? 'Update' : 'Add'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Memory Section ── */
function MemorySection({
  title, icon: Icon, entries, onDelete, onEdit,
}: {
  title: string;
  icon: React.ElementType;
  entries: MemoryEntry[];
  onDelete?: (id: string) => void;
  onEdit?: (entry: MemoryEntry) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon size={14} style={{ color: 'var(--accent)' }} />
        <p className="section-heading" style={{ margin: 0 }}>{title}</p>
        <span className="badge badge--neutral" style={{ marginLeft: 'auto' }}>{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 16px' }}>
          <p>No entries yet.</p>
        </div>
      ) : (
        <div>
          {entries.map((e) => (
            <div key={e.id} className="memory-entry">
              <div style={{ flex: 1 }}>
                <p className="memory-content">{e.content}</p>
                <p className="memory-meta">
                  {new Date(e.timestamp).toLocaleString()}
                  {e.tags?.map((t) => (
                    <span key={t} className="memory-tag">#{t}</span>
                  ))}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {onEdit && (
                  <button
                    onClick={() => onEdit(e)}
                    className="btn btn--icon"
                    title="Edit entry"
                    style={{ width: 28, height: 28 }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(e.id)}
                    className="btn btn--icon btn--danger"
                    title="Delete entry"
                    style={{ width: 28, height: 28 }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MemoryPage() {
  const [shortTerm, setShortTerm] = useState<MemoryEntry[]>([]);
  const [longTerm, setLongTerm]   = useState<MemoryEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [modal, setModal] = useState<{ type: 'short' | 'long'; entry?: MemoryEntry } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<MemoryEntry[]>('/api/memory/short-term').catch(() => []),
      api.get<MemoryEntry[]>('/api/memory/long-term').catch(() => []),
    ]).then(([st, lt]) => {
      setShortTerm(Array.isArray(st) ? st : []);
      setLongTerm(Array.isArray(lt) ? lt : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteEntry = async (id: string, type: 'short' | 'long') => {
    await api.delete(`/api/memory/${type === 'short' ? 'short-term' : 'long-term'}/${id}`).catch(() => {});
    if (type === 'short') setShortTerm(prev => prev.filter(e => e.id !== id));
    else setLongTerm(prev => prev.filter(e => e.id !== id));
  };

  const saveEntry = async (content: string, tags: string[]) => {
    if (!modal) return;
    const { type, entry } = modal;
    const endpoint = `/api/memory/${type === 'short' ? 'short-term' : 'long-term'}`;

    if (entry) {
      // Edit: patch existing
      const updated = await api.patch<MemoryEntry>(`${endpoint}/${entry.id}`, { content, tags });
      if (type === 'short') setShortTerm(prev => prev.map(e => e.id === entry.id ? updated : e));
      else setLongTerm(prev => prev.map(e => e.id === entry.id ? updated : e));
    } else {
      // Add: create new
      const created = await api.post<MemoryEntry>(endpoint, { content, tags });
      if (type === 'short') setShortTerm(prev => [created, ...prev]);
      else setLongTerm(prev => [created, ...prev]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <h1>Memory</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn--secondary" onClick={() => setModal({ type: 'long' })} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Add Memory
          </button>
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
        <MemorySection
          title="Short-term"
          icon={MessageSquare}
          entries={shortTerm}
          onDelete={(id) => void deleteEntry(id, 'short')}
          onEdit={(entry) => setModal({ type: 'short', entry })}
        />
        <MemorySection
          title="Long-term"
          icon={Brain}
          entries={longTerm}
          onDelete={(id) => void deleteEntry(id, 'long')}
          onEdit={(entry) => setModal({ type: 'long', entry })}
        />
      </div>

      {modal && (
        <MemoryModal
          initial={modal.entry}
          onClose={() => setModal(null)}
          onSave={saveEntry}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
