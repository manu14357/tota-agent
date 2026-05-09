import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import type { PermissionManager } from '../permissions.js';

const MAX_RESULTS = 100;
const MAX_SEARCH_DEPTH = 10;
const MAX_CONTENT_SCAN_SIZE = 1024 * 1024; // 1MB — skip binary/large files for content search

export function createFindFilesTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description:
      'Find files in a directory tree by name pattern (glob-style), content keyword, file type, or modification date. Use this to locate files the user is asking about, e.g. "find my project file", "find all PDFs", "find files containing X".',
    inputSchema: zodSchema(
      z.object({
        directory: z
          .string()
          .optional()
          .describe('Directory to search in. Defaults to current working directory.'),
        name_pattern: z
          .string()
          .optional()
          .describe(
            'File name pattern to match. Supports wildcards: * matches any chars, ? matches one char. Example: "*.pdf", "report*", "project?.txt"',
          ),
        content_keyword: z
          .string()
          .optional()
          .describe(
            'Search for files containing this keyword/phrase in their text content. Case-insensitive. Only scans text files up to 1MB.',
          ),
        file_type: z
          .string()
          .optional()
          .describe(
            'Filter by file extension (without dot). Example: "pdf", "xlsx", "ts", "md".',
          ),
        modified_after: z
          .string()
          .optional()
          .describe(
            'Only return files modified after this date. ISO format: "2026-01-01" or "2026-01-01T12:00:00Z".',
          ),
        modified_before: z
          .string()
          .optional()
          .describe('Only return files modified before this date. ISO format.'),
        max_size_kb: z
          .number()
          .optional()
          .describe('Only return files smaller than this size in KB.'),
        min_size_kb: z
          .number()
          .optional()
          .describe('Only return files larger than this size in KB.'),
        max_depth: z
          .number()
          .optional()
          .default(6)
          .describe('Maximum directory depth to recurse into. Default is 6.'),
        max_results: z
          .number()
          .optional()
          .default(50)
          .describe('Maximum number of results to return. Default is 50, max is 100.'),
      }),
    ),
    execute: async ({
      directory,
      name_pattern,
      content_keyword,
      file_type,
      modified_after,
      modified_before,
      max_size_kb,
      min_size_kb,
      max_depth = 6,
      max_results = 50,
    }) => {
      const searchDir = directory
        ? path.isAbsolute(directory)
          ? path.resolve(directory)
          : path.resolve(getCwd(), directory)
        : getCwd();

      const check = await permissions.checkFsAccess(searchDir, 'read');
      if (!check.allowed) {
        return `Error: Permission denied for read access to ${searchDir}. Use the approve_scope tool with path="${searchDir}" and mode="read" to request access.`;
      }

      if (!fs.existsSync(searchDir)) {
        return `Error: Directory not found: ${searchDir}`;
      }

      if (!fs.statSync(searchDir).isDirectory()) {
        return `Error: ${searchDir} is not a directory.`;
      }

      // Validate filters
      const afterDate = modified_after ? new Date(modified_after) : null;
      const beforeDate = modified_before ? new Date(modified_before) : null;
      if (modified_after && afterDate && isNaN(afterDate.getTime())) {
        return `Error: Invalid modified_after date: "${modified_after}"`;
      }
      if (modified_before && beforeDate && isNaN(beforeDate.getTime())) {
        return `Error: Invalid modified_before date: "${modified_before}"`;
      }

      const effectiveMaxResults = Math.min(max_results, MAX_RESULTS);
      const effectiveMaxDepth = Math.min(max_depth, MAX_SEARCH_DEPTH);

      const results: FileResult[] = [];

      // Compile name pattern to regex
      const nameRegex = name_pattern ? globToRegex(name_pattern) : null;
      const typeExt = file_type ? `.${file_type.replace(/^\./, '').toLowerCase()}` : null;
      const keyword = content_keyword?.toLowerCase() ?? null;

      await walkDir(searchDir, 0, effectiveMaxDepth, async (filePath, stat) => {
        if (results.length >= effectiveMaxResults) return false; // signal stop

        const filename = path.basename(filePath);
        const fileExt = path.extname(filename).toLowerCase();

        // Name pattern filter
        if (nameRegex && !nameRegex.test(filename)) return true;

        // Extension filter
        if (typeExt && fileExt !== typeExt) return true;

        // Date filters
        if (afterDate && stat.mtime < afterDate) return true;
        if (beforeDate && stat.mtime > beforeDate) return true;

        // Size filters
        const sizeKb = stat.size / 1024;
        if (max_size_kb !== undefined && sizeKb > max_size_kb) return true;
        if (min_size_kb !== undefined && sizeKb < min_size_kb) return true;

        // Content search
        if (keyword) {
          if (!isTextFile(fileExt)) return true;
          if (stat.size > MAX_CONTENT_SCAN_SIZE) return true;
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (!content.toLowerCase().includes(keyword)) return true;
          } catch {
            return true; // unreadable
          }
        }

        results.push({
          path: filePath,
          name: filename,
          size: stat.size,
          modified: stat.mtime,
        });

        return true;
      });

      if (results.length === 0) {
        const filters: string[] = [];
        if (name_pattern) filters.push(`name: "${name_pattern}"`);
        if (content_keyword) filters.push(`containing: "${content_keyword}"`);
        if (file_type) filters.push(`type: .${file_type}`);
        return `No files found in ${searchDir}${filters.length ? ` matching [${filters.join(', ')}]` : ''}.`;
      }

      const lines: string[] = [
        `Found ${results.length} file${results.length !== 1 ? 's' : ''} in ${searchDir}`,
        results.length >= effectiveMaxResults
          ? `(showing first ${effectiveMaxResults} — refine search to narrow results)`
          : '',
        '',
      ].filter(Boolean);

      for (const r of results) {
        const rel = path.relative(searchDir, r.path);
        const sizeStr =
          r.size > 1024 * 1024
            ? `${(r.size / (1024 * 1024)).toFixed(1)}MB`
            : r.size > 1024
              ? `${Math.round(r.size / 1024)}KB`
              : `${r.size}B`;
        const modStr = r.modified.toISOString().slice(0, 16).replace('T', ' ');
        lines.push(`  ${rel}  (${sizeStr}, modified ${modStr})`);
        lines.push(`  → ${r.path}`);
      }

      return lines.join('\n');
    },
  });
}

