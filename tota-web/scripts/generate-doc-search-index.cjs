const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const CONTENT_DIR = path.join(__dirname, '..', 'content')
const OUT_FILE = path.join(__dirname, '..', 'public', 'docs-search-index.json')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return walk(fullPath)
    }
    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      return [fullPath]
    }
    return []
  })
}

const files = walk(CONTENT_DIR)
const docs = files.map((filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  const relPath = path.relative(CONTENT_DIR, filePath).replace(/\\/g, '/')
  const slug = relPath === 'index.mdx' ? '' : relPath.replace(/\.mdx$/, '')
  return {
    slug,
    title: data.title || (slug === '' ? 'Documentation' : slug.split('/').slice(-1)[0]),
    content: content.replace(/\s+/g, ' ').trim(),
  }
})

const outDir = path.dirname(OUT_FILE)
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

fs.writeFileSync(OUT_FILE, JSON.stringify(docs, null, 2) + '\n', 'utf8')
console.log(`Generated ${docs.length} docs entries in ${OUT_FILE}`)
