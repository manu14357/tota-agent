'use client'

import { useEffect, useMemo, useState } from 'react'

export interface TocItem {
  id: string
  title: string
  level: 2 | 3
}

export function DocsToc({
  items,
  className,
  showTitle = true,
}: {
  items: TocItem[]
  className?: string
  showTitle?: boolean
}) {
  const filtered = useMemo(
    () => items.filter((item) => item.id && item.title),
    [items]
  )
  const [activeId, setActiveId] = useState<string | null>(
    filtered[0]?.id ?? null
  )

  useEffect(() => {
    setActiveId(filtered[0]?.id ?? null)
  }, [filtered])

  useEffect(() => {
    if (filtered.length === 0) return

    const targets = filtered
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el))

    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          )
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      {
        rootMargin: '0px 0px -70% 0px',
        threshold: [0, 1],
      }
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [filtered])

  if (filtered.length === 0) return null

  const containerClass = ['docs-toc', className].filter(Boolean).join(' ')

  return (
    <div className={containerClass}>
      {showTitle && (
        <div
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--fg-subtle)' }}
        >
          On this page
        </div>
      )}
      <ul className="mt-3 space-y-2 text-sm">
        {filtered.map((item) => {
          const isActive = item.id === activeId
          return (
            <li key={item.id} className={item.level === 3 ? 'pl-3' : ''}>
              <a
                href={`#${item.id}`}
                onClick={() => setActiveId(item.id)}
                className="transition-colors"
                style={{
                  color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.title}
              </a>
            </li>
          )}
        )}
      </ul>
    </div>
  )
}