interface FileResult {
  path: string;
  name: string;
  size: number;
  modified: Date;
}

/** Walk directory tree, calling callback for each file. Return false from callback to stop. */
async function walkDir(
  dir: string,
  depth: number,
  maxDepth: number,
  callback: (filePath: string, stat: fs.Stats) => Promise<boolean>,
): Promise<boolean> {
  if (depth > maxDepth) return true;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true; // unreadable directory
  }

  // Sort: files first, then dirs (so we find files close to root first)
  entries.sort((a, b) => {
    if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
    return a.isDirectory() ? 1 : -1;
  });

  for (const entry of entries) {
    // Skip hidden dirs and common noise
    if (entry.name.startsWith('.') && entry.name !== '.tota') continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) continue; // skip symlinks for safety

    if (entry.isDirectory()) {
      const cont = await walkDir(fullPath, depth + 1, maxDepth, callback);
      if (!cont) return false;
    } else if (entry.isFile()) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      const cont = await callback(fullPath, stat);
      if (!cont) return false;
    }
  }

  return true;
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.cache',
  'vendor',
  'target',
  '.venv',
  'venv',
]);

const TEXT_EXTS = new Set([
  '.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.sh', '.zsh', '.bash',
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.xml', '.svg',
  '.log', '.env', '.gitignore', '.editorconfig', '.sql',
]);

function isTextFile(ext: string): boolean {
  return TEXT_EXTS.has(ext);
}

/** Convert glob pattern (*, ?) to RegExp */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/\*/g, '.*') // * → .*
    .replace(/\?/g, '.'); // ? → .
  return new RegExp(`^${escaped}$`, 'i');
}
