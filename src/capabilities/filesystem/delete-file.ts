import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, unlinkSync, realpathSync, statSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { PermissionManager } from '../permissions.js';

export function createDeleteFileTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description: 'Delete a file. This action cannot be undone. The path must be within a writable scope. Always asks for confirmation.',
    inputSchema: zodSchema(z.object({
      path: z.string().describe('Absolute or relative path to the file to delete'),
    })),
    execute: async ({ path }) => {
      const resolved = isAbsolute(path) ? resolve(path) : resolve(getCwd(), path);
      const check = await permissions.checkFsAccess(resolved, 'write');
      if (!check.allowed) {
        const parentDir = resolve(resolved, '..');
        return `Error: Permission denied for write access to ${resolved}. Use the approve_scope tool with path="${parentDir}" and mode="write" to request access from the user.`;
      }

      if (!existsSync(resolved)) {
        return `Error: File not found: ${resolved}`;
      }

      // C5: Re-validate symlink target. Without this, `ln -s /etc/passwd /tmp/p`
      // followed by `delete_file(/tmp/p)` would erase the real file.
      let realPath: string;
      try {
        realPath = realpathSync(resolved);
      } catch {
        return `Error: File not found: ${resolved}`;
      }
      if (realPath !== resolved) {
        const recheck = await permissions.checkFsAccess(realPath, 'write');
        if (!recheck.allowed) {
          return `Error: Permission denied — symlink target ${realPath} is outside the allowed scope.`;
        }
      }

      try {
        const stat = statSync(realPath);
        if (stat.isDirectory()) {
          return `Error: ${realPath} is a directory. Cannot delete directories for safety.`;
        }
        unlinkSync(realPath);
        return `Successfully deleted ${resolved}`;
      } catch (err: any) {
        return `Error deleting file: ${err.message}`;
      }
    },
  });
}