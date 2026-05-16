import type { Metadata } from 'next'
import { DM_Sans, Fragment_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/ThemeProvider'
import { SITE_URL } from '@/config/site'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  variable: '--font-fragment-mono',
  weight: '400',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'tota — Soul-driven AI agent',
    template: '%s | tota',
  },
  description:
    'AI agent built for control: permissioned tools, safe execution, token budgets, and multi-channel access. Remembers what matters. Asks before it acts. Runs 24/7 from CLI or Telegram.',
  keywords: [
    'ai agent',
    'cli agent',
    'telegram bot',
    'second brain',
    'permission hardened',
    'soul driven',
    'deepseek',
    'openai',
    'anthropic',
    'ollama',
    'token budget',
    'daemon mode',
  ],
  authors: [{ name: 'manu14357', url: 'https://github.com/manu14357' }],
  creator: 'manu14357',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'tota',
    title: 'tota — Soul-driven AI agent',
    description:
      'AI agent built for control: permissioned tools, safe execution. SQLite Second Brain. 9 AI providers with fallback. Runs 24/7 from CLI or Telegram.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'tota — Soul-driven AI agent',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'tota — Soul-driven AI agent',
    description:
      'AI agent built for control: permissioned tools, safe execution. SQLite Second Brain. 9 AI providers with fallback. Runs 24/7 from CLI or Telegram.',
    images: ['/og.png'],
    creator: '@manu14357',
  },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', type: 'image/png' },
    ],
    shortcut: '/icon.png',
  },
  manifest: '/site.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fragmentMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
