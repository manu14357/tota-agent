const githubTools = [
  { name: 'create_pr', desc: 'Create pull requests from conversation' },
  { name: 'review_pr', desc: 'Fetch diff and post review comments' },
  { name: 'list_issues', desc: 'Filter issues by state, label, assignee' },
  { name: 'create_issue', desc: 'Create issues with labels and assignees' },
  { name: 'github_api', desc: 'Raw access to any GitHub API endpoint' },
]

const telegramFeatures = [
  { icon: '📡', label: 'Text streaming', desc: 'Live response editing with typing indicators' },
  { icon: '📎', label: 'File uploads', desc: 'Photos, audio, video, documents auto-detected' },
  { icon: '⌨️', label: 'Inline keyboards', desc: 'Approve shell commands and scope requests in-chat' },
  { icon: '👥', label: 'Multi-user access', desc: 'Admin/member roles with pairing-code flow' },
  { icon: '🔒', label: 'Private chats only', desc: 'Groups and channels always ignored' },
]

const whatsappFeatures = [
  { icon: '📱', label: 'No Business API', desc: 'Links via WhatsApp Web — no Meta account needed' },
  { icon: '🔒', label: 'Phone allowlist', desc: 'Messages from unknown numbers are queued for approval' },
  { icon: '📡', label: 'Streaming replies', desc: 'Live typing indicators with chunked message delivery' },
  { icon: '📎', label: 'File & image support', desc: 'Send images and documents; tota reads and responds' },
  { icon: '🔄', label: 'Auto-reconnect', desc: 'Reconnects on network drops; persists auth between restarts' },
]

const mcpFeatures = [
  { icon: '🔌', label: 'Any MCP server', desc: 'JSON-RPC tools/list + tools/call over HTTP' },
  { icon: '🏷️', label: 'Auto-prefixed tools', desc: 'mcp_<server>_<tool> — no naming conflicts' },
  { icon: '🔑', label: 'Bearer auth', desc: 'Per-server apiKey forwarded automatically' },
  { icon: '⚡', label: 'Load at startup', desc: 'Tools registered alongside built-ins' },
  { icon: '🛡️', label: 'Graceful errors', desc: 'Unavailable servers logged and skipped' },
]

const apiEndpoints = [
  { method: 'GET', path: '/status', desc: 'Check if agent is running and ready' },
  { method: 'POST', path: '/message', desc: 'Send a message, receive a response' },
]

