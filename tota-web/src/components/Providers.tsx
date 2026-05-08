const providers = [
  {
    name: 'DeepSeek',
    model: 'deepseek-chat',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.2)',
    description: 'Default · Cost-effective',
  },
  {
    name: 'OpenAI',
    model: 'gpt-4o-mini',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.2)',
    description: 'GPT-4o, o3, gpt-5',
  },
  {
    name: 'Anthropic',
    model: 'claude-sonnet-4',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.2)',
    description: 'Claude Sonnet, Opus',
  },
  {
    name: 'Grok / xAI',
    model: 'grok-4',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.08)',
    border: 'rgba(148,163,184,0.2)',
    description: 'OpenAI-compatible',
  },
  {
    name: 'Ollama Cloud',
    model: 'gpt-oss:120b',
    color: '#00A9FF',
    bg: 'rgba(0,169,255,0.08)',
    border: 'rgba(0,169,255,0.2)',
    description: 'Remote hosted',
  },
  {
    name: 'Ollama Local',
    model: 'qwen3.5:2b',
    color: '#89CFF3',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.2)',
    description: 'No API key needed',
  },
  {
    name: 'MiMo',
    model: 'mimo-v2.5-pro',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.08)',
    border: 'rgba(6,182,212,0.2)',
    description: 'Xiaomi · China-optimized',
  },
  {
    name: 'OpenAI-compat',
    model: 'Custom',
    color: '#64748b',
    bg: 'rgba(100,116,139,0.08)',
    border: 'rgba(100,116,139,0.2)',
    description: 'Any compatible endpoint',
  },
  {
    name: 'MiMo Token Plan',
    model: 'mimo-v2.5-pro',
    color: '#22d3ee',
    bg: 'rgba(34,211,238,0.08)',
    border: 'rgba(34,211,238,0.2)',
    description: 'Token-based pricing',
  },
]

export default function Providers() {
  return (
    <section id="providers" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            9 providers. Automatic fallback.
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--fg-muted)' }}>
            Configure multiple LLM providers and tota tries them in order,
            remembering the last successful one. One provider goes down? Another
            picks up seamlessly.
          </p>
        </div>

        {/* Provider grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-8 sm:mb-12">
          {providers.slice(0, 5).map((p) => (
            <ProviderCard key={p.name} {...p} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 max-w-4xl mx-auto">
          {providers.slice(5).map((p) => (
            <ProviderCard key={p.name} {...p} />
          ))}
        </div>

        {/* Fallback diagram */}
        <div className="mt-14 max-w-2xl mx-auto">
          <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p className="text-center text-xs uppercase tracking-widest mb-4 font-medium" style={{ color: 'var(--fg-subtle)' }}>
              Fallback chain
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap font-mono text-sm">
              {['DeepSeek', 'OpenAI', 'Anthropic', 'Grok', '…'].map(
                (name, i, arr) => (
                  <span key={name} className="flex items-center gap-2">
                    <span style={{ color: i === 0 ? '#00A9FF' : i === arr.length - 1 ? 'var(--fg-subtle)' : 'var(--fg-muted)' }}>
                      {name}
                    </span>
                    {i < arr.length - 1 && (
                      <span style={{ color: 'var(--border-hover)' }}>→</span>
                    )}
                  </span>
                ),
              )}
            </div>
            <p className="text-center text-xs mt-4" style={{ color: 'var(--fg-subtle)' }}>
              Configurable order · Tries last successful provider first · Set{' '}
              <code className="font-mono" style={{ color: 'var(--fg-muted)' }}>DEFAULT_PROVIDER</code>{' '}
              to override
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProviderCard({
  name,
  model,
  color,
  bg,
  border,
  description,
}: (typeof providers)[0]) {
  return (
    <div
      className="rounded-xl p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 hover:scale-[1.02] transition-all duration-200 min-w-0"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div
        className="text-xs sm:text-sm font-semibold truncate"
        style={{ color }}
      >
        {name}
      </div>
      <code className="text-xs font-mono truncate" style={{ color: 'var(--fg-subtle)' }}>{model}</code>
      <p className="text-xs leading-snug" style={{ color: 'var(--fg-muted)' }}>{description}</p>
    </div>
  )
}
