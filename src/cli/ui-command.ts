import { exec } from 'node:child_process';

/**
 * Open the default browser to the given URL.
 * Errors are ignored — the user can always open it manually.
 */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"` :
    process.platform === 'win32' ? `start "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => { /* ignore errors */ });
}

/**
 * Configure environment variables so that the next loadConfig() call
 * will pick up the UI channel settings.
 */
export function enableUIChannel(port: number): void {
  process.env['UI_ENABLED'] = 'true';
  process.env['UI_PORT'] = String(port);
}
