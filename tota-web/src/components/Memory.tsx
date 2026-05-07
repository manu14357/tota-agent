const memoryTypes = [
  { type: 'identity', label: 'Identity', scope: 'durable', color: 'sky' },
  { type: 'preference', label: 'Preference', scope: 'durable', color: 'fuchsia' },
  { type: 'goal', label: 'Goal', scope: 'active', color: 'amber' },
  { type: 'project', label: 'Project', scope: 'active', color: 'blue' },
  { type: 'habit', label: 'Habit', scope: 'durable', color: 'emerald' },
  { type: 'decision', label: 'Decision', scope: 'active', color: 'orange' },
  { type: 'constraint', label: 'Constraint', scope: 'durable', color: 'red' },
  { type: 'relationship', label: 'Relationship', scope: 'durable', color: 'pink' },
  { type: 'episode', label: 'Episode', scope: 'active', color: 'sky' },
  { type: 'reflection', label: 'Reflection', scope: 'durable', color: 'teal' },
]

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  sky:    { bg: 'rgba(0,169,255,0.1)', text: '#00A9FF', border: 'rgba(0,169,255,0.25)' },
  fuchsia: { bg: 'rgba(217,70,239,0.1)', text: '#e879f9', border: 'rgba(217,70,239,0.25)' },
  amber: { bg: 'rgba(245,158,11,0.1)', text: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
  blue: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  emerald: { bg: 'rgba(16,185,129,0.1)', text: '#34d399', border: 'rgba(16,185,129,0.25)' },
  orange: { bg: 'rgba(249,115,22,0.1)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  red: { bg: 'rgba(239,68,68,0.1)', text: '#f87171', border: 'rgba(239,68,68,0.25)' },
  pink: { bg: 'rgba(236,72,153,0.1)', text: '#f472b6', border: 'rgba(236,72,153,0.25)' },
  teal: { bg: 'rgba(20,184,166,0.1)', text: '#2dd4bf', border: 'rgba(20,184,166,0.25)' },
}

const flow = [
  { label: 'Extract', sub: '0–3 facts per response', icon: '⬇' },
  { label: 'Score', sub: 'Confidence · Importance · Durability', icon: '⚖' },
  { label: 'Recall', sub: 'Top 5 relevant on every request', icon: '🔍' },
  { label: 'Consolidate', sub: 'Profile summary every 60 min', icon: '🧠' },
]

export default function Memory() {
  return (
    <section id="memory" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            Second Brain
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--fg-muted)' }}>
            A persistent, structured memory that grows with every conversation.
            SQLite + FTS5 under the hood. Everything stays on your machine.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left: Memory types */}
          <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold" style={{ color: 'var(--fg)' }}>10 Memory Types</h3>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--fg-subtle)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
                  durable
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500/60" />
                  active
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {memoryTypes.map((m) => {
                const c = colorMap[m.color]
                return (
                  <span
                    key={m.type}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                    style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                  >
                    {m.label}
                    <span
                      className="w-1.5 h-1.5 rounded-full opacity-60"
                      style={{
                        background:
                          m.scope === 'durable' ? '#34d399' : '#fbbf24',
                      }}
                    />
                  </span>
                )
              })}
            </div>

            {/* Stats */}
            <div className="mt-5 pt-5 grid grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Storage', value: 'SQLite + FTS5' },
                { label: 'Location', value: '~/.tota/memory/' },
                { label: 'Context', value: '5 memories / req' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-xs font-mono" style={{ color: 'var(--fg-muted)' }}>{s.value}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--fg-subtle)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Flow + features */}
          <div className="flex flex-col gap-4">
            {/* Flow */}
            <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <h3 className="font-semibold mb-4" style={{ color: 'var(--fg)' }}>How it works</h3>
              <div className="space-y-3">
                {flow.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-lg shrink-0 mt-0.5">{step.icon}</span>
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>
                        {step.label}
                      </span>
                      <span className="text-xs ml-2" style={{ color: 'var(--fg-subtle)' }}>
                        {step.sub}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conflict + privacy */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="font-medium text-sm mb-1" style={{ color: 'var(--fg)' }}>Conflict resolution</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
                  Higher-confidence memory wins. Opposing facts auto-resolved.
                  Memories reinforced 3× promoted to durable scope.
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.05)' }}>
                <div className="font-medium text-sm mb-1" style={{ color: '#34d399' }}>100% local</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
                  All memory data stays in{' '}
                  <code className="font-mono" style={{ color: 'var(--fg-subtle)' }}>~/.tota/</code>.
                  Nothing leaves your machine.
                </p>
              </div>
            </div>

            {/* Management */}
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <p className="text-xs mb-2 font-medium uppercase tracking-wide" style={{ color: 'var(--fg-subtle)' }}>
                Manage via /memory
              </p>
              <div className="flex flex-wrap gap-2">
                {['Overview', 'Recent', 'Search', 'Pause', 'Resume', 'Clear'].map(
                  (action) => (
                    <code
                      key={action}
                      className="text-xs px-2 py-1 rounded font-mono"
                      style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', color: 'var(--fg-muted)' }}
                    >
                      {action}
                    </code>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
