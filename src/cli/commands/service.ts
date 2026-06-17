import type { Command } from 'commander';

import { installService, uninstallService, showServiceStatus } from '../service.js';

export function registerServiceCommands(program: Command): void {
  const serviceCmd = program
    .command('service')
    .description('Manage tota as a system service (auto-start, crash recovery)');

  serviceCmd
    .command('install')
    .description('Install tota as a system service (auto-start on boot)')
    .action(() => {
      installService();
    });

  serviceCmd
    .command('uninstall')
    .description('Uninstall the system service')
    .action(() => {
      uninstallService();
    });

  serviceCmd
    .command('status')
    .description('Show system service status')
    .action(() => {
      showServiceStatus();
    });
}
