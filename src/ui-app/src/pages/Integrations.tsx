import { useEffect, useState } from 'react';
import {
  Send, MessageCircle, Globe, Server, Zap, CheckCircle2, XCircle,
  Wrench, Brain, Terminal, Calendar, Eye, Smartphone,
  Github, Search, Settings, ChevronDown, ChevronUp, ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { api, type Skill } from '../api';

interface ChannelConfig {
  enabled?: boolean;
  botToken?: string;
  port?: number;
  authDir?: string;
  approved?: unknown[];
  pending?: unknown[];
  admins?: unknown[];
  members?: unknown[];
}

interface Config {
  channels?: {
    telegram?: ChannelConfig;
    whatsapp?: ChannelConfig;
    api?: ChannelConfig;
    ui?: ChannelConfig;
  };
  github?: { username?: string; defaultOwner?: string; defaultRepo?: string };
  webSearch?: { provider?: string };
}

interface Provider {
  name: string;
  enabled: boolean;
  model?: string;
  baseUrl?: string;
}

const TOOL_CATEGORIES = [
  { icon: Terminal, name: 'Shell', description: 'Run commands and execute scripts', color: '#ff7b72' },
  { icon: Wrench, name: 'Filesystem', description: 'Read, write, edit, find files', color: '#79c0ff' },
  { icon: Brain, name: 'Memory', description: 'Store and recall facts and memories', color: '#a5d6ff' },
  { icon: Globe, name: 'Web', description: 'Search the web, fetch pages, browser', color: '#56d364' },
  { icon: Github, name: 'Git & GitHub', description: 'Commit, push, create PRs, issues', color: '#e6edf3' },
  { icon: Calendar, name: 'Scheduler', description: 'Schedule tasks and reminders', color: '#f78166' },
  { icon: Eye, name: 'Vision', description: 'Analyze images using vision AI', color: '#bc8cff' },
  { icon: Smartphone, name: 'Computer', description: 'Screen capture, mouse/keyboard, ADB', color: '#ffa657' },
  { icon: Send, name: 'Messaging', description: 'Send Telegram, WhatsApp messages', color: '#27aeef' },
  { icon: Search, name: 'MCP Tools', description: 'Model Context Protocol integrations', color: '#ff8b00' },
];

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span className={`int-pill ${enabled ? 'int-pill--on' : 'int-pill--off'}`}>
      {enabled ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {enabled ? 'Active' : 'Inactive'}
    </span>
  );
}

