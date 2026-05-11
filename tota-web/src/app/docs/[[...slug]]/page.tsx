import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Home } from 'lucide-react'
import { getDocContent, generateDocStaticParams } from '@/lib/docs'
import { getPageMeta } from '@/lib/nav'
import { createMdxComponents } from '@/components/mdx/index'
import { DocsToc, type TocItem } from '@/components/docs/Toc'
import { slugify } from '@/lib/slugify'

export function generateStaticParams() {
  return generateDocStaticParams()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug = [] } = await params
  const doc = getDocContent(slug)
  if (!doc) return {}
  return { title: doc.title }
}

function extractTocItems(content: string): TocItem[] {
  const items: TocItem[] = []
  const idCounts = new Map<string, number>()
  const lines = content.split('\n')
  let inCodeBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(##|###)\s+(.+)$/)
    if (!match) continue

    const level = match[1].length as 2 | 3
    let title = match[2].trim()
    title = title
      .replace(/\{#.*?\}\s*$/, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim()

    if (!title) continue
    const baseId = slugify(title)
    if (!baseId) continue
    const next = (idCounts.get(baseId) ?? 0) + 1
    idCounts.set(baseId, next)
    const id = next === 1 ? baseId : `${baseId}-${next}`
    if (!id) continue

    items.push({ id, title, level })
  }

  return items
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug = [] } = await params
  const doc = getDocContent(slug)
  if (!doc) notFound()

  const slugStr = slug.join('/')
  const { section, prev, next } = getPageMeta(slugStr)
  const tocItems = extractTocItems(doc.content)
  const mdxComponents = createMdxComponents()

  return (
    <div className="pb-16">
      <div className="grid grid-cols-12 gap-8 xl:gap-10">
        <div className="col-span-12 xl:col-span-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-6 text-xs" aria-label="Breadcrumb">
            <Link
              href="/docs"
              className="flex items-center gap-1 transition-colors"
              style={{ color: 'var(--fg-subtle)' }}
            >
              <Home size={11} strokeWidth={2} />
              Docs
            </Link>
            {section && (
              <>
                <ChevronRight size={11} style={{ color: 'var(--fg-subtle)' }} />
                <span style={{ color: 'var(--fg-subtle)' }}>{section.title}</span>
              </>
            )}
            {doc.title && (
              <>
                <ChevronRight size={11} style={{ color: 'var(--fg-subtle)' }} />
                <span style={{ color: 'var(--fg-muted)' }} className="font-medium">{doc.title}</span>
              </>
            )}
          </nav>

          {tocItems.length > 0 && (
            <div
              className="xl:hidden mb-6 pl-3 border-l-2"
              style={{ borderColor: 'var(--accent)' }}
            >
              <details>
                <summary
                  className="cursor-pointer text-sm font-semibold"
                  style={{ color: 'var(--fg)' }}
                >
                  On this page
                </summary>
                <DocsToc
                  items={tocItems}
                  showTitle={false}
                  className="mt-3"
                />
              </details>
            </div>
          )}

          {/* MDX Content */}
          <article className="max-w-none">
            <MDXRemote
              source={doc.content}
              components={mdxComponents}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                },
              }}
            />
          </article>

          {/* Divider */}
          <div className="mt-12 mb-8 border-t" style={{ borderColor: 'var(--border)' }} />

          {/* Prev / Next navigation */}
          <div className="grid grid-cols-2 gap-4">
            {prev ? (
              <Link
                href={prev.slug ? `/docs/${prev.slug}` : '/docs'}
                className="group flex flex-col gap-1 p-4 rounded-xl border transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--fg-subtle)' }}>
                  <ChevronLeft size={12} strokeWidth={2} />
                  Previous
                </span>
                <span className="text-sm font-semibold transition-colors" style={{ color: 'var(--fg-muted)' }}>
                  {prev.title}
                </span>
              </Link>
            ) : (
              <div />
            )}

            {next ? (
              <Link
                href={next.slug ? `/docs/${next.slug}` : '/docs'}
                className="group flex flex-col gap-1 p-4 rounded-xl border text-right transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="flex items-center justify-end gap-1 text-xs font-medium" style={{ color: 'var(--fg-subtle)' }}>
                  Next
                  <ChevronRight size={12} strokeWidth={2} />
                </span>
                <span className="text-sm font-semibold transition-colors" style={{ color: 'var(--fg-muted)' }}>
                  {next.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>

        {/* Right TOC */}
        {tocItems.length > 0 && (
          <aside className="hidden xl:block col-span-4">
            <div className="sticky top-24 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <DocsToc items={tocItems} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
