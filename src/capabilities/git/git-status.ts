import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';

export function createGitStatusTool(getCwd: () => string) {
  return tool({
    description: 'Show the working tree status. Returns staged, unstaged, and untracked files.',
    inputSchema: zodSchema(z.object({
      path: z.string().optional().describe('Path to check (defaults to current directory)'),
    })),
    execute: async ({ path }) => {
      try {
        const args = path ? ['-C', path, 'status', '--porcelain'] : ['status', '--porcelain'];
        const result = execFileSync('git', args, { encoding: 'utf-8', timeout: 10000, cwd: getCwd() });
        if (!result.trim()) return 'Working tree clean — no changes.';
        return result.trim();
      } catch (err: any) {
        return `Error: ${err.stderr?.trim() || err.message}`;
      }
    },
  });
}