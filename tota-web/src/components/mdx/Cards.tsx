import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'

function Card({ title, href, icon }: { title: string; href: string; icon?: string }) {
  const isExternal = href.startsWith('http')
  const props = isExternal
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {}

  return (
    <Link
      href={href}
      {...props}
      className="group flex items-center justify-between rounded-xl p-4 transition-all duration-200 mdx-card"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-lg">{icon}</span>}
        <span
          className="text-sm font-semibold transition-colors"
          style={{ color: 'var(--fg)' }}
        >
          {title}
        </span>
      </div>
      <ArrowRight
        size={14}
        strokeWidth={2}
        className="shrink-0 transition-all group-hover:translate-x-0.5"
        style={{ color: 'var(--accent)' }}
      />
    </Link>
  )
}

function Cards({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
  )
}

Cards.Card = Card

export { Cards }

