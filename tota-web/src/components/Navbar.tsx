'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Github, Package, Menu, X, BookOpen } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 border-b transition-colors duration-200"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 select-none">
          <Image
            src="/tota-agent.png"
            alt="tota logo"
            width={62}
            height={62}
            className="rounded-xl drop-shadow-sm"
            priority
          />
          <span
            className="font-bold text-xl tracking-tight"
            style={{
              background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            tota
          </span>
          <span
            className="hidden sm:inline text-xs px-1.5 py-0.5 rounded-md font-medium tracking-wide"
            style={{
              border: '1px solid var(--border-hover)',
              background: 'var(--accent-dim)',
              color: 'var(--accent-light)',
            }}
          >
            agent
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink href="/docs" icon={<BookOpen size={14} strokeWidth={2} />}>Docs</NavLink>
          <ExternalLink href="https://github.com/manu14357/tota-agent" icon={<Github size={14} strokeWidth={2} />}>GitHub</ExternalLink>
          <ExternalLink href="https://www.npmjs.com/package/@manu14357/tota-agent" icon={<Package size={14} strokeWidth={2} />}>npm</ExternalLink>
          <div className="ml-2 flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/docs/getting-started/installation"
              className="text-sm px-4 py-2 rounded-lg font-semibold text-white transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'var(--accent)' }}
            >
              Get Started
            </Link>
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle />
          <button
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--fg-muted)' }}
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="md:hidden border-t px-4 py-3 flex flex-col gap-1"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
        >
          <MobileLink href="/docs" onClick={() => setOpen(false)}>
            <BookOpen size={15} /> Docs
          </MobileLink>
          <a
            href="https://github.com/manu14357/tota-agent"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium"
            style={{ color: 'var(--fg-muted)' }}
          >
            <Github size={15} /> GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@manu14357/tota-agent"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium"
            style={{ color: 'var(--fg-muted)' }}
          >
            <Package size={15} /> npm
          </a>
          <div className="pt-2 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <Link
              href="/docs/getting-started/installation"
              className="flex justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
              onClick={() => setOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[var(--surface)]"
      style={{ color: 'var(--fg-muted)' }}
    >
      {icon}{children}
    </Link>
  )
}

function ExternalLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[var(--surface)]"
      style={{ color: 'var(--fg-muted)' }}
    >
      {icon}{children}
    </a>
  )
}

function MobileLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium"
      style={{ color: 'var(--fg-muted)' }}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
