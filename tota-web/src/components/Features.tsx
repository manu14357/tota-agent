'use client'

import {
  ShieldCheck,
  Brain,
  Sparkles,
  Zap,
  Radio,
  Clock,
  Plug,
  Search,
  Eye,
  Code2,
  GitBranch,
  Server,
  Puzzle,
  KeyRound,
  Bell,
  Clipboard,
  Mic,
  CalendarDays,
  Users,
  Globe,
  Monitor,
  Smartphone,
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
    icon: Search,
    title: 'Web Search',
    description:
      'Built-in web_search tool with Brave, Serper, and Tavily support. Auto-detects provider from env keys. Search results formatted as numbered markdown.',
    accent: 'text-violet-400',
    bg: 'rgba(139,92,246,0.1)',
    borderColor: 'rgba(139,92,246,0.2)',
  },
  {
    icon: Eye,
    title: 'Vision',
    description:
      'Analyze local images or image URLs with analyze_image. Auto-detects MIME type from magic bytes. Works with any provider that has vision support.',
    accent: 'text-pink-400',
    bg: 'rgba(236,72,153,0.1)',
    borderColor: 'rgba(236,72,153,0.2)',
  },
  {
    icon: Code2,
    title: 'Code Sandbox',
    description:
      'Execute Python, JavaScript, Bash, TypeScript, Ruby, and Go in an isolated temporary sandbox via run_code. Output capped at 8,000 chars. Auto-cleanup.',
    accent: 'text-lime-400',
    bg: 'rgba(132,204,22,0.1)',
    borderColor: 'rgba(132,204,22,0.2)',
  },
  {
    icon: GitBranch,
    title: 'Task Delegation',
    description:
      'delegate_task spawns a focused sub-agent for complex sub-tasks and returns the result. Enables multi-step autonomous workflows without losing context.',
    accent: 'text-orange-400',
    bg: 'rgba(249,115,22,0.1)',
    borderColor: 'rgba(249,115,22,0.2)',
  },
  {
    icon: Puzzle,
    title: 'MCP Plugins',
    description:
      'Connect any Model Context Protocol server over HTTP. Tools appear instantly as mcp_<server>_<tool>. Any JSON-RPC MCP server is supported.',
    accent: 'text-cyan-400',
    bg: 'rgba(6,182,212,0.1)',
    borderColor: 'rgba(6,182,212,0.2)',
  },
  {
    icon: Server,
    title: 'REST API Channel',
    description:
      'Control tota programmatically via HTTP. POST /message, GET /status. Optional bearer-token auth. Runs alongside CLI and Telegram on a configurable port.',
    accent: 'text-indigo-400',
    bg: 'rgba(99,102,241,0.1)',
    borderColor: 'rgba(99,102,241,0.2)',
  },
  {
    icon: Plug,
    title: 'Extensible Skills',
    description:
      'Install community skills with one command. Skills are markdown-based SKILL.md files with elevated permissions. Schedule them as recurring cron tasks.',
    accent: 'text-rose-400',
    bg: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)',
  },
  {
    icon: KeyRound,
    title: 'Secrets Vault',
    description:
      'Store API keys and tokens in the OS keychain (macOS Keychain, GNOME Keyring, Windows Credential Manager) with AES-256-GCM encrypted file fallback.',
    accent: 'text-yellow-400',
    bg: 'rgba(234,179,8,0.1)',
    borderColor: 'rgba(234,179,8,0.2)',
  },
  {
    icon: Bell,
    title: 'Desktop Notifications',
    description:
      'Send native desktop notifications from macOS, Linux, or Windows. Perfect for long-running tasks — get pinged when the job is done.',
    accent: 'text-orange-300',
    bg: 'rgba(253,186,116,0.08)',
    borderColor: 'rgba(253,186,116,0.18)',
  },
  {
    icon: Clipboard,
    title: 'Clipboard',
    description:
      'Read from and write to the system clipboard. Copy results, paste context, and pipe data in both directions without leaving the conversation.',
    accent: 'text-teal-300',
    bg: 'rgba(94,234,212,0.08)',
    borderColor: 'rgba(94,234,212,0.18)',
  },
  {
    icon: Mic,
    title: 'Voice TTS / STT',
    description:
      'Text-to-speech via OpenAI TTS-1 and speech-to-text via Whisper. Telegram voice messages are auto-transcribed before reaching the agent.',
    accent: 'text-violet-300',
    bg: 'rgba(196,181,253,0.08)',
    borderColor: 'rgba(196,181,253,0.18)',
  },
  {
    icon: CalendarDays,
    title: 'Google Calendar',
    description:
      'List, create, and delete events. Check free/busy availability. Full OAuth2 flow built in — no external server needed, just paste the auth code.',
    accent: 'text-blue-400',
    bg: 'rgba(96,165,250,0.08)',
    borderColor: 'rgba(96,165,250,0.18)',
  },
  {
    icon: Globe,
    title: 'Browser Automation',
    description:
      '26 browser_* tools powered by Playwright. Click, type, scroll, hover, drag, evaluate JS, manage cookies and storage, export to PDF, set viewport, and switch between Chromium, Firefox, and WebKit engines.',
    accent: 'text-sky-400',
    bg: 'rgba(14,165,233,0.1)',
    borderColor: 'rgba(14,165,233,0.2)',
  },
  {
    icon: Monitor,
    title: 'Computer-Use',
    description:
      'See and control your desktop with 9 computer_* tools. Screenshot, semantic vision (find-by-description), click, move, type, key-press, scroll, drag, and read screen dimensions — cross-platform.',
    accent: 'text-teal-400',
    bg: 'rgba(20,184,166,0.1)',
    borderColor: 'rgba(20,184,166,0.2)',
  },
  {
    icon: Smartphone,
    title: 'Android Control',
    description:
      '10 adb_* tools for Android automation. Screenshot, vision, tap, swipe, type, key events, shell commands, and bidirectional file transfers — no root required, just ADB.',
    accent: 'text-green-400',
    bg: 'rgba(74,222,128,0.1)',
    borderColor: 'rgba(74,222,128,0.2)',
  },
  {
    icon: Users,
    title: 'Multi-Agent Crew',
    description:
      'Spawn specialized sub-agents (researcher, coder, reviewer) with scoped tool access and independent context. Coordinate complex workflows in parallel.',
    accent: 'text-fuchsia-300',
    bg: 'rgba(240,171,252,0.08)',
    borderColor: 'rgba(240,171,252,0.18)',
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

        {/* Feature grid — 3 columns, last row centered if odd */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((feat) => (
            <FeatureCard key={feat.title} {...feat} />
          ))}
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

