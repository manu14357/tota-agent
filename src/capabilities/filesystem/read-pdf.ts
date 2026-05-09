import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, extname } from 'node:path';
import type { PermissionManager } from '../permissions.js';

export function createReadPdfTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description:
      'Read the text content of a PDF file. Returns extracted text, page count, and metadata. Use this when the user sends or references a .pdf file.',
    inputSchema: zodSchema(
      z.object({
        path: z.string().describe('Absolute or relative path to the PDF file'),
        pages: z
          .string()
          .optional()
          .describe(
            'Optional page range to extract, e.g. "1-3" or "2". Defaults to all pages.',
          ),
      }),
    ),
    execute: async ({ path, pages }) => {
      const resolved = isAbsolute(path) ? resolve(path) : resolve(getCwd(), path);

      const check = await permissions.checkFsAccess(resolved, 'read');
      if (!check.allowed) {
        const parentDir = resolve(resolved, '..');
        return `Error: Permission denied for read access to ${resolved}. Use the approve_scope tool with path="${parentDir}" and mode="read" to request access from the user.`;
      }

      if (!existsSync(resolved)) {
        return `Error: File not found: ${resolved}`;
      }

      const ext = extname(resolved).toLowerCase();
      if (ext !== '.pdf') {
        return `Error: File is not a PDF (extension: ${ext}). Use read_file for text files.`;
      }

      const stat = statSync(resolved);
      if (stat.size > 50 * 1024 * 1024) {
        return `Error: PDF too large (${Math.round(stat.size / (1024 * 1024))}MB). Maximum is 50MB.`;
      }

      try {
        // Dynamic import to avoid requiring pdf-parse at startup if not available
        const pdfParse = await import('pdf-parse' as string as any);
        const parseFn = pdfParse.default ?? pdfParse;

        const { readFileSync } = await import('node:fs');
        const dataBuffer = readFileSync(resolved);
        const data = await parseFn(dataBuffer);

        let text: string = data.text ?? '';

        // Apply page range filter if requested
        if (pages && text) {
          const totalPages = data.numpages as number;
          const range = parsePageRange(pages, totalPages);
          if (range) {
            // pdf-parse doesn't support per-page extraction natively;
            // we return a note and the full text (page filtering needs pdf.js)
            const note = `[Note: page-range filtering requested (${pages} of ${totalPages} pages). Full text returned — page boundaries may not be exact.]\n\n`;
            text = note + text;
          } else {
            return `Error: Invalid page range "${pages}". Use formats like "1", "1-3", or "2-5".`;
          }
        }

        const meta = data.info ?? {};
        const lines = [
          `PDF: ${resolved}`,
          `Pages: ${data.numpages}`,
          meta.Title ? `Title: ${meta.Title}` : null,
          meta.Author ? `Author: ${meta.Author}` : null,
          meta.Subject ? `Subject: ${meta.Subject}` : null,
          '',
          '--- Content ---',
          text.trim() || '(No extractable text — the PDF may be scanned/image-based)',
        ]
          .filter((l) => l !== null)
          .join('\n');

        return lines;
      } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
          return `Error: pdf-parse is not installed. Run: npm install pdf-parse`;
        }
        return `Error reading PDF: ${err.message}`;
      }
    },
  });
}

function parsePageRange(pages: string, total: number): { start: number; end: number } | null {
  const match = pages.trim().match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (start < 1 || end > total || start > end) return null;
  return { start, end };
}
