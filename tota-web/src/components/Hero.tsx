'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Copy, Check, ArrowRight, Terminal } from 'lucide-react'

const NPX_CMD = 'npx @manu14357/tota-agent'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md transition-all"
      style={{ color: 'var(--fg-subtle)' }}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check size={14} className="text-emerald-500" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  )
}

const terminalLines = [
  { prompt: true, text: 'tota' },
  { prompt: false, text: '  ✦ tota is listening...', dim: true },
  { prompt: false, text: '' },
  { prompt: false, text: 'you  check my git status and make a commit', user: true },
  { prompt: false, text: '' },
  { prompt: false, text: '  ● git_status  ', tool: true },
  { prompt: false, text: '' },
  { prompt: false, text: '  3 files staged: agent.ts, store.ts, web/index.ts' },
  { prompt: false, text: '  Commit message: "feat: add web capability"' },
  { prompt: false, text: '' },
  { prompt: false, text: '  ⚡ Allow git commit? [y/N]', ask: true },
]

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
      {/* Gradient glow */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[600px] pointer-events-none"
        style={{
          background:
              'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,169,255,0.12) 0%, rgba(137,207,243,0.06) 50%, transparent 70%)',
        }}
      />
      <div className="flex flex-col items-center gap-5 mb-8">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              border: '1px solid var(--accent)',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00A9FF' }} />
            31 built-in tools · 9 AI providers · SQLite Second Brain
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-center text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
          <span className="hero-gradient-text">
            Soul-driven
          </span>
          <br />
          <span style={{ color: 'var(--fg)' }}>AI agent</span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-center text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-medium"
          style={{ color: 'var(--fg)' }}
        >
          Permission-hardened tools, token budgets, and multi-channel access.
          <br className="hidden sm:block" />
          Remembers what matters. Asks before it acts. Runs 24/7 from CLI or Telegram.
        </p>

        {/* Install snippet */}
        <div className="flex justify-center mb-3">
          <div
            className="flex items-center gap-3 rounded-xl px-5 py-3 font-mono text-sm transition-all"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <Terminal size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{NPX_CMD}</span>
            <CopyButton text={NPX_CMD} />
          </div>
        </div>

        <p className="text-center text-xs mb-10" style={{ color: 'var(--fg-muted)' }}>
          Or:{' '}
          <code className="font-mono" style={{ color: 'var(--accent)' }}>
            npm i -g @manu14357/tota-agent
          </code>
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <Link
            href="/docs/getting-started/installation"
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02] hover:opacity-90"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 20px rgba(0,169,255,0.35)' }}
          >
            Get Started
            <ArrowRight size={16} />
          </Link>
          <a
            href="https://github.com/manu14357/tota-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all"
            style={{
              color: 'var(--fg-muted)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            View on GitHub
          </a>
        </div>

        {/* Terminal mockup — always dark (it's a terminal!) */}
        <div className="max-w-2xl mx-auto">
          <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid #0a1e2e', background: '#020c16' }}>
            {/* Chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: '#0a1e2e', background: '#051525' }}>
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-xs font-mono" style={{ color: '#3d6070' }}>tota — zsh</span>
            </div>
            {/* Content */}
            <div className="p-5 font-mono text-sm leading-7 space-y-0.5">
              {terminalLines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.user ? '#e8f4fd' : line.tool ? '#89CFF3' : line.ask ? '#fbbf24' : line.dim ? '#2a4a5e' : '#5a8aa0',
                  }}
                >
                  {line.prompt && <span style={{ color: '#00A9FF', marginRight: '8px' }}>$</span>}
                  {line.text}
                  {i === terminalLines.length - 1 && (
                    <span className="inline-block w-2 h-4 ml-1 align-[-2px] animate-pulse" style={{ background: '#00A9FF' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-xs mt-3" style={{ color: 'var(--fg-subtle)' }}>
            tota always asks before it acts
          </p>
        </div>
    </section>
  )
}

