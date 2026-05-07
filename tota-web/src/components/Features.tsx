'use client'

import {
  ShieldCheck,
  Brain,
  Sparkles,
  Zap,
  Radio,
  Clock,
  Plug,
} from 'lucide-react'

const features = [
  {
    icon: ShieldCheck,
    title: 'Permission-Hardened',
    description:
      'Shell blocklist blocks 24 dangerous patterns. Folder-level filesystem scoping. Per-session modes: Ask Me or Allow All. No silent execution — ever.',
    accent: 'text-emerald-400',
    bg: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.2)',
  },
  {
    icon: Brain,
    title: 'Second Brain',
    description:
      'SQLite + FTS5 persistent memory. 10 memory types — identity, preferences, goals, habits, and more. Auto-extracts 0–3 facts per conversation. Fully local.',
    accent: 'text-sky-400',
    bg: 'rgba(0,169,255,0.1)',
    borderColor: 'rgba(0,169,255,0.2)',
  },
  {
    icon: Sparkles,
    title: 'Soul-Driven',
    description:
      'Personality defined by 4 markdown files you own in ~/.tota/soul/. Customize identity, persona, taste, and heartbeat. No corporate AI wrapper.',
    accent: 'text-fuchsia-400',
    bg: 'rgba(217,70,239,0.1)',
    borderColor: 'rgba(217,70,239,0.2)',
  },
  {
    icon: Zap,
    title: 'Token-Aware',
    description:
      'Daily token budget with enforcement. Auto-concise mode kicks in at 70% usage. /budget command to check status, reset, override, or change the limit.',
    accent: 'text-amber-400',
    bg: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.2)',
  },
  {
    icon: Radio,
    title: 'Live Streaming',
    description:
      'Real-time markdown rendering on CLI with ANSI colors and step tracking. Telegram gets editable messages with live typing indicators.',
    accent: 'text-sky-400',
    bg: 'rgba(14,165,233,0.1)',
    borderColor: 'rgba(14,165,233,0.2)',
  },
  {
    icon: Clock,
    title: 'Always On',
    description:
      'Daemon mode with PID management and crash recovery. System service: macOS LaunchAgent, Linux systemd, Windows Task Scheduler. All without sudo.',
    accent: 'text-teal-400',
    bg: 'rgba(20,184,166,0.1)',
    borderColor: 'rgba(20,184,166,0.2)',
  },
  {
    icon: Plug,
    title: 'Extensible Skills',
    description:
      'Install community skills with one command. Skills are markdown-based SKILL.md files with elevated permissions. Schedule them as recurring cron tasks.',
    accent: 'text-orange-400',
    bg: 'rgba(249,115,22,0.1)',
    borderColor: 'rgba(249,115,22,0.2)',
  },
]

export default function Features() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            Built different
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--fg-muted)' }}>
            Every AI agent can read files and run commands. Most do it silently.
            tota asks first — and remembers what matters.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.slice(0, 6).map((feat) => (
            <FeatureCard key={feat.title} {...feat} />
          ))}
          <div className="sm:col-span-2 lg:col-span-1">
            <FeatureCard {...features[6]} />
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  accent,
  bg,
  borderColor,
}: (typeof features)[0]) {
  return (
    <div
      className="group rounded-2xl p-6 transition-all duration-200"
      style={{
        border: `1px solid ${borderColor}`,
        background: 'var(--surface)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
    >
      <div className="inline-flex p-2.5 rounded-xl mb-4" style={{ background: bg }}>
        <Icon size={20} className={accent} strokeWidth={1.75} />
      </div>
      <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--fg)' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{description}</p>
    </div>
  )
}

