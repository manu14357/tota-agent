import { platform } from 'node:os';

// C4: Paths that should never be grantable via approve_scope. These are
// system-level locations where accidental write access can brick the host,
// exfiltrate data, or be used for privilege escalation. The LLM cannot
// grant itself access to these — a user must edit permissions.yaml manually.
const DANGEROUS_LINUX_PATHS = [
  '/proc',
  '/proc/sys',
  '/sys',
  '/sys/firmware',
  '/dev',
  '/dev/shm',
  '/etc',
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/sudoers.d',
  '/boot',
  '/var/log',
  '/var/lib',
  '/usr/bin',
  '/usr/sbin',
  '/usr/lib',
  '/lib',
  '/lib64',
  '/sbin',
  '/bin',
  '/root',
];

// On macOS, /etc, /tmp, /var are all symlinks under /private. The agent
// could be invoked with /etc directly, so we block the public AND the
// private paths. Note: /var is NOT blanket-blocked because /var/folders
// is the per-user temp dir (real path: /private/var/folders).
const DANGEROUS_MACOS_PATHS = [
  '/System',
  '/Library',
  '/.Spotlight-V100',
  '/.fseventsd',
  '/etc',
  '/private/etc',
  '/private/etc/passwd',
  '/private/etc/sudoers',
  '/private/etc/sudoers.d',
  '/var/log',
  '/var/db',
  '/private/var/log',
  '/private/var/db',
  '/private/var/audit',
  '/usr/bin',
  '/usr/sbin',
  '/usr/lib',
  '/sbin',
  '/bin',
  '/cores',
  '/dev',
];

const DANGEROUS_WINDOWS_PATHS = [
  'C:\\Windows',
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Boot',
];

// H10: Sensitive (not blocked, but warn loudly) paths. Granting the agent
// read/write access to these would expose credentials or private data. The
// approval flow must surface this warning to the user before they confirm.
const SENSITIVE_LINUX_PATHS = [
  '/root/.ssh',
  '/home/*/.ssh',
  '/root/.aws',
  '/home/*/.aws',
  '/root/.gnupg',
  '/home/*/.gnupg',
  '/root/.config',
  '/home/*/.config',
  '/root/.kube',
  '/home/*/.kube',
  '/root/.docker',
  '/home/*/.docker',
];

const SENSITIVE_MACOS_PATHS = [
  '/Users/*/.ssh',
  '/Users/*/.aws',
  '/Users/*/.gnupg',
  '/Users/*/.config',
  '/Users/*/.kube',
  '/Users/*/.docker',
  '/Users/*/Library/Keychains',
  '/Users/*/Library/Application Support/Google/Chrome',
  '/Users/*/Library/Application Support/Firefox',
  '/Users/*/.zsh_history',
  '/Users/*/.bash_history',
];

const SENSITIVE_WINDOWS_PATHS = [
  'C:\\Users\\*\\.ssh',
  'C:\\Users\\*\\.aws',
  'C:\\Users\\*\\.gnupg',
  'C:\\Users\\*\\.kube',
  'C:\\Users\\*\\.docker',
  'C:\\Users\\*\\AppData\\Roaming',
];

/**
 * Returns true if the given resolved path is a system-sensitive directory
 * that should not be grantable via the in-conversation approval flow.
 *
 * The denylist is a UNION of platform-specific lists. On any Unix-like
 * host, both the Linux and macOS lists are checked (the agent could be
 * asked to write to a Linux path even on a Mac — the write would fail
 * later, but the permission check should fail first).
 */
export function isDangerousSystemPath(resolvedPath: string): boolean {
  const p = resolvedPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const os = platform();

  let denylist: string[];
  if (os === 'win32') {
    denylist = DANGEROUS_WINDOWS_PATHS.map(s => s.replace(/\\/g, '/').replace(/\/+$/, ''));
  } else {
    // Union Linux and macOS denylists — both are POSIX-style and the agent
    // shouldn't be able to write to either set of paths.
    const union = new Set<string>([
      ...DANGEROUS_LINUX_PATHS,
      ...DANGEROUS_MACOS_PATHS,
    ]);
    denylist = [...union].map(s => s.replace(/\/+$/, ''));
  }

  for (const danger of denylist) {
    if (p === danger) return true;
    if (p.startsWith(danger + '/')) return true;
  }
  return false;
}

/**
 * H10: Returns true if the given path is "sensitive" — granting the agent
 * access would expose credentials, secrets, or private data. Unlike the
 * dangerous-path denylist, sensitive paths are allowed but the approval
 * prompt must show a clear warning. Returns a label describing WHY it's
 * sensitive (e.g. "SSH keys", "AWS credentials") so the UI can present it.
 */
export function getSensitivePathWarning(resolvedPath: string): string | null {
  const p = resolvedPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const os = platform();
  const sensitiveList = os === 'win32' ? SENSITIVE_WINDOWS_PATHS
    : os === 'darwin' ? SENSITIVE_MACOS_PATHS
    : SENSITIVE_LINUX_PATHS;

  // Match against glob patterns (e.g. /home/*/.ssh) by converting to regex.
  for (const pattern of sensitiveList) {
    const normalized = pattern.replace(/\\/g, '/').replace(/\/+$/, '');
    if (matchesGlob(p, normalized)) {
      return labelForSensitivePath(normalized);
    }
  }
  return null;
}

function matchesGlob(path: string, glob: string): boolean {
  // Convert glob (* and ?) to regex. * matches any chars except '/'.
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  const re = new RegExp('^' + escaped + '(/.*)?$');
  return re.test(path);
}

function labelForSensitivePath(pattern: string): string {
  if (pattern.includes('.ssh')) return 'SSH keys';
  if (pattern.includes('.aws')) return 'AWS credentials';
  if (pattern.includes('.gnupg')) return 'GPG keys';
  if (pattern.includes('.kube')) return 'Kubernetes config';
  if (pattern.includes('.docker')) return 'Docker config';
  if (pattern.includes('.zsh_history') || pattern.includes('.bash_history')) return 'shell history';
  if (pattern.includes('Keychains')) return 'macOS Keychain';
  if (pattern.includes('Chrome') || pattern.includes('Firefox')) return 'browser profile data';
  if (pattern.includes('AppData') || pattern.includes('.config')) return 'application config (may contain secrets)';
  return 'sensitive credentials or private data';
}
