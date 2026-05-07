import type { MetadataRoute } from 'next'
import { SITE_URL as BASE } from '@/config/site'

const docPages = [
  '/docs',
  '/docs/getting-started/installation',
  '/docs/getting-started/setup',
  '/docs/getting-started/starting',
  '/docs/cli-commands/commands',
  '/docs/cli-commands/doctor',
  '/docs/cli-commands/in-chat-commands',
  '/docs/daemon-mode/background-mode',
  '/docs/daemon-mode/platform-guide',
  '/docs/daemon-mode/system-service',
  '/docs/integrations/github-companion',
  '/docs/integrations/telegram',
  '/docs/reference/built-in-tools',
  '/docs/reference/configuration',
  '/docs/reference/permissions',
  '/docs/reference/provider-fallback',
  '/docs/reference/scheduling',
  '/docs/reference/second-brain',
  '/docs/reference/skills',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const landing: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]

  const docs: MetadataRoute.Sitemap = docPages.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: path === '/docs' ? 0.9 : 0.7,
  }))

  return [...landing, ...docs]
}
