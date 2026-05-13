import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';

export function createGitDiffTool(getCwd: () => string) {
  return tool({
    description: 'Show changes between commits, commit and working tree, etc. Shows what has been modified.',
    inputSchema: zodSchema(z.object({
      path: z.string().optional().describe('File or directory to diff'),
      staged: z.boolean().optional().describe('Show staged changes (cached) instead of unstaged'),
    })),
    execute: async ({ path, staged }) => {
      try {
        const args = ['diff'];
        if (staged) args.push('--cached');
        if (path) args.push('--', path);
        const result = execFileSync('git', args, { encoding: 'utf-8', timeout: 15000, cwd: getCwd() });
        if (!result.trim()) return 'No differences found.';
        const truncated = result.length > 15000 ? result.slice(0, 15000) + '\n... (truncated)' : result;
        return truncated;
      } catch (err: any) {
        return `Error: ${err.stderr?.trim() || err.message}`;
      }
    },
  });
}