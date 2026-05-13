import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { getTotaHome } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const SERVICE_NAME = 'tota-agent';
const SERVICE_DESC = 'tota — Soul-Driven AI Agent';
const WIN_TASK_NAME = 'TotaAgent';

export function isServiceInstalled(): boolean {
  const platform = process.platform;

  if (platform === 'darwin') {
    return existsSync(join(homedir(), 'Library', 'LaunchAgents', 'com.tota.agent.plist'));
  } else if (platform === 'linux') {
    return existsSync(join(homedir(), '.config', 'systemd', 'user', 'tota-agent.service'));
  } else if (platform === 'win32') {
    try {
      execSync(`schtasks /query /tn "${WIN_TASK_NAME}"`, { stdio: 'pipe', shell: 'cmd.exe' });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function getNodeBinPath(): string {
  return process.execPath;
}

function getDistPath(): string {
  // When run directly as 'node dist/index.js', argv[1] IS the correct script path —
  // but not when running via npx (path is a temporary cache dir that gets cleaned up).
  const argv1 = process.argv[1];
  if (argv1) {
    const isNpx = argv1.includes('_npx') || argv1.includes('npx-cache') || argv1.includes('.npm/_npx');
    if (!isNpx && existsSync(argv1)) {
      return argv1;
    }
  }

  // Search common global npm install locations (platform-specific)
  const ver = process.version.slice(1);
  const isWin = process.platform === 'win32';
  const candidates: string[] = [];

  if (isWin) {
    // npm global on Windows: %APPDATA%\npm\node_modules\tota-agent\dist\index.js
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    candidates.push(join(appData, 'npm', 'node_modules', 'tota-agent', 'dist', 'index.js'));
    // Also try Program Files locations
    candidates.push(join('C:\\Program Files\\nodejs\\node_modules', 'tota-agent', 'dist', 'index.js'));
    candidates.push(join(homedir(), 'AppData', 'Local', 'npm', 'node_modules', 'tota-agent', 'dist', 'index.js'));
  } else {
    // macOS / Linux
    candidates.push(
      join(homedir(), '.nvm', 'versions', 'node', `v${ver}`, 'lib', 'node_modules', 'tota-agent', 'dist', 'index.js'),
      join('/usr', 'local', 'lib', 'node_modules', 'tota-agent', 'dist', 'index.js'),
      join('/opt', 'homebrew', 'lib', 'node_modules', 'tota-agent', 'dist', 'index.js'),
      join('/usr', 'lib', 'node_modules', 'tota-agent', 'dist', 'index.js'),
    );
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Last resort: use argv[1] even if it's the npx cache (better than nothing)
  if (argv1) return argv1;
  throw new Error('Cannot determine tota script path for service install. Install globally: npm install -g tota-agent');
}

export function installService(): void {
  const platform = process.platform;

  if (platform === 'darwin') {
    installMac();
  } else if (platform === 'linux') {
    installLinux();
  } else if (platform === 'win32') {
    installWindows();
  } else {
    console.log(chalk.red(`  Unsupported platform: ${platform}`));
    process.exit(1);
  }
}

export function uninstallService(): void {
  const platform = process.platform;

  if (platform === 'darwin') {
    uninstallMac();
  } else if (platform === 'linux') {
    uninstallLinux();
  } else if (platform === 'win32') {
    uninstallWindows();
  } else {
    console.log(chalk.red(`  Unsupported platform: ${platform}`));
    process.exit(1);
  }
}

export function showServiceStatus(): void {
  const platform = process.platform;

  if (platform === 'darwin') {
    showMacStatus();
  } else if (platform === 'linux') {
    showLinuxStatus();
  } else if (platform === 'win32') {
    showWindowsStatus();
  }
}

function installMac(): void {
  const plistDir = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(plistDir, 'com.tota.agent.plist');

  if (!existsSync(plistDir)) {
    mkdirSync(plistDir, { recursive: true });
  }

  const nodeBin = getNodeBinPath();
  const scriptPath = getDistPath();
  const home = getTotaHome();
  const logPath = join(home, 'daemon.log');
  const errPath = join(home, 'daemon-error.log');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tota.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${scriptPath}</string>
    <string>start</string>
    <string>--daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${errPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}</string>
    <key>HOME</key>
    <string>${homedir()}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${homedir()}</string>
</dict>
</plist>`;

  writeFileSync(plistPath, plist, 'utf-8');

  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'inherit' });
  } catch {
    console.log(chalk.yellow('  launchctl load failed. Try running:'));
    console.log(chalk.dim(`    launchctl load ${plistPath}`));
  }

  console.log('');
  console.log(chalk.green('  tota service installed (macOS LaunchAgent)'));
  console.log(chalk.dim(`  Plist: ${plistPath}`));
  console.log(chalk.dim(`  Logs: ${logPath}`));
  console.log(chalk.dim('  Auto-starts on login. Auto-restarts on crash.'));
  console.log('');
  console.log(chalk.dim('  Uninstall: tota service uninstall'));
  console.log('');
}

function uninstallMac(): void {
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.tota.agent.plist');

  if (!existsSync(plistPath)) {
    console.log(chalk.yellow('  tota service is not installed.'));
    console.log('');
    process.exit(0);
  }

  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: 'inherit' });
  } catch {
    // may already be unloaded
  }

  try {
    unlinkSync(plistPath);
  } catch {
    console.log(chalk.yellow('  Failed to remove plist file. Remove manually:'));
    console.log(chalk.dim(`    rm ${plistPath}`));
  }

  console.log('');
  console.log(chalk.green('  tota service uninstalled'));
  console.log('');
}

function showMacStatus(): void {
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.tota.agent.plist');

  if (!existsSync(plistPath)) {
    console.log(chalk.yellow('  tota service is not installed.'));
    console.log(chalk.dim('  Run `tota service install` to set it up.'));
    console.log('');
    return;
  }

  try {
    const output = execSync('launchctl list | grep com.tota.agent', { encoding: 'utf-8' }).trim();
    console.log(`  ${chalk.green('Service installed and loaded')}`);
    console.log(chalk.dim(`  ${output}`));
  } catch {
    console.log(`  ${chalk.yellow('Service installed but not loaded')}`);
    console.log(chalk.dim(`  Plist: ${plistPath}`));
  }
  console.log('');
}

function installLinux(): void {
  const systemdDir = join(homedir(), '.config', 'systemd', 'user');

  if (!existsSync(systemdDir)) {
    mkdirSync(systemdDir, { recursive: true });
  }

  const servicePath = join(systemdDir, 'tota-agent.service');
  const nodeBin = getNodeBinPath();
  const scriptPath = getDistPath();
  const home = getTotaHome();

  const service = `[Unit]
Description=${SERVICE_DESC}
After=network.target

[Service]
Type=simple
ExecStart=${nodeBin} ${scriptPath} start --daemon
Restart=on-failure
RestartSec=5
Environment=PATH=${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}
Environment=HOME=${homedir()}
WorkingDirectory=${homedir()}
StandardOutput=append:${join(home, 'daemon.log')}
StandardError=append:${join(home, 'daemon-error.log')}

[Install]
WantedBy=default.target`;

  writeFileSync(servicePath, service, 'utf-8');

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    execSync('systemctl --user enable tota-agent.service', { stdio: 'inherit' });
    execSync('systemctl --user start tota-agent.service', { stdio: 'inherit' });
  } catch (err) {
    console.log(chalk.yellow('  systemd commands failed. Try running manually:'));
    console.log(chalk.dim('    systemctl --user daemon-reload'));
    console.log(chalk.dim('    systemctl --user enable tota-agent.service'));
    console.log(chalk.dim('    systemctl --user start tota-agent.service'));
  }

  try {
    execSync(`loginctl enable-linger ${process.env.USER || ''}`, { stdio: 'inherit' });
  } catch {
    console.log(chalk.yellow('  Enable linger failed (needed for boot-without-login). Try:'));
    console.log(chalk.dim(`    sudo loginctl enable-linger ${process.env.USER || '$USER'}`));
  }

  console.log('');
  console.log(chalk.green('  tota service installed (systemd --user)'));
  console.log(chalk.dim(`  Service: ${servicePath}`));
  console.log(chalk.dim(`  Logs: ${join(home, 'daemon.log')}`));
  console.log(chalk.dim('  Auto-starts on login. Auto-restarts on crash (5s delay).'));
  console.log('');
  console.log(chalk.dim('  Uninstall: tota service uninstall'));
  console.log('');
}

function uninstallLinux(): void {
  const servicePath = join(homedir(), '.config', 'systemd', 'user', 'tota-agent.service');

  if (!existsSync(servicePath)) {
    console.log(chalk.yellow('  tota service is not installed.'));
    console.log('');
    process.exit(0);
  }

  try {
    execSync('systemctl --user stop tota-agent.service', { stdio: 'inherit' });
    execSync('systemctl --user disable tota-agent.service', { stdio: 'inherit' });
  } catch {
    // may already be stopped
  }

  try {
    unlinkSync(servicePath);
  } catch {
    console.log(chalk.yellow('  Failed to remove service file. Remove manually:'));
    console.log(chalk.dim(`    rm ${servicePath}`));
  }

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
  } catch {}

  console.log('');
  console.log(chalk.green('  tota service uninstalled'));
  console.log('');
}

function showLinuxStatus(): void {
  const servicePath = join(homedir(), '.config', 'systemd', 'user', 'tota-agent.service');

  if (!existsSync(servicePath)) {
    console.log(chalk.yellow('  tota service is not installed.'));
    console.log(chalk.dim('  Run `tota service install` to set it up.'));
    console.log('');
    return;
  }

  try {
    const output = execSync('systemctl --user status tota-agent.service', { encoding: 'utf-8' }).trim();
    console.log(output);
  } catch (err: any) {
    console.log(chalk.yellow('  Could not get service status:'));
    console.log(chalk.dim(`  ${err.message || err}`));
  }
  console.log('');
}

function installWindows(): void {
  const nodeBin = getNodeBinPath();
  const scriptPath = getDistPath();
  const home = getTotaHome();
  const logPath = join(home, 'daemon.log');

  // /tr value passed through cmd.exe: inner paths with spaces must use \" escaping
  // so cmd.exe doesn't treat the first inner " as the end of the /tr argument.
  const cmd = `\\"${nodeBin}\\" \\"${scriptPath}\\" start --daemon`;

  // Show the raw (unescaped) command so the user can paste it directly into cmd
  const rawCmd = `"${nodeBin}" "${scriptPath}" start --daemon`;

  let taskCreated = false;
  try {
    // /rl limited = run without elevation (default). Omit on systems where it fails.
    execSync(
      `schtasks /create /tn "${WIN_TASK_NAME}" /tr "${cmd}" /sc onlogon /f`,
      { stdio: 'pipe', shell: 'cmd.exe' }
    );
    taskCreated = true;
  } catch (e1: any) {
    // Some Windows editions or GPO restrictions block schtasks without elevation.
    // Show a clear message and the command the user can run as Administrator.
    const msg: string = e1?.stderr?.toString?.() ?? e1?.message ?? '';
    console.log('');
    console.log(chalk.yellow('  schtasks create failed: ' + (msg.split('\n')[0]?.trim() || 'Access denied')));
    console.log(chalk.dim('  To set up auto-start, run this once in an Administrator Command Prompt:'));
    console.log('');
    console.log(chalk.dim(`    schtasks /create /tn "${WIN_TASK_NAME}" /tr "${rawCmd}" /sc onlogon /f`));
    console.log('');
    console.log(chalk.dim('  Or just run `tota start` manually each session.'));
    console.log('');
    return;
  }

  if (taskCreated) {
    try {
      execSync(`schtasks /run /tn "${WIN_TASK_NAME}"`, { stdio: 'pipe', shell: 'cmd.exe' });
    } catch {
      console.log(chalk.yellow('  Task created but failed to start immediately. It will start on next login.'));
    }

    console.log('');
    console.log(chalk.green('  tota service installed (Windows Task Scheduler)'));
    console.log(chalk.dim(`  Task: ${WIN_TASK_NAME}`));
    console.log(chalk.dim(`  Trigger: on logon`));
    console.log(chalk.dim(`  Logs: ${logPath}`));
    console.log(chalk.dim('  Auto-starts on login. Use --daemon flag for crash recovery.'));
    console.log('');
    console.log(chalk.dim('  Uninstall: tota service uninstall'));
    console.log('');
  }
}

function uninstallWindows(): void {
  try {
    execSync(`schtasks /delete /tn "${WIN_TASK_NAME}" /f`, { stdio: 'inherit', shell: 'cmd.exe' });
    console.log('');
    console.log(chalk.green('  tota service uninstalled'));
    console.log('');
  } catch {
    console.log(chalk.yellow('  Task not found or failed to delete. Remove manually:'));
    console.log(chalk.dim(`    schtasks /delete /tn "${WIN_TASK_NAME}" /f`));
    console.log('');
  }
}

function showWindowsStatus(): void {
  try {
    const output = execSync(`schtasks /query /tn "${WIN_TASK_NAME}" /fo list`, {
      encoding: 'utf-8',
      shell: 'cmd.exe',
    }).trim();
    console.log(output);
    console.log('');
  } catch {
    console.log(chalk.yellow('  tota service is not installed.'));
    console.log(chalk.dim('  Run `tota service install` to set it up.'));
    console.log('');
  }
}