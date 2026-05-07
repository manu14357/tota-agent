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
            Native GitHub tooling and a full Telegram bot — both first-class.
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
                  className="flex items-start gap-3 py-2 last:border-0"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <code className="font-mono text-xs shrink-0 mt-0.5 px-1.5 py-0.5 rounded" style={{ color: '#00A9FF', background: 'rgba(0,169,255,0.1)' }}>
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
                  { role: 'Member', desc: 'Approved · Can send messages', color: '#89CFF3' },
                  { role: 'Pending', desc: 'Sent /start · Awaiting admin approval', color: '#fbbf24' },
                ].map((r) => (
                  <div key={r.role} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-14 shrink-0" style={{ color: r.color }}>
                      {r.role}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
