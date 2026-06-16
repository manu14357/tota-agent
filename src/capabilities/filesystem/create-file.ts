import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import type { PermissionManager } from '../permissions.js';

export function createCreateFileTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description: 'Create a new file with the given content. Also creates parent directories if needed. The path must be within a writable scope.',
    inputSchema: zodSchema(z.object({
      path: z.string().describe('Absolute or relative path for the new file'),
      content: z.string().describe('The content of the new file'),
    })),
    execute: async ({ path, content }) => {
      const resolved = isAbsolute(path) ? resolve(path) : resolve(getCwd(), path);
      const check = await permissions.checkFsAccess(resolved, 'write');
      if (!check.allowed) {
        const parentDir = resolve(resolved, '..');
        return `Error: Permission denied for write access to ${resolved}. Use the approve_scope tool with path="${parentDir}" and mode="write" to request access from the user.`;
      }

      if (existsSync(resolved)) {
        return `Error: File already exists: ${resolved}. Use write_file to modify existing files.`;
      }

      // C5: Validate that the parent directory is not a symlink to an
      // out-of-scope location. Without this, a user could `ln -s /etc /tmp/etc`
      // and the LLM would happily `create_file` through that symlink.
      const parentDir = dirname(resolved);
      let realParent: string;
      try {
        realParent = realpathSync(parentDir);
      } catch {
        return `Error: Parent directory does not exist: ${parentDir}`;
      }
      if (realParent !== parentDir) {
        const recheck = await permissions.checkFsAccess(realParent, 'write');
        if (!recheck.allowed) {
          return `Error: Permission denied — parent directory resolves via symlink to ${realParent} which is outside the allowed scope.`;
        }
      }

      try {
        if (!existsSync(realParent)) {
          mkdirSync(realParent, { recursive: true });
        }
        writeFileSync(resolved, content, 'utf-8');
        return `Successfully created ${resolved} (${content.length} bytes)`;
      } catch (err: any) {
        return `Error creating file: ${err.message}`;
      }
    },
  });
}