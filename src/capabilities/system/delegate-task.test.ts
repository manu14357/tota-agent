import { describe, expect, it } from 'vitest';
import { createDelegateTaskTool, type DelegateHandler } from './delegate-task.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

describe('delegate_task tool', () => {
  it('returns unavailable message when no handler set', async () => {
    const tool = createDelegateTaskTool(() => null);
    const result = await execute(tool, { task: 'Summarize the codebase' });
    expect(result).toMatch(/not available|handler/i);
  });

  it('calls handler with the task string', async () => {
    const calls: string[] = [];
    const handler: DelegateHandler = async (task) => {
      calls.push(task);
      return 'Summary: The codebase is small.';
    };
    const tool = createDelegateTaskTool(() => handler);
    const result = await execute(tool, { task: 'Summarize the codebase' });
    expect(calls[0]).toBe('Summarize the codebase');
    expect(result).toContain('Summary: The codebase is small.');
  });

  it('wraps result with "Sub-task result:" prefix', async () => {
    const handler: DelegateHandler = async () => 'Done.';
    const tool = createDelegateTaskTool(() => handler);
    const result = await execute(tool, { task: 'Do something' });
    expect(result).toMatch(/sub-task result/i);
  });

  it('handles handler errors gracefully', async () => {
    const handler: DelegateHandler = async () => { throw new Error('sub-agent crashed'); };
    const tool = createDelegateTaskTool(() => handler);
    const result = await execute(tool, { task: 'Do something risky' });
    expect(result).toMatch(/failed|sub-agent crashed/i);
  });

  it('passes full task text to handler without truncation', async () => {
    const longTask = 'A '.repeat(500) + 'task';
    const calls: string[] = [];
    const handler: DelegateHandler = async (task) => { calls.push(task); return 'ok'; };
    const tool = createDelegateTaskTool(() => handler);
    await execute(tool, { task: longTask });
    expect(calls[0]).toBe(longTask);
  });
});
