'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Copy, Check, ArrowRight, Terminal, Star, Heart } from 'lucide-react'

const NPX_CMD = 'npx tota-agent'

const USER_MSG = 'schedule a team standup tomorrow at 10am, 30 mins'

// Lines that appear after the user message finishes typing
const RESPONSE_LINES: { text: string; tool?: boolean; ok?: boolean; ask?: boolean; dim?: boolean }[] = [
  { text: '' },
  { text: '  ● calendar_list  checking tomorrow\'s schedule...', tool: true },
  { text: '  ● calendar_create  "Team Standup" · 12 May · 10:00–10:30 AM', tool: true },
  { text: '' },
  { text: '  ✓  Event created:', ok: true },
  { text: '     📅  Team Standup', ok: true },
  { text: '     🕙  Mon, 12 May · 10:00 – 10:30 AM', ok: true },
  { text: '     🔗  Google Calendar invite link ready', ok: true },
  { text: '' },
  { text: '  ⚡ Add anyone else to the invite? [y/N]', ask: true },
]

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

function TerminalDemo() {
  const [typed, setTyped] = useState('')
  const [visibleCount, setVisibleCount] = useState(0)
  const [done, setDone] = useState(false)
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Reset and restart the whole animation when component mounts / loops
    let charIdx = 0
    let lineIdx = 0
    let cancelled = false

    function typeChar() {
      if (cancelled) return
      if (charIdx < USER_MSG.length) {
        charIdx++
        setTyped(USER_MSG.slice(0, charIdx))
        // Vary typing speed slightly for realism
        const delay = 38 + Math.random() * 40
        rafRef.current = setTimeout(typeChar, delay)
      } else {
        // Finished typing — start revealing response lines
        revealLine()
      }
    }

    function revealLine() {
      if (cancelled) return
      if (lineIdx < RESPONSE_LINES.length) {
        lineIdx++
        setVisibleCount(lineIdx)
        const delay = RESPONSE_LINES[lineIdx - 1].tool ? 520 : 180
        rafRef.current = setTimeout(revealLine, delay)
      } else {
        setDone(true)
        // After a pause, loop the whole animation
        rafRef.current = setTimeout(() => {
          if (!cancelled) {
            setTyped('')
            setVisibleCount(0)
            setDone(false)
            charIdx = 0
            lineIdx = 0
            rafRef.current = setTimeout(typeChar, 900)
          }
        }, 3800)
      }
    }

    // Initial delay before starting
    rafRef.current = setTimeout(typeChar, 700)

    return () => {
      cancelled = true
      if (rafRef.current) clearTimeout(rafRef.current)
    }
  }, [])

  const isTyping = typed.length < USER_MSG.length || visibleCount === 0
  const showCursor = !done

  return (
    <div className="p-3 sm:p-5 font-mono text-xs sm:text-sm leading-6 sm:leading-7 space-y-0.5 overflow-x-auto">
      {/* Static prefix lines */}
      <div style={{ color: '#5a8aa0' }}>
        <span style={{ color: '#00A9FF', marginRight: '8px' }}>$</span>tota
      </div>
      <div style={{ color: '#2a4a5e' }}>{'  ✦ tota is listening...'}</div>
      <div>{''}</div>

      {/* User message — typed character by character */}
      <div style={{ color: '#e8f4fd' }}>
        {typed}
        {isTyping && (
          <span
            className="inline-block w-[7px] h-[13px] ml-[2px] align-[-2px] animate-pulse"
            style={{ background: '#00A9FF' }}
          />
        )}
      </div>

      {/* Response lines revealed one by one */}
      {RESPONSE_LINES.slice(0, visibleCount).map((line, i) => (
        <div
          key={i}
          style={{
            color: line.tool ? '#89CFF3' : line.ok ? '#34d399' : line.ask ? '#fbbf24' : '#5a8aa0',
          }}
        >
          {line.text}
          {/* Blinking cursor on last visible line while still revealing */}
          {i === visibleCount - 1 && showCursor && !done && (
            <span
              className="inline-block w-[7px] h-[13px] ml-[2px] align-[-2px] animate-pulse"
              style={{ background: '#00A9FF' }}
            />
          )}
        </div>
      ))}

      {/* Steady cursor after everything is done */}
      {done && (
        <div>
          <span
            className="inline-block w-[7px] h-[13px] animate-pulse"
            style={{ background: '#00A9FF' }}
          />
        </div>
      )}
    </div>
  )
}

export default function Hero() {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    fetch('https://api.github.com/repos/manu14357/tota-agent')
      .then((r) => r.json())
      .then((d) => { if (typeof d.stargazers_count === 'number') setStars(d.stargazers_count) })
      .catch(() => {/* silent fail */})
  }, [])

  return (
    <section className="relative pt-24 pb-16 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-28 overflow-hidden">
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
            v1.0.1 · 70+ built-in tools · 11 AI providers · WhatsApp · Browser · Computer-use · Android · MCP plugins
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-center text-[2.5rem] sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-5 sm:mb-6 px-2">
          <span className="hero-gradient-text">
            Soul-driven
          </span>
          <br />
          <span style={{ color: 'var(--fg)' }}>AI agent</span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-center text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-medium px-4"
          style={{ color: 'var(--fg)' }}
        >
          AI agent built for control: permissioned tools, safe execution, token budgets, and multi-channel access.
          <br className="hidden sm:block" />
          Sees your screen. Controls your desktop. Runs 24/7 from CLI, Telegram, WhatsApp, or REST API.
        </p>

        {/* Install snippet */}
        <div className="flex justify-center mb-3 w-full px-4">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 font-mono text-xs sm:text-sm transition-all w-full max-w-sm sm:w-auto"
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
            npm i -g tota-agent
          </code>
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-16 sm:mb-20 w-full px-4">
          <Link
            href="/docs/getting-started/installation"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02] hover:opacity-90"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 20px rgba(0,169,255,0.35)' }}
          >
            Get Started
            <ArrowRight size={16} />
          </Link>
          <a
            href="https://github.com/manu14357/tota-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]"
            style={{
              color: 'var(--fg-muted)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <Star size={15} className="shrink-0" />
            {stars !== null ? (
              <span>{stars.toLocaleString()} stars · GitHub</span>
            ) : (
              <span>View on GitHub</span>
            )}
          </a>
          <a
            href="https://github.com/sponsors/manu14357"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]"
            style={{
              color: '#ea4aaa',
              border: '1px solid rgba(234,74,170,0.35)',
              background: 'rgba(234,74,170,0.07)',
            }}
          >
            <Heart size={15} className="shrink-0" />
            Sponsor
          </a>
        </div>

        {/* Terminal mockup — always dark (it's a terminal!) */}
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-0">
          <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid #0a1e2e', background: '#020c16' }}>
            {/* Chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: '#0a1e2e', background: '#051525' }}>
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-xs font-mono" style={{ color: '#3d6070' }}>tota — zsh</span>
            </div>
            {/* Animated terminal content */}
            <TerminalDemo />
          </div>
          <p className="text-center text-xs mt-3" style={{ color: 'var(--fg-subtle)' }}>
            tota always asks before it acts
          </p>
        </div>
    </section>
  )
}

