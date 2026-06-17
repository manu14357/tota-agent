import type { ChannelRegistry } from '../channels/registry.js';
import type { TokenBudget } from '../utils/tokens.js';

/**
 * Handle the `/budget` family of commands. Extracted from
 * `Agent.handleBudgetCommand` so the budget subcommand dispatch lives in its
 * own module. Behaviour is identical — the Agent method delegates here,
 * passing its channel registry and token budget.
 */
export async function handleBudgetCommand(
  channels: ChannelRegistry,
  tokenBudget: TokenBudget,
  subcommand: string,
  channelType: string,
  channelId: string,
): Promise<void> {
  const channel = channels.get(channelType as any);
  if (!channel) return;

  const parts = subcommand.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase();

  if (action === 'override' || action === '1') {
    tokenBudget.forceAllowNext();
    await channel.send('Budget override applied — your next request will proceed.', channelId);
  } else if (action === 'reset' || action === '2') {
    tokenBudget.resetUsage();
    await channel.send(`Usage reset to zero. ${tokenBudget.getStatusText()}`, channelId);
  } else if (action === 'set' || action === '3') {
    const newBudget = parseInt(parts[1], 10);
    if (isNaN(newBudget) || newBudget <= 0) {
      await channel.send('Please specify the new budget. Usage: `/budget set 100000` or type e.g. `3 100000`', channelId);
      return;
    }
    tokenBudget.setBudget(newBudget);
    await channel.send(`Daily budget updated to ${newBudget.toLocaleString()} tokens. ${tokenBudget.getStatusText()}`, channelId);
  } else if (action === 'cancel' || action === '4') {
    await channel.send(`Cancelled. ${tokenBudget.getStatusText()}`, channelId);
  } else if (!action || action === 'status') {
    await channel.send(tokenBudget.getStatusText(), channelId);
  } else {
    await channel.send(`Unknown budget command "${action}". Available: /budget, /budget override, /budget reset, /budget set <number>, /budget status`, channelId);
  }
}
