'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ThemeToggleProps {
  className?: string
  size?: number
}

export function ThemeToggle({ className = '', size = 16 }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="w-8 h-8 rounded-lg" aria-hidden />
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={[
        'inline-flex items-center justify-center w-8 h-8 rounded-lg',
        'transition-all duration-200',
        'text-[var(--fg-muted)] hover:text-[var(--fg)]',
        'bg-transparent hover:bg-[var(--surface)]',
        'border border-transparent hover:border-[var(--border)]',
        className,
      ].join(' ')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun size={size} strokeWidth={1.8} />
      ) : (
        <Moon size={size} strokeWidth={1.8} />
      )}
    </button>
  )
}
