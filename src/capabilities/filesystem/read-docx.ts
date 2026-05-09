import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, extname } from 'node:path';
import type { PermissionManager } from '../permissions.js';

export function createReadDocxTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description:
      'Read the text content of a Word document (.docx). Returns extracted text with basic formatting. Use this when the user sends or references a .docx file.',
    inputSchema: zodSchema(
      z.object({
        path: z.string().describe('Absolute or relative path to the .docx file'),
        include_html: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, return HTML instead of plain text (preserves more formatting)'),
      }),
    ),
    execute: async ({ path, include_html = false }) => {
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
      if (ext !== '.docx' && ext !== '.doc') {
        return `Error: File is not a Word document (extension: ${ext}). Use read_file for text files.`;
      }
      if (ext === '.doc') {
        return `Error: Legacy .doc format is not supported. Please convert to .docx first.`;
      }

      const stat = statSync(resolved);
      if (stat.size > 50 * 1024 * 1024) {
        return `Error: File too large (${Math.round(stat.size / (1024 * 1024))}MB). Maximum is 50MB.`;
      }

      try {
        const mammoth = await import('mammoth').catch((e) => {
          throw new Error(`mammoth is not installed. Run: npm install mammoth\n${e.message}`);
        });

        const { readFileSync } = await import('node:fs');
        const buffer = readFileSync(resolved);

        let content: string;
        if (include_html) {
          const result = await mammoth.convertToHtml({ buffer });
          content = result.value;
          if (result.messages.length > 0) {
            const warnings = result.messages
              .filter((m: any) => m.type === 'warning')
              .map((m: any) => m.message)
              .join('; ');
            if (warnings) content = `[Warnings: ${warnings}]\n\n` + content;
          }
        } else {
          const result = await mammoth.extractRawText({ buffer });
          content = result.value;
        }

        if (!content.trim()) {
          return `Document appears to be empty or contains only images/tables that cannot be extracted.`;
        }

        return `File: ${resolved}\nFormat: Word document (.docx)\n\n--- Content ---\n${content.trim()}`;
      } catch (err: any) {
        if (err.message?.includes('mammoth is not installed')) return `Error: ${err.message}`;
        return `Error reading DOCX file: ${err.message}`;
      }
    },
  });
}
