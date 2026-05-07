'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, X, BookOpen, Terminal, Layers, Puzzle, Book, ChevronRight } from 'lucide-react'
import { NAV } from '@/lib/nav'
import type { NavSection } from '@/lib/nav'

const SECTION_ICONS: Record<string, React.ReactNode> = {
  'Getting Started': <BookOpen size={13} strokeWidth={2} />,
  'CLI Commands':    <Terminal size={13} strokeWidth={2} />,
  'Daemon Mode':     <Layers size={13} strokeWidth={2} />,
  'Integrations':    <Puzzle size={13} strokeWidth={2} />,
  'Reference':       <Book size={13} strokeWidth={2} />,
}

interface DocsSidebarProps {
  onNavigate?: () => void
}

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')

  function isActive(slug: string) {
    if (slug === '') return pathname === '/docs'
    return pathname === `/docs/${slug}`
  }

  // Filter NAV by search query
  const filtered: NavSection[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return NAV
    return NAV.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          section.title.toLowerCase().includes(q)
      ),
    })).filter((s) => s.items.length > 0)
  }, [query])

  function highlight(text: string) {
    if (!query.trim()) return text
    const q = query.trim()
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent-light)',
            borderRadius: '2px',
            padding: '0 1px',
          }}
        >
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <nav className="flex flex-col gap-5">
      {/* Search input */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <Search
          size={14}
          strokeWidth={2}
          style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-subtle)]"
          style={{ color: 'var(--fg)' }}
          aria-label="Search documentation"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="shrink-0 rounded transition-colors"
            style={{ color: 'var(--fg-subtle)' }}
            aria-label="Clear search"
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Nav sections */}
      {filtered.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--fg-subtle)' }}>
          No results for &ldquo;{query}&rdquo;
        </p>
      ) : (
        filtered.map((section) => (
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
                      className="group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-150"
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
                      <span>{highlight(item.title)}</span>
                      {active && (
                        <ChevronRight
                          size={12}
                          strokeWidth={2}
                          style={{ color: 'var(--accent)' }}
                        />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </nav>
  )
}

