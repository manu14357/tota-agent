import { useEffect, useState } from 'react';
import { Save, Eye, EyeOff, Settings, Check, AlertTriangle, RefreshCw, Bot, Brain, Sliders } from 'lucide-react';
import { api, type Provider } from '../api';

interface AgentConfig {
  name?: string;
  identity?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  autoConfirm?: boolean;
  memoryEnabled?: boolean;
  schedulerEnabled?: boolean;
}

function ProviderCard({ provider, onSave }: {
  provider: Provider;
  onSave: (p: Provider) => Promise<void>;
}) {
  const [showKey, setShowKey] = useState(false);
  const [model,   setModel]   = useState(provider.model ?? '');
  const [apiKey,  setApiKey]  = useState(provider.apiKey ?? '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({ ...provider, model, apiKey });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="provider-card">
      <div className="provider-header">
        <span className="provider-name" style={{ textTransform: 'capitalize' }}>{provider.name}</span>
        <span className={`badge ${provider.enabled ? 'badge--ok' : 'badge--neutral'}`}>
          {provider.enabled ? 'enabled' : 'disabled'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <span className="field-label">Model</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="field-input"
            placeholder="e.g. claude-3-5-sonnet-latest"
          />
        </label>

        <label>
          <span className="field-label">API Key</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="field-input"
              placeholder="sk-…"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="btn btn--icon"
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>
      </div>

      <button
        onClick={() => void save()}
        disabled={saving}
        className="btn btn--primary"
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      >
        {saved
          ? <><Check size={13} /> Saved</>
          : saving
            ? 'Saving…'
            : <><Save size={13} /> Save changes</>
        }
      </button>
    </div>
  );
}

function AgentSection({ config, onSave }: { config: AgentConfig; onSave: (c: AgentConfig) => Promise<void> }) {
  const [name, setName] = useState(config.name ?? 'tota');
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt ?? '');
  const [temperature, setTemperature] = useState(config.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(config.maxTokens ?? 4096);
  const [autoConfirm, setAutoConfirm] = useState(config.autoConfirm ?? false);
  const [memoryEnabled, setMemoryEnabled] = useState(config.memoryEnabled ?? true);
  const [schedulerEnabled, setSchedulerEnabled] = useState(config.schedulerEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({ name, systemPrompt, temperature, maxTokens, autoConfirm, memoryEnabled, schedulerEnabled });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
          background: value ? 'var(--accent)' : 'var(--border-strong)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 20 : 3,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Bot size={14} style={{ color: 'var(--accent)' }} />
        <p className="section-heading" style={{ margin: 0 }}>Agent Behavior</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          <span className="field-label">Agent name</span>
          <input value={name} onChange={e => setName(e.target.value)} className="field-input" placeholder="tota" />
        </label>

        <label>
          <span className="field-label">System prompt <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional override)</span></span>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            className="field-input"
            rows={4}
            placeholder="You are a helpful AI agent…"
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            <span className="field-label">Temperature <span style={{ color: 'var(--text-muted)' }}>{temperature}</span></span>
            <input
              type="range" min={0} max={2} step={0.05}
              value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>Precise</span><span>Creative</span>
            </div>
          </label>

          <label style={{ flex: 1 }}>
            <span className="field-label">Max tokens</span>
            <input
              type="number" min={256} max={32000} step={256}
              value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value) || 4096)}
              className="field-input"
            />
          </label>
        </div>

        <div>
          <Toggle value={autoConfirm} onChange={setAutoConfirm} label="Auto-confirm tool calls (skip approval prompts)" />
          <Toggle value={memoryEnabled} onChange={setMemoryEnabled} label="Enable persistent memory" />
          <Toggle value={schedulerEnabled} onChange={setSchedulerEnabled} label="Enable task scheduler" />
        </div>

        <button
          onClick={() => void save()}
          disabled={saving}
          className="btn btn--primary"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {saved ? <><Check size={13} /> Saved</> : saving ? 'Saving…' : <><Save size={13} /> Save settings</>}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({});
  const [tab, setTab] = useState<'providers' | 'agent' | 'danger'>('providers');
  const [loading, setLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<Provider[]>('/api/providers').catch(() => []),
      api.get<AgentConfig>('/api/config/agent').catch(() => ({})),
    ]).then(([p, c]) => {
      setProviders(Array.isArray(p) ? p : []);
      setAgentConfig(c as AgentConfig ?? {});
    }).finally(() => setLoading(false));
  }, []);

  const saveProvider = async (p: Provider) => {
    await api.patch(`/api/providers/${p.name}`, { model: p.model, apiKey: p.apiKey });
    setProviders(prev => prev.map(x => x.name === p.name ? { ...x, ...p } : x));
  };

  const saveAgent = async (c: AgentConfig) => {
    await api.patch('/api/config/agent', c);
    setAgentConfig(c);
  };

  const TABS = [
    { id: 'providers' as const, label: 'AI Providers', icon: Brain },
    { id: 'agent' as const, label: 'Agent', icon: Sliders },
    { id: 'danger' as const, label: 'Danger Zone', icon: AlertTriangle },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <h1>Settings</h1>
        <button className="btn btn--icon" onClick={() => window.location.reload()} disabled={loading} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      {/* Settings Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 14px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: tab === id ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s, border-color 0.15s', marginBottom: -1,
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="page-body">

        {tab === 'providers' && (
          <>
            {providers.length === 0 ? (
              <div className="empty-state">
                <Settings size={32} />
                <p>No providers configured.</p>
                <p style={{ fontSize: 12 }}>Set <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>ANTHROPIC_API_KEY</code> or similar env vars.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {providers.map((p) => (
                  <ProviderCard key={p.name} provider={p} onSave={saveProvider} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'agent' && (
          <AgentSection config={agentConfig} onSave={saveAgent} />
        )}

        {tab === 'danger' && (
          <div>
            <div className="card" style={{ border: '1px solid rgba(248,81,73,0.3)', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <AlertTriangle size={16} style={{ color: '#f85149', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#f85149', margin: '0 0 4px' }}>Clear Short-term Memory</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Remove all short-term memory entries. This cannot be undone.</p>
                </div>
              </div>
              <button
                className="btn btn--danger"
                onClick={() => {
                  api.delete('/api/memory/short-term').catch(() => {});
                }}
              >
                Clear short-term memory
              </button>
            </div>

            <div className="card" style={{ border: '1px solid rgba(248,81,73,0.3)', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <AlertTriangle size={16} style={{ color: '#f85149', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#f85149', margin: '0 0 4px' }}>Clear Chat History</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Delete all chat messages. This cannot be undone.</p>
                </div>
              </div>
              <button
                className="btn btn--danger"
                onClick={() => {
                  api.delete('/api/messages').catch(() => {});
                }}
              >
                Clear chat history
              </button>
            </div>

            <div className="card" style={{ border: '1px solid rgba(248,81,73,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <AlertTriangle size={16} style={{ color: '#f85149', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#f85149', margin: '0 0 4px' }}>Reset All Data</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Clears all memory (short + long term), chat history, and schedules. This is irreversible.
                  </p>
                </div>
              </div>
              {resetConfirm ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Are you sure?</span>
                  <button
                    className="btn btn--danger"
                    onClick={async () => {
                      await Promise.all([
                        api.delete('/api/memory/short-term').catch(() => {}),
                        api.delete('/api/memory/long-term').catch(() => {}),
                        api.delete('/api/messages').catch(() => {}),
                      ]);
                      setResetConfirm(false);
                    }}
                  >
                    Yes, reset everything
                  </button>
                  <button className="btn btn--secondary" onClick={() => setResetConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn--danger" onClick={() => setResetConfirm(true)}>
                  Reset all data
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
