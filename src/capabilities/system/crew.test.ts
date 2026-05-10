import { describe, expect, it } from 'vitest';
import { createSpawnAgentTool, type CrewHandler } from './crew.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

describe('spawn_agent tool', () => {
  it('returns unavailable message when no handler configured', async () => {
    const tool = createSpawnAgentTool(() => null);
    const result = await execute(tool, { role: 'researcher', task: 'Find latest news' });
    expect(result).toMatch(/unavailable|not configured|handler/i);
  });

  it('calls handler with correct role and task', async () => {
    const calls: Array<{ role: string; task: string; allowedTools?: string[] }> = [];
    const handler: CrewHandler = async (role, task, allowedTools) => {
      calls.push({ role, task, allowedTools });
      return 'Agent completed the task successfully.';
    };
    const tool = createSpawnAgentTool(() => handler);
    const result = await execute(tool, { role: 'researcher', task: 'Summarize the codebase' });
    expect(calls).toHaveLength(1);
    expect(calls[0].role).toBe('researcher');
    expect(calls[0].task).toBe('Summarize the codebase');
    expect(result).toContain('completed');
  });

  it('passes allowed_tools to handler', async () => {
    const calls: Array<{ role: string; task: string; allowedTools?: string[] }> = [];
    const handler: CrewHandler = async (role, task, allowedTools) => {
      calls.push({ role, task, allowedTools });
      return 'done';
    };
    const tool = createSpawnAgentTool(() => handler);
    await execute(tool, { role: 'coder', task: 'Write tests', allowed_tools: ['read_file', 'write_file'] });
    expect(calls[0].allowedTools).toEqual(['read_file', 'write_file']);
  });

  it('handles handler errors gracefully', async () => {
    const handler: CrewHandler = async () => {
      throw new Error('sub-agent crashed unexpectedly');
    };
    const tool = createSpawnAgentTool(() => handler);
    const result = await execute(tool, { role: 'faulty', task: 'Do something risky' });
    expect(result).toMatch(/error|failed|crashed/i);
  });

  it('passes a long task without truncation', async () => {
    const longTask = 'Analyze '.repeat(100) + 'the codebase';
    const calls: string[] = [];
    const handler: CrewHandler = async (_role, task) => {
      calls.push(task);
      return 'done';
    };
    const tool = createSpawnAgentTool(() => handler);
    await execute(tool, { role: 'analyst', task: longTask });
    expect(calls[0]).toBe(longTask);
  });

  it('has a description that mentions role and task', () => {
    const tool = createSpawnAgentTool(() => null);
    const desc = (tool as any).description as string;
    expect(desc.toLowerCase()).toMatch(/agent|role|task|crew/i);
  });

  it('works without optional allowed_tools', async () => {
    const handler: CrewHandler = async (role, task, allowedTools) => {
      return `role=${role} allowedTools=${JSON.stringify(allowedTools)}`;
    };
    const tool = createSpawnAgentTool(() => handler);
    const result = await execute(tool, { role: 'planner', task: 'Plan the sprint' });
    expect(result).toContain('role=planner');
  });
});
