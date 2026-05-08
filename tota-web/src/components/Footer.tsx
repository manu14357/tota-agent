'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Github } from 'lucide-react'

interface FooterLink {
  label: string
  href: string
  external?: boolean
}

interface FooterGroup {
  heading: string
  items: FooterLink[]
}

const links: FooterGroup[] = [
  {
    heading: 'Documentation',
    items: [
      { label: 'Installation', href: '/docs/getting-started/installation' },
      { label: 'First-Time Setup', href: '/docs/getting-started/setup' },
      { label: 'CLI Commands', href: '/docs/cli-commands/commands' },
      { label: 'Daemon Mode', href: '/docs/daemon-mode/background-mode' },
    ],
  },
  {
    heading: 'Integrations',
    items: [
      { label: 'GitHub Companion', href: '/docs/integrations/github-companion' },
      { label: 'Telegram', href: '/docs/integrations/telegram' },
    ],
  },
  {
    heading: 'Reference',
    items: [
      { label: 'Built-in Tools', href: '/docs/reference/built-in-tools' },
      { label: 'Second Brain', href: '/docs/reference/second-brain' },
      { label: 'Provider Fallback', href: '/docs/reference/provider-fallback' },
      { label: 'Permissions', href: '/docs/reference/permissions' },
      { label: 'Skills', href: '/docs/reference/skills' },
      { label: 'Scheduling', href: '/docs/reference/scheduling' },
    ],
  },
  {
    heading: 'Project',
    items: [
      { label: 'GitHub', href: 'https://github.com/manu14357/tota-agent', external: true },
      { label: 'npm', href: 'https://www.npmjs.com/package/tota-agent', external: true },
      { label: 'MIT License', href: 'https://github.com/manu14357/tota-agent/blob/main/LICENSE', external: true },
      { label: 'Changelog', href: 'https://github.com/manu14357/tota-agent/blob/main/CHANGELOG.md', external: true },
    ],
  },
]

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 mb-10 sm:mb-12">
          {links.map((group) => (
            <div key={group.heading}>
              <h4
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: 'var(--fg-subtle)' }}
              >
                {group.heading}
              </h4>
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm transition-colors"
                        style={{ color: 'var(--fg-muted)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-muted)' }}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-sm transition-colors"
                        style={{ color: 'var(--fg-muted)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-muted)' }}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image src="/tota-agent.png" alt="tota" width={36} height={36} className="rounded-md" />
            <span
              className="font-bold text-base sm:text-lg tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #89CFF3 0%, #00A9FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              tota
            </span>
            <span className="hidden sm:inline text-sm" style={{ color: 'var(--fg-subtle)' }}>
              · Soul-driven AI agent
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
              MIT License · © {new Date().getFullYear()}{' '}
              <a
                href="https://github.com/manu14357"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:underline"
                style={{ color: 'var(--fg-muted)' }}
              >
                manu14357
              </a>
            </span>
            <a
              href="https://github.com/manu14357/tota-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors"
              style={{ color: 'var(--fg-subtle)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-subtle)' }}
              aria-label="GitHub"
            >
              <Github size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}



