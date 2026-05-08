import { describe, expect, it } from 'vitest';
import { createRunCodeTool } from './run-code.js';

function getExecute(tool: ReturnType<typeof createRunCodeTool>) {
  return (tool as any).execute as (args: any) => Promise<string>;
}

describe('run_code tool', () => {
  const tool = createRunCodeTool();
  const execute = getExecute(tool);

  it('runs a simple JavaScript snippet', async () => {
    const result = await execute({ language: 'javascript', code: 'console.log(2 + 2)' });
    expect(result.trim()).toBe('4');
  });

  it('runs a bash snippet', async () => {
    const result = await execute({ language: 'bash', code: 'echo hello' });
    expect(result.trim()).toBe('hello');
  });

  it('returns stdout from multi-line JavaScript', async () => {
    const code = `
const arr = [1, 2, 3];
console.log(arr.reduce((a, b) => a + b, 0));
`;
    const result = await execute({ language: 'javascript', code });
    expect(result.trim()).toBe('6');
  });

  it('captures stderr-mixed output on failure', async () => {
    const result = await execute({ language: 'javascript', code: 'throw new Error("boom")' });
    expect(result).toMatch(/boom|failed|Error/i);
  });

  it('truncates output longer than 8000 chars', async () => {
    const code = `process.stdout.write('x'.repeat(10000))`;
    const result = await execute({ language: 'javascript', code });
    expect(result.length).toBeLessThanOrEqual(9000);
    expect(result).toContain('truncated');
  });

  it('respects timeout and returns timeout message', async () => {
    const code = `setTimeout(() => {}, 60000)`;
    const result = await execute({ language: 'javascript', code, timeout: 1 });
    expect(result.toLowerCase()).toMatch(/timed out|timeout/);
  }, 10000);

  it('passes stdin to bash process', async () => {
    const code = `read LINE; echo "got:$LINE"`;
    const result = await execute({ language: 'bash', code, stdin: 'hello-stdin' });
    expect(result).toContain('hello-stdin');
  });
});
