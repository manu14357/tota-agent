import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { PermissionManager } from '../permissions.js';

export function createReadFileTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description: 'Read the contents of a file. The path must be within an allowed scope.',
    inputSchema: zodSchema(z.object({
      path: z.string().describe('Absolute or relative path to the file'),
    })),
    execute: async ({ path }) => {
      const resolved = isAbsolute(path) ? resolve(path) : resolve(getCwd(), path);
      const check = await permissions.checkFsAccess(resolved, 'read');
      if (!check.allowed) {
        const parentDir = resolve(resolved, '..');
        return `Error: Permission denied for read access to ${resolved}. Use the approve_scope tool with path="${parentDir}" and mode="read" to request access from the user.`;
      }

      if (!existsSync(resolved)) {
        return `Error: File not found: ${resolved}`;
      }

      // Resolve symlinks and re-validate real path to prevent TOCTOU symlink attacks
      let realPath: string;
      try {
        realPath = realpathSync(resolved);
      } catch {
        return `Error: File not found: ${resolved}`;
      }
      if (realPath !== resolved) {
        const recheck = await permissions.checkFsAccess(realPath, 'read');
        if (!recheck.allowed) {
          return `Error: Permission denied — symlink target is outside the allowed scope.`;
        }
      }

      try {
        const stat = await import('node:fs').then(m => m.statSync(realPath));
        if (stat.isDirectory()) {
          return `Error: ${resolved} is a directory, not a file. Use list_dir instead.`;
        }
        if (stat.size > 1024 * 1024) {
          return `Error: File too large (${Math.round(stat.size / 1024)}KB). Maximum is 1MB.`;
        }
        return readFileSync(realPath, 'utf-8');
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }
    },
  });
}