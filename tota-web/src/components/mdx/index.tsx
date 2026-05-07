import type { MDXComponents } from 'mdx/types'
import { Callout } from './Callout'
import { Tabs } from './Tabs'
import { Cards } from './Cards'

// Shared inline-style helpers
const fg = { color: 'var(--fg)' }
const fgMuted = { color: 'var(--fg-muted)' }
const border = { borderColor: 'var(--border)' }
const surface = { background: 'var(--surface)' }

export const mdxComponents: MDXComponents = {
  // Custom components
  Callout,
  Tabs,
  'Tabs.Tab': Tabs.Tab,
  Tab: Tabs.Tab,
  Cards,
  'Cards.Card': Cards.Card,

  // ── Headings ──
  h1: ({ children }) => (
    <h1
      className="text-3xl sm:text-4xl font-bold tracking-tight mt-0 mb-6 leading-tight"
      style={fg}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      className="text-2xl font-semibold mt-12 mb-4 pb-3 border-b"
      style={{ ...fg, ...border }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold mt-8 mb-3" style={fg}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold mt-6 mb-2" style={{ color: 'var(--fg-muted)' }}>
      {children}
    </h4>
  ),

  // ── Prose ──
  p: ({ children }) => (
    <p className="leading-7 mb-5 text-base" style={fgMuted}>
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium underline underline-offset-2 decoration-1 transition-opacity hover:opacity-80"
      style={{ color: 'var(--accent-light)' }}
      {...(href?.startsWith('http')
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold" style={fg}>
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic" style={fgMuted}>
      {children}
    </em>
  ),

  // ── Code ──
  code: ({ children, className }) => {
    if (className) {
      // Inside a <pre> block — let pre handle styling
      return (
        <code className={`${className} text-sm font-mono`} style={{ color: 'var(--fg-muted)' }}>
          {children}
        </code>
      )
    }
    // Inline code
    return (
      <code
        className="rounded-md px-1.5 py-0.5 text-[0.85em] font-mono"
        style={{
          background: 'var(--code-bg)',
          border: '1px solid var(--code-border)',
          color: 'var(--accent-light)',
        }}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <div className="relative my-5 group">
      <pre
        className="rounded-xl p-5 overflow-x-auto text-sm font-mono leading-6 border"
        style={{
          background: 'var(--code-bg)',
          borderColor: 'var(--code-border)',
          color: 'var(--fg-muted)',
        }}
      >
        {children}
      </pre>
    </div>
  ),

  // ── Lists ──
  ul: ({ children }) => (
    <ul className="list-disc list-outside ml-5 space-y-2 mb-5 text-base" style={fgMuted}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside ml-5 space-y-2 mb-5 text-base" style={fgMuted}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7 pl-0.5">{children}</li>,

  // ── Blockquote ──
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-4 pl-5 pr-3 py-1 my-5 rounded-r-lg text-base italic"
      style={{
        borderColor: 'var(--accent)',
        background: 'var(--accent-dim)',
        color: 'var(--fg-muted)',
      }}
    >
      {children}
    </blockquote>
  ),

  // ── Table ──
  table: ({ children }) => (
    <div
      className="overflow-x-auto my-6 rounded-xl border text-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'var(--surface)' }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr
      className="border-b transition-colors mdx-tr"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th
      className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider"
      style={{ color: 'var(--fg-subtle)' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="py-3 px-4 align-top leading-6" style={fgMuted}>
      {children}
    </td>
  ),

  // ── Divider ──
  hr: () => (
    <hr className="my-8" style={{ borderColor: 'var(--border)' }} />
  ),
}

