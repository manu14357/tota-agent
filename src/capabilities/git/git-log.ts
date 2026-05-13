import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';

export function createGitLogTool(getCwd: () => string) {
  return tool({
    description: 'Show commit logs. Returns recent commit history with hash, author, date, and message.',
    inputSchema: zodSchema(z.object({
      count: z.number().optional().describe('Number of commits to show (default 10)'),
      path: z.string().optional().describe('File or directory to show log for'),
    })),
    execute: async ({ count, path }) => {
      try {
        const n = Math.min(Math.max(Math.floor(count ?? 10), 1), 200);
        const args = ['log', '--oneline', '--decorate', `-${n}`];
        if (path) args.push('--', path);
        const result = execFileSync('git', args, { encoding: 'utf-8', timeout: 10000, cwd: getCwd() });
        if (!result.trim()) return 'No commits found.';
        return result.trim();
      } catch (err: any) {
        return `Error: ${err.stderr?.trim() || err.message}`;
      }
    },
  });
}