import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Home } from 'lucide-react'
import { getDocContent, generateDocStaticParams } from '@/lib/docs'
import { getPageMeta } from '@/lib/nav'
import { mdxComponents } from '@/components/mdx/index'

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

  return (
    <div className="max-w-3xl pb-16">
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

      {/* MDX Content */}
      <article>
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
  )
}
