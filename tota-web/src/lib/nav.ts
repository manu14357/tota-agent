export interface NavItem {
  title: string
  slug: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', slug: '' },
      { title: 'Installation', slug: 'getting-started/installation' },
      { title: 'First-Time Setup', slug: 'getting-started/setup' },
      { title: 'Starting tota', slug: 'getting-started/starting' },
    ],
  },
  {
    title: 'CLI Commands',
    items: [
      { title: 'Full Command Reference', slug: 'cli-commands/commands' },
      { title: 'Doctor (Reconfigure)', slug: 'cli-commands/doctor' },
      { title: 'In-Chat Commands', slug: 'cli-commands/in-chat-commands' },
    ],
  },
  {
    title: 'Daemon Mode',
    items: [
      { title: 'Daemon Mode', slug: 'daemon-mode/background-mode' },
      { title: 'Platform Guide', slug: 'daemon-mode/platform-guide' },
      { title: 'System Service', slug: 'daemon-mode/system-service' },
    ],
  },
  {
    title: 'Integrations',
    items: [
      { title: 'GitHub Companion', slug: 'integrations/github-companion' },
      { title: 'Telegram', slug: 'integrations/telegram' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Built-in Tools', slug: 'reference/built-in-tools' },
      { title: 'Configuration', slug: 'reference/configuration' },
      { title: 'Permissions', slug: 'reference/permissions' },
      { title: 'Provider Fallback', slug: 'reference/provider-fallback' },
      { title: 'Scheduling', slug: 'reference/scheduling' },
      { title: 'Second Brain', slug: 'reference/second-brain' },
      { title: 'Skills', slug: 'reference/skills' },
    ],
  },
]

export interface PageMeta {
  section: NavSection | null
  item: NavItem | null
  prev: NavItem | null
  next: NavItem | null
}

/** Returns current section + item + adjacent pages for a given slug string */
export function getPageMeta(slug: string): PageMeta {
  const all: NavItem[] = NAV.flatMap((s) => s.items)
  const idx = all.findIndex((item) => item.slug === slug)
  const section = NAV.find((s) => s.items.some((i) => i.slug === slug)) ?? null
  return {
    section,
    item: idx >= 0 ? all[idx] : null,
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null,
  }
}