function ChannelCard({
  icon: Icon, color, name, sub, enabled, children, configHint,
}: {
  icon: React.ElementType;
  color: string;
  name: string;
  sub: string;
  enabled: boolean;
  children?: React.ReactNode;
  configHint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`int-card ${open ? 'int-card--open' : ''}`}>
      <button className="int-card__head" onClick={() => setOpen(o => !o)}>
        <div className="int-card__icon" style={{ background: `${color}22`, color }}>
          <Icon size={18} />
        </div>
        <div className="int-card__info">
          <p className="int-card__name">{name}</p>
          <p className="int-card__sub">{sub}</p>
        </div>
        <StatusPill enabled={enabled} />
        <span className="int-card__chevron">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="int-card__body">
          {enabled && children ? children : (
            <div className="int-card__setup">
              <p>Not configured yet.</p>
              {configHint && <code className="int-card__hint">{configHint}</code>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="int-info-row">
      <span className="int-info-label">{label}</span>
      <span className="int-info-value">{value}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'channels' | 'tools' | 'providers'>('channels');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Config>('/api/config').catch(() => ({})),
      api.get<Skill[]>('/api/skills').catch(() => []),
      api.get<Provider[]>('/api/providers').catch(() => []),
    ]).then(([cfg, sk, pv]) => {
      setConfig(cfg as Config);
      setSkills(Array.isArray(sk) ? sk : []);
      setProviders(Array.isArray(pv) ? pv : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const tg = config?.channels?.telegram;
  const wa = config?.channels?.whatsapp;
  const apiCh = config?.channels?.api;
  const gh = config?.github;

  const activeChannels = [tg?.enabled, wa?.enabled, apiCh?.enabled, true].filter(Boolean).length;

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1>Integrations</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge--neutral">{skills.length} skills</span>
          <button className="btn btn--icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      <div className="int-tabs">
        {([
          { id: 'channels' as const, label: 'Channels', count: activeChannels },
          { id: 'tools' as const, label: 'Tools & Skills', count: TOOL_CATEGORIES.length + skills.length },
          { id: 'providers' as const, label: 'AI Providers', count: providers.length },
        ] as const).map(t => (
          <button
            key={t.id}
            className={`int-tab ${tab === t.id ? 'int-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="int-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="page-body">

        {tab === 'channels' && (
          <div className="int-list">
            <ChannelCard icon={Globe} color="#5865f2" name="Web UI" sub="Browser interface" enabled={true}>
              <InfoRow label="Status" value="Always active" />
              <InfoRow label="Protocol" value="WebSocket + REST" />
              <p className="int-card__desc">Real-time streaming chat, memory, skills, scheduler, and logs.</p>
            </ChannelCard>

            <ChannelCard icon={Send} color="#27aeef" name="Telegram" sub="Bot channel" enabled={!!tg?.enabled} configHint="tota setup telegram">
              <InfoRow label="Users" value={(tg?.admins?.length ?? 0) + (tg?.members?.length ?? 0)} />
              {(tg?.pending?.length ?? 0) > 0 && <InfoRow label="Pending approvals" value={tg!.pending!.length} />}
              <p className="int-card__desc">Telegram bot channel is active and receiving messages.</p>
            </ChannelCard>

            <ChannelCard icon={MessageCircle} color="#25d366" name="WhatsApp" sub="Baileys Web" enabled={!!wa?.enabled} configHint="tota setup whatsapp">
              <InfoRow label="Approved users" value={(wa?.approved as unknown[])?.length ?? 0} />
              {(wa?.pending?.length ?? 0) > 0 && <InfoRow label="Pending" value={wa!.pending!.length} />}
              <p className="int-card__desc">WhatsApp integration via Baileys library.</p>
            </ChannelCard>

            <ChannelCard icon={Server} color="#ff5c5c" name="REST API" sub="HTTP channel" enabled={!!apiCh?.enabled} configHint="tota setup api">
              <InfoRow label="Port" value={apiCh?.port ?? 3001} />
              <p className="int-card__desc">
                POST to <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4 }}>/message</code> to send messages programmatically.
              </p>
            </ChannelCard>

            <ChannelCard icon={Github} color="#adbac7" name="GitHub" sub="Issues, PRs, commits" enabled={!!gh?.username} configHint="tota setup github">
              {gh?.username && <InfoRow label="Account" value={`@${gh.username}`} />}
              {gh?.defaultOwner && <InfoRow label="Default repo" value={`${gh.defaultOwner}/${gh.defaultRepo}`} />}
              <p className="int-card__desc">GitHub integration for code operations.</p>
            </ChannelCard>
          </div>
        )}

        {tab === 'tools' && (
          <>
            <p className="section-heading" style={{ marginBottom: 12 }}>Built-in Tool Categories</p>
            <div className="int-tools-grid">
              {TOOL_CATEGORIES.map(({ icon: Icon, name, description, color }) => (
                <div key={name} className="int-tool-card">
                  <div className="int-tool-icon" style={{ background: `${color}22`, color }}>
                    <Icon size={15} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p className="int-tool-name">{name}</p>
                    <p className="int-tool-desc">{description}</p>
                  </div>
                  <CheckCircle2 size={13} style={{ flexShrink: 0, color: '#3fb950', opacity: 0.8 }} />
                </div>
              ))}
            </div>

            {skills.length > 0 && (
              <>
                <p className="section-heading" style={{ margin: '24px 0 12px' }}>
                  Custom Skills <span className="badge badge--accent" style={{ marginLeft: 6 }}>{skills.length}</span>
                </p>
                <div className="int-tools-grid">
                  {skills.map((s) => (
                    <div key={s.name} className="int-tool-card">
                      <div className="int-tool-icon" style={{ background: 'rgba(188,140,255,0.15)', color: '#bc8cff' }}>
                        <Zap size={15} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p className="int-tool-name">{s.name}</p>
                        <p className="int-tool-desc">{s.description || 'Custom skill'}</p>
                      </div>
                      <StatusPill enabled={s.enabled !== false} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {skills.length === 0 && (
              <div className="empty-state" style={{ marginTop: 24 }}>
                <Zap size={28} />
                <p>No custom skills installed.</p>
                <p style={{ fontSize: 12 }}>Add skills to your tota skills directory.</p>
              </div>
            )}
          </>
        )}

        {tab === 'providers' && (
          <>
            {providers.length === 0 ? (
              <div className="empty-state">
                <Settings size={32} />
                <p>No AI providers configured.</p>
                <p style={{ fontSize: 12 }}>Set <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>ANTHROPIC_API_KEY</code> or other provider env vars.</p>
                <a
                  href="https://github.com/manu14357/tota-agent#configuration"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--secondary"
                  style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink size={12} /> View docs
                </a>
              </div>
            ) : (
              <div className="int-providers-grid">
                {providers.map((p) => (
                  <div key={p.name} className="int-provider-card">
                    <div className="int-provider-head">
                      <div className="int-tool-icon" style={{ background: 'rgba(255,92,92,0.15)', color: '#ff5c5c' }}>
                        <Brain size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p className="int-tool-name" style={{ textTransform: 'capitalize' }}>{p.name}</p>
                        {p.model && <p className="int-tool-desc">{p.model}</p>}
                      </div>
                      <StatusPill enabled={p.enabled} />
                    </div>
                    {p.baseUrl && (
                      <div className="int-provider-url">
                        <Globe size={11} />
                        <span>{p.baseUrl}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .page-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .int-tabs { display: flex; gap: 2px; padding: 0 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .int-tab { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-muted); transition: color 0.15s, border-color 0.15s; margin-bottom: -1px; }
        .int-tab:hover { color: var(--text); }
        .int-tab--active { color: var(--accent); border-bottom-color: var(--accent); }
        .int-tab-count { font-size: 10px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 20px; padding: 0 6px; line-height: 16px; color: var(--text-muted); }
        .int-list { display: flex; flex-direction: column; gap: 8px; }
        .int-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; transition: border-color 0.15s, box-shadow 0.15s; }
        .int-card:hover { border-color: var(--border-strong); }
        .int-card--open { border-color: var(--border-strong); box-shadow: 0 4px 20px var(--shadow); }
        .int-card__head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: none; border: none; cursor: pointer; width: 100%; text-align: left; transition: background 0.1s; }
        .int-card__head:hover { background: var(--bg-hover); }
        .int-card__icon { width: 38px; height: 38px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .int-card__info { flex: 1; min-width: 0; text-align: left; }
        .int-card__name { font-size: 14px; font-weight: 600; color: var(--text-strong); margin: 0; }
        .int-card__sub { font-size: 11px; color: var(--text-muted); margin: 2px 0 0; }
        .int-card__chevron { color: var(--text-muted); flex-shrink: 0; }
        .int-card__body { padding: 12px 16px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; background: var(--bg-elevated); }
        .int-card__setup { display: flex; flex-direction: column; gap: 8px; }
        .int-card__setup p { margin: 0; font-size: 13px; color: var(--text-muted); }
        .int-card__hint { font-family: var(--font-mono); font-size: 12px; background: var(--bg); border: 1px solid var(--border); padding: 6px 10px; border-radius: var(--r-sm); color: var(--text); display: block; }
        .int-card__desc { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; line-height: 1.6; }
        .int-info-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; padding: 5px 0; border-bottom: 1px solid var(--border); }
        .int-info-label { color: var(--text-muted); }
        .int-info-value { font-weight: 500; color: var(--text); font-family: var(--font-mono); font-size: 11px; }
        .int-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; flex-shrink: 0; letter-spacing: 0.02em; }
        .int-pill--on { background: rgba(63,185,80,0.12); color: #3fb950; border: 1px solid rgba(63,185,80,0.25); }
        .int-pill--off { background: rgba(139,148,158,0.12); color: var(--text-muted); border: 1px solid var(--border); }
        .int-tools-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
        .int-tool-card { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: var(--r-md); padding: 12px 14px; transition: border-color 0.15s; }
        .int-tool-card:hover { border-color: var(--border-strong); }
        .int-tool-icon { width: 32px; height: 32px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .int-tool-name { font-size: 13px; font-weight: 600; color: var(--text-strong); margin: 0 0 2px; }
        .int-tool-desc { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.4; }
        .int-providers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
        .int-provider-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s; }
        .int-provider-card:hover { border-color: var(--border-strong); }
        .int-provider-head { display: flex; align-items: center; gap: 10px; }
        .int-provider-url { display: flex; align-items: center; gap: 5px; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); background: var(--bg-elevated); padding: 5px 8px; border-radius: var(--r-sm); border: 1px solid var(--border); }
      `}</style>
    </div>
  );
}
