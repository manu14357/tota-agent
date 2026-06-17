import type { Command } from 'commander';

import { getTotaHome } from '../../utils/config.js';
import { enforceUpToDate } from '../../utils/update-check.js';
import { pkgVersion } from '../version.js';
import { registerCoreCommands } from './core.js';
import { registerTelegramCommands } from './telegram.js';
import { registerWhatsAppCommands } from './whatsapp.js';
import { registerServiceCommands } from './service.js';

export function registerCommands(program: Command): void {
  registerCoreCommands(program);
  registerTelegramCommands(program);
  registerWhatsAppCommands(program);
  registerServiceCommands(program);

  // Block usage if a newer version is available — skip only for `tota upgrade`
  program.hook('preAction', async (thisCommand) => {
    const commandName = thisCommand.name();
    if (commandName === 'upgrade') return;
    await enforceUpToDate(pkgVersion, getTotaHome());
  });
}
