import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '../../utils/logger.js';

const MAX_OUTPUT_CHARS = 8000;
const SANDBOX_DIR = join(tmpdir(), 'tota-sandbox');

const LANGUAGE_CONFIG = {
  python: { ext: '.py', runner: 'python3', runnerFallback: 'python' },
  javascript: { ext: '.mjs', runner: 'node' },
  bash: { ext: '.sh', runner: 'bash' },
  typescript: { ext: '.ts', runner: 'npx ts-node --esm' },
  ruby: { ext: '.rb', runner: 'ruby' },
  go: { ext: '.go', runner: 'go run' },
} as const;

type Language = keyof typeof LANGUAGE_CONFIG;

export function createRunCodeTool() {
  return tool({
    description: `Execute a code snippet in an isolated temporary sandbox. Supports Python, JavaScript (Node.js), Bash, TypeScript, Ruby, and Go. The sandbox is isolated from the main working directory — use run_command for operations in the working directory. Output is capped at 8000 characters. Use for quick calculations, data transformations, or testing logic before writing to files.`,
    inputSchema: zodSchema(z.object({
      language: z.enum(['python', 'javascript', 'bash', 'typescript', 'ruby', 'go']).describe('Programming language'),
      code: z.string().describe('The code to execute'),
      timeout: z.number().int().min(1).max(120).optional().describe('Timeout in seconds (default: 30, max: 120)'),
      stdin: z.string().optional().describe('Optional input to pass to stdin'),
    })),
    execute: async ({ language, code, timeout = 30, stdin }) => {
      const cfg = LANGUAGE_CONFIG[language as Language];
      if (!cfg) return `Unsupported language: ${language}`;

      const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sandboxDir = join(SANDBOX_DIR, runId);

      try {
        mkdirSync(sandboxDir, { recursive: true });
        const codeFile = join(sandboxDir, `run${cfg.ext}`);
        writeFileSync(codeFile, code, 'utf-8');

        // Make bash scripts executable
        if (language === 'bash') {
          execSync(`chmod +x "${codeFile}"`);
        }

        const stdinFile = stdin ? join(sandboxDir, 'stdin.txt') : undefined;
        if (stdinFile && stdin) {
          writeFileSync(stdinFile, stdin, 'utf-8');
        }

        const runnerCmd = language === 'go'
          ? `cd "${sandboxDir}" && go run run.go`
          : `${cfg.runner} "${codeFile}"`;

        const inputRedirect = stdinFile ? ` < "${stdinFile}"` : '';
        const fullCmd = `${runnerCmd}${inputRedirect}`;

        logger.info({ language, cmd: fullCmd, timeout }, 'Running sandboxed code');

        const output = execSync(fullCmd, {
          timeout: timeout * 1000,
          maxBuffer: 1024 * 1024 * 4,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: sandboxDir,
          env: {
            ...process.env,
            // Restrict to sandbox dir for some security
            HOME: sandboxDir,
          },
        });

        const trimmed = (output || '(no output)').trim();
        return trimmed.length > MAX_OUTPUT_CHARS
          ? trimmed.slice(0, MAX_OUTPUT_CHARS) + `\n... (output truncated at ${MAX_OUTPUT_CHARS} chars)`
          : trimmed;
      } catch (err: any) {
        const stderr = err.stderr?.trim();
        const stdout = err.stdout?.trim();
        let msg = '';

        if (err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
          msg = `Code execution timed out after ${timeout}s.`;
        } else {
          msg = `Execution failed (exit code ${err.status ?? 'unknown'})`;
          if (stdout) msg += `\nOutput: ${stdout.slice(0, 2000)}`;
          if (stderr) msg += `\nError: ${stderr.slice(0, 2000)}`;
        }
        return msg;
      } finally {
        try {
          rmSync(sandboxDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup
        }
      }
    },
  });
}
