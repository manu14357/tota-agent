import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { NAV } from './nav'

export { NAV } from './nav'

const CONTENT_DIR = path.join(process.cwd(), 'content')

export interface DocContent {
  content: string
  title: string
}

export function getDocContent(slug: string[]): DocContent | null {
  let filePath =
    slug.length === 0
      ? path.join(CONTENT_DIR, 'index.mdx')
      : path.join(CONTENT_DIR, ...slug) + '.mdx'

  if (!fs.existsSync(filePath)) {
    const indexPath = path.join(CONTENT_DIR, ...slug, 'index.mdx')
    if (!fs.existsSync(indexPath)) return null
    filePath = indexPath
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  return { content, title: data.title || '' }
}

export function generateDocStaticParams(): { slug: string[] }[] {
  const params: { slug: string[] }[] = [{ slug: [] }]

  for (const section of NAV) {
    for (const item of section.items) {
      if (item.slug) {
        params.push({ slug: item.slug.split('/') })
      }
    }
  }

  return params
}
