'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Github, Menu, X, ChevronLeft, Search } from 'lucide-react'
import { DocsSidebar } from '@/components/docs/Sidebar'
import { SearchResults } from '@/components/docs/SearchResults'
import { ThemeToggle } from '@/components/ThemeToggle'

interface DocSearchEntry {
  slug: string
  title: string
  content: string
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState<DocSearchEntry[]>([])
  const pathname = usePathname()

  useEffect(() => {
    fetch('/docs-search-index.json')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setSearchIndex(data ?? []))
      .catch(() => setSearchIndex([]))
  }, [])

  // Close sidebar on resize to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Prevent body scroll when mobile sidebar open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Clear search when navigating to a page
  useEffect(() => {
    setSearchQuery('')
  }, [pathname])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ── Docs Header ── */}
      <header
        className="sticky top-0 z-50 border-b transition-colors duration-200"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--bg) 90%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-[1560px] mx-auto px-3 sm:px-5 lg:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--fg-muted)' }}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>

            <Link href="/" className="flex items-center gap-2 select-none group">
              <ChevronLeft
                size={14}
                className="hidden md:block transition-transform group-hover:-translate-x-0.5"
                style={{ color: 'var(--fg-subtle)' }}
              />
              <Image
                src="/tota-agent.png"
                alt="tota"
                width={64}
                height={64}
                className="rounded-lg"
              />
              <span
                className="font-bold text-base tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                tota
              </span>
            </Link>

            <span style={{ color: 'var(--border)', fontSize: '1rem', lineHeight: 1 }}>/</span>

            <Link href="/docs">
              <span
                className="text-sm font-medium px-2 py-0.5 rounded-md"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent-light)',
                  border: '1px solid var(--border-hover)',
                }}
              >
                docs
              </span>
            </Link>
          </div>

          {/* Center: header search */}
          <div className="hidden md:flex flex-1 items-center justify-center px-4">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm w-full max-w-lg transition-all"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <Search size={14} strokeWidth={2} style={{ color: 'var(--fg-subtle)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search docs…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-subtle)]"
                style={{ color: 'var(--fg)' }}
                aria-label="Search documentation"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="shrink-0 rounded transition-colors"
                  style={{ color: 'var(--fg-subtle)' }}
                  aria-label="Clear search"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>

          {/* Right: GitHub + theme toggle */}
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/manu14357/tota-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ color: 'var(--fg-muted)', border: '1px solid var(--border)' }}
            >
              <Github size={13} strokeWidth={2} />
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="max-w-[1560px] mx-auto px-3 sm:px-5 lg:px-6">
        <div className="flex gap-0">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-60 lg:w-72 shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto py-6 pr-4">
            <DocsSidebar onNavigate={() => setSearchQuery('')} />
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0 py-8 md:pl-6 md:border-l" style={{ borderColor: 'var(--border)' }}>
            {searchQuery ? (
              <SearchResults
                query={searchQuery}
                searchIndex={searchIndex}
                onNavigate={() => setSearchQuery('')}
              />
            ) : (
              children
            )}
          </main>
        </div>
      </div>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
          <div
            className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto shadow-2xl md:hidden flex flex-col"
            style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-4 h-14 border-b shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <Link href="/docs" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
                <Image src="/tota-agent.png" alt="tota" width={22} height={22} className="rounded-lg" />
                <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>tota docs</span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--fg-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 px-4 py-4">
              <DocsSidebar
                onNavigate={() => {
                  setSearchQuery('')
                  setSidebarOpen(false)
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
