import { Command } from 'commander';

import { logger } from './utils/logger.js';
import { registerCommands } from './cli/commands/index.js';

// Prevent Baileys internal async errors (e.g. pre-key upload timeouts) from
// crashing the whole process with an unhandled rejection.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  // Silently ignore known Baileys timeout/close errors that are not actionable
  if (msg === 'Timed Out' || msg === 'Connection Closed' || msg === 'Connection Terminated') return;
  logger.error({ reason }, 'Unhandled promise rejection');
});

const program = new Command();

registerCommands(program);

program.parseAsync();
