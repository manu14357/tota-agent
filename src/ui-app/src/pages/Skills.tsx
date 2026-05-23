import { useEffect, useState } from 'react';
import { Zap, Plus, X, Check, Pencil, Trash2, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { api, type Skill } from '../api';

/* ── Add/Edit Modal ── */
function SkillModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Skill;
  onClose: () => void;
  onSave: (data: { name: string; description: string; enabled: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), description: description.trim(), enabled });
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
          <span className="modal-title">{initial ? 'Edit Skill' : 'Add Skill'}</span>
          <button className="btn btn--icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <label>
            <span className="field-label">Skill name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-input"
              placeholder="e.g. web-scraper"
              autoFocus
              disabled={!!initial}
            />
          </label>
          <label>
            <span className="field-label">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field-input"
              rows={3}
              placeholder="What does this skill do?"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
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
            {saving ? 'Saving…' : <><Check size={13} /> {initial ? 'Update' : 'Add'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ entry?: Skill } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<Skill[]>('/api/skills')
      .then((s) => setSkills(Array.isArray(s) ? s : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const remove = async (name: string) => {
    await api.delete(`/api/skills/${name}`).catch(() => {});
    setSkills(prev => prev.filter(s => s.name !== name));
  };

  const toggle = async (skill: Skill) => {
    const updated = await api.patch<Skill>(`/api/skills/${skill.name}`, { enabled: !skill.enabled }).catch(() => skill);
    setSkills(prev => prev.map(s => s.name === skill.name ? { ...s, ...updated } : s));
  };

  const save = async (data: { name: string; description: string; enabled: boolean }) => {
    const entry = modal?.entry;
    if (entry) {
      const updated = await api.patch<Skill>(`/api/skills/${entry.name}`, data);
      setSkills(prev => prev.map(s => s.name === entry.name ? { ...s, ...updated } : s));
    } else {
      const created = await api.post<Skill>('/api/skills', data);
      setSkills(prev => [created, ...prev]);
    }
  };

  const enabled = skills.filter(s => s.enabled !== false);
  const disabled = skills.filter(s => s.enabled === false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <h1>Skills</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge--accent">{enabled.length} active</span>
          {disabled.length > 0 && (
            <span className="badge badge--neutral">{disabled.length} disabled</span>
          )}
          <button className="btn btn--secondary" onClick={() => setModal({})} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Add Skill
          </button>
          <button className="btn btn--icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {skills.length === 0 ? (
          <div className="empty-state">
            <Zap size={32} />
            <p>No skills loaded.</p>
            <button className="btn btn--primary" onClick={() => setModal({})} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
              <Plus size={13} /> Add first skill
            </button>
          </div>
        ) : (
          <div className="skills-grid">
            {skills.map((s) => (
              <div
                key={s.name}
                className="skill-card"
                style={{ opacity: s.enabled === false ? 0.55 : 1 }}
              >
                <div
                  className="skill-icon"
                  style={{ color: s.enabled === false ? 'var(--text-muted)' : 'var(--accent)' }}
                >
                  <Zap size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="skill-name">{s.name}</p>
                  <p className="skill-desc">{s.description || 'No description.'}</p>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => void toggle(s)}
                    className="btn btn--icon"
                    title={s.enabled === false ? 'Enable' : 'Disable'}
                    style={{ color: s.enabled !== false ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {s.enabled !== false ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <button
                    onClick={() => setModal({ entry: s })}
                    className="btn btn--icon"
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => void remove(s.name)}
                    className="btn btn--icon"
                    title="Delete"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal !== null && (
        <SkillModal
          initial={modal.entry}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