export default function Integrations() {
  return (
    <section id="integrations" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            Integrations
          </h2>
          <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
            Native GitHub tooling, Telegram bot, WhatsApp, REST API, and MCP plugins — all first-class.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* GitHub */}
          <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                {/* GitHub icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--fg)' }}>
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--fg)' }}>
                  GitHub Companion
                </h3>
                <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                  5 tools · activated when{' '}
                  <code className="font-mono" style={{ color: 'var(--accent)' }}>GITHUB_TOKEN</code>{' '}
                  is set
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {githubTools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-2 sm:gap-3 py-2 last:border-0"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <code className="font-mono text-xs shrink-0 mt-0.5 px-1.5 py-0.5 rounded max-w-[120px] truncate" style={{ color: '#00A9FF', background: 'rgba(0,169,255,0.1)' }}>
                    {tool.name}
                  </code>
                  <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{tool.desc}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-medium" style={{ color: 'var(--fg)' }}>Co-authored commits —</span>{' '}
                Every commit tota makes appends{' '}
                <code className="font-mono" style={{ color: 'var(--fg-subtle)' }}>
                  Co-authored-by: tota &lt;tota@github.com&gt;
                </code>{' '}
                automatically.
              </p>
            </div>
          </div>

          {/* Telegram */}
          <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                {/* Telegram icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#38bdf8">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--fg)' }}>
                  Telegram Bot
                </h3>
                <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                  Private chats · Admin + member roles · Pairing-code access
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {telegramFeatures.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="text-base shrink-0 mt-0.5">{f.icon}</span>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>
                      {f.label}
                    </span>
                    <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Access model */}
            <div className="rounded-xl p-4" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <p className="text-xs uppercase tracking-wide font-medium mb-3" style={{ color: 'var(--fg-subtle)' }}>
                Access model
              </p>
              <div className="space-y-2">
                {[
                  { role: 'Admin', desc: 'First user · Can approve / reject / manage', color: '#00A9FF' },
                  { role: 'Member', desc: 'Approved user · Full chat access', color: 'var(--fg-muted)' },
                ].map((r) => (
                  <div key={r.role} className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium px-1.5 py-0.5 rounded" style={{ color: r.color, background: 'var(--surface-raised)' }}>{r.role}</span>
                    <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* WhatsApp */}
          <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ border: '1px solid rgba(37,211,102,0.25)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#25d366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--fg)' }}>WhatsApp Channel</h3>
                <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>No Business API · Scan QR to link · Phone allowlist</p>
              </div>
            </div>
            <div className="space-y-3">
              {whatsappFeatures.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="text-base shrink-0 mt-0.5">{f.icon}</span>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{f.label}</span>
                    <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <pre className="text-xs font-mono leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{`tota setup whatsapp\ntota whatsapp link\ntota start`}</pre>
            </div>
          </div>

          {/* REST API */}
          <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ border: '1px solid rgba(99,102,241,0.25)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                  <path d="M7 8h2m2 0h6M7 11h4m2 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--fg)' }}>
                  REST API Channel
                </h3>
                <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                  HTTP control · Bearer-token auth · Port 3001 (configurable)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {apiEndpoints.map((ep) => (
                <div key={ep.path} className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-mono text-xs font-bold shrink-0 px-1.5 py-0.5 rounded" style={{ color: ep.method === 'GET' ? '#34d399' : '#60a5fa', background: ep.method === 'GET' ? 'rgba(52,211,153,0.1)' : 'rgba(96,165,250,0.1)' }}>
                    {ep.method}
                  </span>
                  <code className="font-mono text-xs shrink-0 mt-0.5" style={{ color: 'var(--accent)' }}>{ep.path}</code>
                  <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{ep.desc}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <p className="text-xs font-mono mb-1" style={{ color: 'var(--fg-subtle)' }}>
                <span style={{ color: '#60a5fa' }}>POST</span>{' '}
                <span style={{ color: 'var(--accent)' }}>/message</span>
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--fg-muted)' }}>
                {'{ "content": "What time is it?" }'}<br />
                <span style={{ color: '#34d399' }}>← {'{ "response": "It\'s 3:14 PM UTC." }'}</span>
              </p>
            </div>

            <div className="rounded-xl p-3" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-medium" style={{ color: 'var(--fg)' }}>Enable —</span>{' '}
                set{' '}
                <code className="font-mono" style={{ color: 'var(--accent)' }}>API_CHANNEL_ENABLED=true</code>
                {' '}in{' '}
                <code className="font-mono" style={{ color: 'var(--fg-subtle)' }}>~/.tota/.env</code>
              </p>
            </div>
          </div>

          {/* MCP Plugins */}
          <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ border: '1px solid rgba(6,182,212,0.25)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--fg)' }}>
                  MCP Plugins
                </h3>
                <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                  Model Context Protocol · HTTP JSON-RPC · Auto-registered at startup
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {mcpFeatures.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="text-base shrink-0 mt-0.5">{f.icon}</span>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>
                      {f.label}
                    </span>
                    <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <p className="text-xs font-mono mb-1" style={{ color: 'var(--fg-subtle)' }}>~/.tota/tota.yaml</p>
              <pre className="text-xs font-mono leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{`mcp:
  servers:
    - name: my-tools
      url: http://localhost:8080/mcp
      enabled: true`}</pre>
            </div>

            <div className="rounded-xl p-3" style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)' }}>
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-medium" style={{ color: 'var(--fg)' }}>Tool naming —</span>{' '}
                tools from server{' '}
                <code className="font-mono" style={{ color: 'var(--accent)' }}>my-tools</code>
                {' '}appear as{' '}
                <code className="font-mono" style={{ color: 'var(--accent)' }}>mcp_my-tools_&lt;name&gt;</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
