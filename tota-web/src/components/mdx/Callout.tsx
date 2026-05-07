import type { ReactNode } from 'react'

type CalloutType = 'default' | 'info' | 'warning' | 'error' | 'tip'

const config: Record<CalloutType, { icon: string; border: string; bg: string; color: string }> = {
  default: { icon: '💡', border: 'rgba(0,169,255,0.4)', bg: 'rgba(0,169,255,0.08)', color: 'var(--accent-light)' },
  tip:     { icon: '✨', border: 'rgba(0,169,255,0.4)', bg: 'rgba(0,169,255,0.08)', color: 'var(--accent-light)' },
  info:    { icon: 'ℹ️', border: 'rgba(59,130,246,0.4)', bg: 'rgba(59,130,246,0.08)', color: '#60a5fa' },
  warning: { icon: '⚠️', border: 'rgba(234,179,8,0.4)',  bg: 'rgba(234,179,8,0.08)',  color: '#fbbf24' },
  error:   { icon: '🚫', border: 'rgba(239,68,68,0.4)',  bg: 'rgba(239,68,68,0.08)',  color: '#f87171' },
}

export function Callout({
  type = 'default',
  children,
}: {
  type?: CalloutType
  children: ReactNode
}) {
  const c = config[type] ?? config.default
  return (
    <div
      className="my-6 flex gap-3 rounded-xl border px-4 py-3.5 text-sm"
      style={{
        borderColor: c.border,
        background: c.bg,
        color: 'var(--fg-muted)',
      }}
    >
      <span className="mt-0.5 shrink-0 text-base leading-none">{c.icon}</span>
      <div className="min-w-0 leading-relaxed [&>p]:mb-0 [&>p]:text-[inherit]">
        {children}
      </div>
    </div>
  )
}

