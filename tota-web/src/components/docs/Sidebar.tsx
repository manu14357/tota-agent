'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Terminal, Layers, Puzzle, Book, Monitor, ChevronRight } from 'lucide-react'
import { NAV } from '@/lib/nav'

const SECTION_ICONS: Record<string, React.ReactNode> = {
  'Getting Started': <BookOpen size={13} strokeWidth={2} />,
  'CLI Commands':    <Terminal size={13} strokeWidth={2} />,
  'Daemon Mode':     <Layers size={13} strokeWidth={2} />,
  'Integrations':    <Puzzle size={13} strokeWidth={2} />,
  'Web UI':          <Monitor size={13} strokeWidth={2} />,
  'Reference':       <Book size={13} strokeWidth={2} />,
}

interface DocsSidebarProps {
  onNavigate?: () => void
}

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const pathname = usePathname()

  function isActive(slug: string) {
    if (slug === '') return pathname === '/docs'
    return pathname === `/docs/${slug}`
  }

  return (
    <nav className="flex flex-col gap-5">
      {/* Nav sections */}
      {NAV.map((section) => (
        <div key={section.title}>
          {/* Section heading */}
          <div
            className="flex items-center gap-1.5 mb-1.5 px-2"
            style={{ color: 'var(--fg-subtle)' }}
          >
            {SECTION_ICONS[section.title]}
            <span className="text-[11px] font-semibold uppercase tracking-widest">
              {section.title}
            </span>
          </div>

          {/* Items */}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const href = item.slug ? `/docs/${item.slug}` : '/docs'
              const active = isActive(item.slug)
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className="group flex flex-col rounded-lg px-3 py-2 text-sm transition-all duration-150"
                    style={
                      active
                        ? {
                            background: 'var(--accent-dim)',
                            color: 'var(--accent-light)',
                            fontWeight: 500,
                            border: '1px solid var(--border-hover)',
                          }
                        : {
                            color: 'var(--fg-muted)',
                            border: '1px solid transparent',
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = 'var(--surface)'
                        e.currentTarget.style.color = 'var(--fg)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--fg-muted)'
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{item.title}</span>
                      {active && (
                        <ChevronRight
                          size={12}
                          strokeWidth={2}
                          style={{ color: 'var(--accent)' }}
                        />
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

