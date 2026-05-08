const steps = [
  {
    number: '01',
    title: 'Install',
    description: 'One command — no Docker, no config files, no cloud signup.',
    code: 'npm i -g @manu14357/tota-agent',
  },
  {
    number: '02',
    title: 'Configure',
    description:
      '30-second wizard. Enter your name, choose a provider, optionally add a Telegram bot token.',
    code: 'tota',
  },
  {
    number: '03',
    title: 'Chat naturally',
    description:
      'Ask it to check git, write code, browse a URL, schedule a reminder, or anything else. tota asks before it acts.',
    code: 'you  review my PR and suggest improvements',
  },
  {
    number: '04',
    title: 'Run 24/7',
    description:
      'One command installs the system service, starts the daemon, and confirms everything is running.',
    code: 'tota up',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            Up in minutes
          </h2>
          <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
            From zero to a 24/7 AI agent in under a minute.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`relative flex flex-col gap-4 rounded-2xl p-6 transition-all duration-200 ${
                i === steps.length - 1 && steps.length % 2 !== 0
                  ? 'lg:col-span-2 lg:max-w-lg lg:mx-auto'
                  : ''
              }`}
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <div className="flex items-start gap-4">
                <span
                  className="text-4xl font-black tracking-tighter shrink-0 leading-none"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,169,255,0.2) 0%, rgba(0,169,255,0.55) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {step.number}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--fg)' }}>
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Code block — always dark */}
              <div
                className="rounded-xl px-3 sm:px-4 py-3 font-mono text-xs sm:text-sm overflow-x-auto whitespace-nowrap"
                style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', color: 'var(--fg-muted)' }}
              >
                <span style={{ color: 'var(--accent)', marginRight: '8px', userSelect: 'none' }}>$</span>
                {step.code}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
