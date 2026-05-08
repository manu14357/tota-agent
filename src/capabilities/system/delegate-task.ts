import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

export type DelegateHandler = (task: string) => Promise<string>;

export function createDelegateTaskTool(getHandler: () => DelegateHandler | null) {
  return tool({
    description: `Delegate a focused sub-task to a fresh agent context. Use this when a task is complex enough to warrant its own isolated context — e.g., "summarize these 5 files", "write and test this function", or "gather all info about X before I continue". The sub-task runs with full tool access and returns its final text response. Results are returned back to you so you can continue with the parent task.`,
    inputSchema: zodSchema(z.object({
      task: z.string().describe('Detailed description of the task to delegate. Be specific — the sub-agent has no context from the current conversation.'),
    })),
    execute: async ({ task }) => {
      const handler = getHandler();
      if (!handler) {
        return 'Task delegation is not available: handler not registered.';
      }
      logger.info({ taskPreview: task.slice(0, 80) }, 'Delegating sub-task');
      try {
        const result = await handler(task);
        return `Sub-task result:\n${result}`;
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Sub-task delegation failed');
        return `Sub-task failed: ${err.message}`;
      }
    },
  });
}
