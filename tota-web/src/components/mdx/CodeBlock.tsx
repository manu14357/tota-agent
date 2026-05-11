'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { isValidElement } from 'react'
import { Copy, Check } from 'lucide-react'

interface CodeBlockProps {
  children: ReactNode
  text?: string
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>
    return extractText(element.props.children)
  }
  return ''
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function CodeBlock({ children, text }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const codeText = useMemo(() => {
    const raw = text ?? extractText(children)
    return raw.replace(/^\n+/, '').replace(/\n+$/, '')
  }, [children, text])

  const handleCopy = useCallback(async () => {
    if (!codeText) return
    await copyToClipboard(codeText)
    setCopied(true)
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setCopied(false), 1400)
  }, [codeText])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div className="relative my-5 group">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: copied ? 'var(--fg)' : 'var(--fg-muted)',
        }}
        aria-label="Copy code to clipboard"
      >
        {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre
        className="rounded-xl p-3 sm:p-5 overflow-x-auto text-[13px] sm:text-sm font-mono leading-6 border"
        style={{
          background: 'var(--code-bg)',
          borderColor: 'var(--code-border)',
          color: 'var(--fg-muted)',
        }}
      >
        {children}
      </pre>
    </div>
  )
}
