import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

export type CrewHandler = (role: string, task: string, allowedTools?: string[]) => Promise<string>;

export function createSpawnAgentTool(getHandler: () => CrewHandler | null) {
  return tool({
    description: `Spawn a specialized sub-agent with a custom role and restricted tool set to handle a focused sub-task. Use this to build multi-agent workflows:
- Researcher agent: fetches URLs, runs web_search, extracts data
- Coder agent: reads/writes files, runs code, runs shell commands
- Analyst agent: reads files, analyzes images, produces reports
- Planner agent: thinks through complex tasks and returns a step-by-step plan
The sub-agent runs independently with its own context and returns the final result. Results flow back to you to continue the parent task.`,
    inputSchema: zodSchema(z.object({
      role: z.string().describe('Role/persona for the sub-agent (e.g. "You are a senior TypeScript developer. Your job is to write clean, idiomatic code.")'),
      task: z.string().describe('Specific task for the sub-agent to perform. Be detailed — it has no context from the current conversation.'),
      allowed_tools: z.array(z.string()).optional().describe('Optional list of tool names the sub-agent can use. If omitted, it has access to all tools. Examples: ["read_file", "write_file", "run_code"] for a coder agent.'),
    })),
    execute: async ({ role, task, allowed_tools }) => {
      const handler = getHandler();
      if (!handler) {
        return 'Crew/multi-agent is not available: handler not registered.';
      }
      logger.info({ rolePreview: role.slice(0, 60), taskPreview: task.slice(0, 80), tools: allowed_tools?.length ?? 'all' }, 'Spawning crew agent');
      try {
        const result = await handler(role, task, allowed_tools);
        return `[Crew Agent Result]\n${result}`;
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Crew agent failed');
        return `Crew agent failed: ${err.message}`;
      }
    },
  });
}
