'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'

interface DocSearchEntry {
  slug: string
  title: string
  content: string
}

interface SearchResultsProps {
  query: string
  searchIndex: DocSearchEntry[]
  onNavigate?: () => void
}

function highlight(text: string, query: string) {
  const normalized = query.trim()
  if (!normalized) return text
  const idx = text.toLowerCase().indexOf(normalized.toLowerCase())
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
        {text.slice(idx, idx + normalized.length)}
      </mark>
      {text.slice(idx + normalized.length)}
    </>
  )
}

export function SearchResults({ query, searchIndex, onNavigate }: SearchResultsProps) {
  const q = query.trim().toLowerCase()
  interface SearchResultEntry extends DocSearchEntry {
    snippet: string
    score: number
  }

  const results = searchIndex
    .map((entry): SearchResultEntry | null => {
      const titleMatch = entry.title.toLowerCase().includes(q)
      const contentMatchIndex = entry.content.toLowerCase().indexOf(q)
      if (!titleMatch && contentMatchIndex === -1) return null
      const snippet = contentMatchIndex === -1
        ? entry.content.slice(0, 160).trim()
        : entry.content.slice(Math.max(0, contentMatchIndex - 40), Math.min(entry.content.length, contentMatchIndex + q.length + 80)).trim()
      return {
        ...entry,
        snippet: snippet.replace(/\s+/g, ' '),
        score: titleMatch ? 0 : contentMatchIndex,
      }
    })
    .filter((entry): entry is SearchResultEntry => entry !== null)
    .sort((a, b) => a.score - b.score)

  return (
    <div className="pb-16">
      <div className="mb-8 rounded-2xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3 mb-4">
          <Search size={18} strokeWidth={2} style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
              Search results for “{query}”
            </p>
            <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
              Showing matches from page titles and content.
            </p>
          </div>
        </div>

        {results.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
            No docs pages matched your query.
          </p>
        ) : (
          <div className="space-y-4">
            {results.map((entry) => (
              <Link
                key={entry.slug}
                href={entry.slug ? `/docs/${entry.slug}` : '/docs'}
                onClick={onNavigate}
                className="block rounded-xl border p-4 transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--fg-muted)' }}>
                  {highlight(entry.title, query)}
                </p>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--fg-subtle)' }}>
                  {highlight(entry.snippet, query)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
