'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, Check, ArrowRight } from 'lucide-react'

const installSteps = [
  { comment: '# Install globally', cmd: 'npm i -g @manu14357/tota-agent' },
  { comment: '# Or try without installing', cmd: 'npx @manu14357/tota-agent' },
  { comment: '', cmd: '' },
  { comment: '# First run — 30s setup wizard', cmd: 'tota' },
  { comment: '', cmd: '' },
  { comment: '# Run as a 24/7 background daemon', cmd: 'tota up' },
]

export default function Install() {
  const [copied, setCopied] = useState(false)

  const fullCode = installSteps
    .map((s) => (s.comment ? `${s.comment}\n${s.cmd}` : s.cmd ? s.cmd : ''))
    .join('\n')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id="install" className="py-24 sm:py-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Glow */}
        <div
          aria-hidden
          className="absolute inset-x-0 h-64 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,169,255,0.1) 0%, transparent 70%)',
          }}
        />

        <div className="text-center mb-10 relative">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            Ready to start?
          </h2>
          <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
            Node.js 20+ required. First run takes about 30 seconds.
          </p>
        </div>

        {/* Code block — always dark, it's a terminal */}
        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid #1a1a2e', background: '#080810' }}>
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1a1a2e', background: '#0d0d18' }}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-xs font-mono" style={{ color: '#4b5572' }}>zsh</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded"
              style={{ color: '#64748b' }}
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  Copy
                </>
              )}
            </button>
          </div>

          {/* Code content */}
          <pre className="p-4 sm:p-6 font-mono text-xs sm:text-sm leading-6 sm:leading-7 overflow-x-auto">
            {installSteps.map((step, i) =>
              step.cmd === '' && step.comment === '' ? (
                <span key={i} className="block h-2" />
              ) : (
                <span key={i} className="block">
                  {step.comment && (
                    <span style={{ color: '#4b5572' }}>{step.comment}{'\n'}</span>
                  )}
                  {step.cmd && (
                    <span>
                      <span style={{ color: '#00A9FF' }} className="select-none">$ </span>
                      <span style={{ color: '#cbd5e1' }}>{step.cmd}</span>
                      {'\n'}
                    </span>
                  )}
                </span>
              ),
            )}
          </pre>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8 w-full">
          <Link
            href="/docs/getting-started/installation"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02]"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 16px rgba(0,169,255,0.35)' }}
          >
            Full setup guide
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/docs"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--fg-muted)', background: 'var(--surface)' }}
          >
            Browse docs
          </Link>
        </div>
      </div>
    </section>
  )
}
