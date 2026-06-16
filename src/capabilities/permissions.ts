import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir, platform } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getTotaHome } from '../utils/config.js';
import { logger } from '../utils/logger.js';

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

export interface FileScope {
  path: string;
  read: boolean;
  write: boolean;
}

export interface ShellPermissions {
  enabled: boolean;
  blocked: string[];
  autoApproved: string[];
  needsApproval: string[];
  cwdOnly: boolean;
}

export interface FsPermissions {
  enabled: boolean;
  scopes: FileScope[];
}

export interface GitPermissions {
  enabled: boolean;
  autoApproveRead: boolean;
  approveWrite: boolean;
}

export interface PermissionsManifest {
  capabilities: {
    filesystem: FsPermissions;
    shell: ShellPermissions;
    git: GitPermissions;
  };
}

const DEFAULT_MANIFEST: PermissionsManifest = {
  capabilities: {
    filesystem: {
      enabled: true,
      scopes: [
        { path: '.', read: true, write: true },
      ],
    },
    shell: {
      enabled: true,
      blocked: [
        'sudo *',
        'rm -rf /',
        'rm -rf ~',
        'rm -rf /*',
        'mkfs *',
        'dd if=*',
        'chmod 777 /',
        'chown * /',
        ':(){ :|:& };:',
        'shutdown *',
        'reboot *',
        'halt *',
        'init 0',
        'init 6',
        'kill -9 1',
        '> /dev/sda',
        'mv /* /dev/null',
        'del /s /q C:\\*',
        'rmdir /s /q C:\\*',
        'format *',
        'icacls * C:\\* /grant',
        'net user *',
        'netsh *',
        'reg delete *',
        'cmd /c rd /s /q *',
      ],
      autoApproved: [
        'ls *',
        'cat *',
        'pwd',
        'which *',
        'node *',
        'npm run *',
        'npm test *',
        'npm list *',
        'git status *',
        'git diff *',
        'git log *',
        'git branch *',
        'echo *',
        'head *',
        'tail *',
        'wc *',
        'find *',
        'grep *',
        'rg *',
        'ps *',
        'df *',
        'du *',
        'uname *',
        'curl *',
        'wget *',
        'dir *',
        'type *',
        'cd *',
        'where *',
        'tree *',
        'findstr *',
        'tasklist *',
        'systeminfo *',
      ],
      needsApproval: [
        'npm publish *',
        'git push *',
        'docker *',
        'curl * | sh',
        'curl * | bash',
        'wget * | sh',
        'pip install *',
        'pip3 install *',
        'rm -r *',
        'rm -rf *',
        'mv *',
        'cp -r *',
        'chmod *',
        'mkdir *',
        'rmdir *',
        'xcopy *',
        'robocopy *',
        'del *',
        'rd /s *',
        'powershell *',
        'cmd /c *',
      ],
      cwdOnly: true,
    },
    git: {
      enabled: true,
      autoApproveRead: true,
      approveWrite: true,
    },
  },
};

const PERMISSIONS_FILE = join(getTotaHome(), 'permissions.yaml');

export class PermissionManager {
  private manifest: PermissionsManifest;
  private readonly cwd: string;
  private askHandler?: (prompt: string) => Promise<string>;
  private autoApproveAll = false;
  private elevatedCommands: Set<string> = new Set();
  private currentChannelType: string = 'cli';
  private currentChannelId: string = 'cli';
  /** Per-channel permission modes — keyed by channelId (JID for WA, chatId for TG) */
  private channelModes = new Map<string, 'allow-all' | 'ask-me'>();

  private tempScopes: FileScope[] = [];

  constructor() {
    this.cwd = process.cwd();
    this.manifest = this.load();
  }

  setCurrentChannelType(type: string): void {
    this.currentChannelType = type;
  }

  getCurrentChannelType(): string {
    return this.currentChannelType;
  }

  setCurrentChannelId(id: string): void {
    this.currentChannelId = id;
  }

  getCurrentChannelId(): string {
    return this.currentChannelId;
  }

  /** Set the permission mode for a specific channel session (overrides global autoApproveAll). */
  setChannelMode(channelId: string, mode: 'allow-all' | 'ask-me'): void {
    this.channelModes.set(channelId, mode);
  }

  getChannelMode(channelId: string): 'allow-all' | 'ask-me' {
    return this.channelModes.get(channelId) ?? 'ask-me';
  }

  /** True if the current channel OR the global flag says approve-all. */
  private isEffectiveAutoApprove(): boolean {
    if (this.autoApproveAll) return true;
    return this.channelModes.get(this.currentChannelId) === 'allow-all';
  }

  onAsk(handler: (prompt: string) => Promise<string>): void {
    this.askHandler = handler;
  }

  setAutoApproveAll(value: boolean): void {
    this.autoApproveAll = value;
  }

  isAutoApproveAll(): boolean {
    return this.autoApproveAll;
  }

  elevateForSkill(allowedTools: string[]): void {
    if (allowedTools.includes('run_command')) {
      this.elevatedCommands.add('run_command');
    }
    if (allowedTools.includes('read_file') || allowedTools.includes('list_dir')) {
      this.elevatedCommands.add('fs_read');
    }
    if (allowedTools.includes('write_file') || allowedTools.includes('create_file') || allowedTools.includes('delete_file')) {
      this.elevatedCommands.add('fs_write');
    }
  }

  clearElevation(): void {
    this.elevatedCommands.clear();
  }

  isElevated(tool: string): boolean {
    if (this.elevatedCommands.has(tool)) return true;
    return false;
  }

  isShellElevated(): boolean {
    return this.elevatedCommands.has('run_command');
  }

  private load(): PermissionsManifest {
    if (existsSync(PERMISSIONS_FILE)) {
      try {
        const raw = readFileSync(PERMISSIONS_FILE, 'utf-8');
        const parsed = parseYaml(raw) as PermissionsManifest;
        return this.mergeDefaults(parsed);
      } catch (err) {
        logger.warn({ err }, 'Failed to parse permissions.yaml, using defaults');
        return { ...DEFAULT_MANIFEST };
      }
    }
    this.save(DEFAULT_MANIFEST);
    return { ...DEFAULT_MANIFEST };
  }

  save(manifest?: PermissionsManifest): void {
    const m = manifest || this.manifest;
    const dir = getTotaHome();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PERMISSIONS_FILE, stringifyYaml(m, { lineWidth: 0 }), 'utf-8');
    this.manifest = m;
  }

  getManifest(): PermissionsManifest {
    return this.manifest;
  }

  addApprovedCommand(baseCommand: string): void {
    const cmdName = baseCommand.trim().split(/\s+/)[0];
    const pattern = `${cmdName} *`;
    const shell = this.manifest.capabilities.shell;
    if (!shell.autoApproved.includes(pattern) && !shell.autoApproved.includes(cmdName)) {
      shell.autoApproved.push(pattern);
      this.save();
      logger.info({ pattern }, 'Shell command pattern auto-approved and saved');
    }
  }

  async checkFsAccess(path: string, mode: 'read' | 'write'): Promise<{ allowed: boolean; reason?: string }> {
    if (this.isEffectiveAutoApprove()) {
      return { allowed: true };
    }
    if (mode === 'read' && this.elevatedCommands.has('fs_read')) {
      return { allowed: true };
    }
    if (mode === 'write' && this.elevatedCommands.has('fs_write')) {
      return { allowed: true };
    }

    const fs = this.manifest.capabilities.filesystem;
    if (!fs.enabled) {
      return { allowed: false, reason: 'Filesystem capability is disabled' };
    }

    const resolved = resolve(path);
    const scope = this.findScope(resolved);
    const tempScope = this.findTempScope(resolved);

    if (scope) {
      if (mode === 'read' && scope.read) return { allowed: true };
      if (mode === 'write' && scope.write) return { allowed: true };
      return { allowed: false, reason: `Permission denied: ${mode} access to ${path} (scope has ${mode}=false)` };
    }

    if (tempScope) {
      if (mode === 'read' && tempScope.read) return { allowed: true };
      if (mode === 'write' && tempScope.write) return { allowed: true };
      return { allowed: false, reason: `Permission denied: ${mode} access to ${path}` };
    }

    if (!this.isEffectiveAutoApprove() && this.askHandler && this.currentChannelType !== 'internal') {
      return this.requestScopeExternal(path, mode);
    }

    return { allowed: false, reason: `Permission denied for ${mode} access to ${path}` };
  }

  async checkShellCommand(command: string): Promise<{ allowed: boolean; reason?: string; needsApproval: boolean }> {
    if (this.isEffectiveAutoApprove()) {
      logger.info({ cmd: command.trim() }, 'Shell command auto-approved (auto-approve-all mode)');
      return { allowed: true, needsApproval: false };
    }

    if (this.isShellElevated()) {
      logger.info({ cmd: command.trim() }, 'Shell command auto-approved (skill elevation)');
      return { allowed: true, needsApproval: false };
    }

    const shell = this.manifest.capabilities.shell;
    if (!shell.enabled) {
      return { allowed: false, reason: 'Shell capability is disabled', needsApproval: false };
    }

    const trimmed = command.trim();
    const baseCmd = trimmed.split(/\s+/)[0];

    // C2: Defend against shell-injection chains. Blocklist patterns are anchored
    // by ^...$ and only check the leading token. A command like
    // `echo hello; sudo rm -rf /` bypasses the blocklist. Split the command on
    // shell metacharacters and check EACH segment against the blocklist.
    const segments = this.splitShellSegments(trimmed);
    for (const seg of segments) {
      for (const pattern of shell.blocked) {
        if (this.matchPattern(seg, pattern)) {
          return { allowed: false, reason: `Blocked command: matches "${pattern}" in segment "${seg}"`, needsApproval: false };
        }
      }
    }

    if (shell.cwdOnly) {
      const hasPathTraversal = this.hasPathBeyondCwd(trimmed);
      if (hasPathTraversal) {
        const scopeCheck = await this.checkFsAccess(hasPathTraversal, 'write');
        if (!scopeCheck.allowed) {
          return { allowed: false, reason: `No permission to access ${hasPathTraversal}. Use approve_scope tool with path="${hasPathTraversal}" and mode="write" to request access.`, needsApproval: false };
        }
      }
    }

    for (const pattern of shell.autoApproved) {
      if (this.matchPattern(trimmed, pattern)) {
        logger.info({ cmd: trimmed }, 'Shell command auto-approved');
        return { allowed: true, needsApproval: false };
      }
    }

    for (const pattern of shell.needsApproval) {
      if (this.matchPattern(trimmed, pattern)) {
        if (this.askHandler && this.currentChannelType !== 'internal') {
          const result = await this.askHandler(`Run command: ${trimmed}`);
          if (result === 'yes') {
            return { allowed: true, needsApproval: false };
          }
          if (result === 'always') {
            this.addApprovedCommand(baseCmd);
            return { allowed: true, needsApproval: false };
          }
          return { allowed: false, reason: `User denied: ${trimmed}`, needsApproval: false };
        }
        return { allowed: false, reason: `Command requires approval: matches "${pattern}"`, needsApproval: true };
      }
    }

    if (this.askHandler && this.currentChannelType !== 'internal') {
      const result = await this.askHandler(`Run command: ${trimmed}`);
      if (result === 'yes') {
        return { allowed: true, needsApproval: false };
      }
      if (result === 'always') {
        this.addApprovedCommand(baseCmd);
        return { allowed: true, needsApproval: false };
      }
      return { allowed: false, reason: `User denied: ${trimmed}`, needsApproval: false };
    }

    return { allowed: false, reason: 'Command not in auto-approve list — requires approval', needsApproval: true };
  }

  /**
   * Split a shell command on metacharacters (`;`, `&&`, `||`, `|`, newlines)
   * so each subcommand can be matched against the blocklist independently.
   * Does not attempt to fully parse shell — that would require a parser.
   */
  private splitShellSegments(command: string): string[] {
    return command
      .split(/[;&|\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  isGitReadAllowed(): boolean {
    return this.manifest.capabilities.git.enabled && this.manifest.capabilities.git.autoApproveRead;
  }

  isGitWriteNeedsApproval(): boolean {
    return this.manifest.capabilities.git.enabled && this.manifest.capabilities.git.approveWrite;
  }

  addScope(path: string, read: boolean, write: boolean): void {
    const resolved = resolve(path);
    // C4: Refuse to add scopes for dangerous system paths. Approving write to
    // /proc/sysrq-trigger or /etc would be catastrophic. The LLM cannot use
    // approve_scope to bypass this.
    if (isDangerousSystemPath(resolved)) {
      throw new Error(
        `Refusing to grant access to ${resolved}: this is a sensitive system path. Manual edit of permissions.yaml required.`,
      );
    }
    const existing = this.findScope(resolved);
    if (existing) {
      existing.read = existing.read || read;
      existing.write = existing.write || write;
    } else {
      this.manifest.capabilities.filesystem.scopes.push({
        path: resolved,
        read,
        write,
      });
    }
    this.save();
    logger.info({ path: resolved, read, write }, 'Permission scope added');
  }

  private findScope(resolvedPath: string): FileScope | undefined {
    const scopes = this.manifest.capabilities.filesystem.scopes;
    for (const scope of scopes) {
      const scopeResolved = resolve(scope.path.replace(/^~/, homedir()));
      const prefix = scopeResolved.endsWith(sep) ? scopeResolved : scopeResolved + sep;
      if (resolvedPath === scopeResolved || resolvedPath.startsWith(prefix)) {
        return scope;
      }
    }
    return undefined;
  }

  async requestScopeExternal(path: string, mode: 'read' | 'write'): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.askHandler) {
      return { allowed: false, reason: `Permission denied for ${mode} access to ${path}` };
    }

    const prompt = `tota needs ${mode} access to:\n${path}\n\nAllow access?`;
    const response = await this.askHandler(prompt);

    if (response === 'always') {
      this.addScope(path, mode === 'read', mode === 'write');
      return { allowed: true };
    }

    if (response === 'yes') {
      this.addTempScope(path, mode === 'read', mode === 'write');
      return { allowed: true };
    }

    return { allowed: false, reason: `Permission denied for ${mode} access to ${path}` };
  }

  addTempScope(path: string, read: boolean, write: boolean): void {
    const resolved = resolve(path);
    // C4: Same denylist for session-only scopes — these still grant
    // read/write access to dangerous paths during the session.
    if (isDangerousSystemPath(resolved)) {
      throw new Error(
        `Refusing to grant session access to ${resolved}: this is a sensitive system path.`,
      );
    }
    this.tempScopes.push({ path: resolved, read, write });
    logger.info({ path: resolved, read, write }, 'Temp permission scope added (session only)');
  }

  /**
   * H9: Remove a previously-added temp scope. Used to clean up scopes added
   * for one-off operations (e.g. scheduled task execution) so they don't
   * accumulate across the session. Removes ALL entries matching the resolved
   * path.
   */
  removeTempScope(path: string): void {
    const resolved = resolve(path);
    const before = this.tempScopes.length;
    this.tempScopes = this.tempScopes.filter((s) => s.path !== resolved);
    const removed = before - this.tempScopes.length;
    if (removed > 0) {
      logger.info({ path: resolved, removed }, 'Temp permission scope removed');
    }
  }

  private findTempScope(resolvedPath: string): FileScope | undefined {
    for (const scope of this.tempScopes) {
      const scopeResolved = resolve(scope.path.replace(/^~/, homedir()));
      const prefix = scopeResolved.endsWith(sep) ? scopeResolved : scopeResolved + sep;
      if (resolvedPath === scopeResolved || resolvedPath.startsWith(prefix)) {
        return scope;
      }
    }
    return undefined;
  }

  private matchPattern(command: string, pattern: string): boolean {
    const regexStr = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    try {
      return new RegExp(regexStr, 'i').test(command);
    } catch {
      return command.startsWith(pattern.replace(/ \*$/, ''));
    }
  }

  private hasPathBeyondCwd(command: string): string | null {
    const pathPatterns = [
      /(?:^|\s)(\/[^\s]+)/,
      /(?:^|\s)(~\/[^\s]+)/,
      /(?:^|\s)\.\.\/([^\s]+)/,
      /(?:^|\s)([A-Za-z]:\\[^\s]+)/,
      /(?:^|\s)(\\\\[^\s]+)/,
    ];
    for (const p of pathPatterns) {
      const match = command.match(p);
      if (match) {
        const candidate = resolve(match[1].replace(/^~/, homedir()));
        if (!candidate.startsWith(this.cwd)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private mergeDefaults(parsed: Partial<PermissionsManifest>): PermissionsManifest {
    const mergeArray = (existing: string[] | undefined, defaults: string[]): string[] => {
      if (!existing) return [...defaults];
      const combined = new Set([...defaults, ...existing]);
      return [...combined];
    };

    return {
      capabilities: {
        filesystem: {
          enabled: parsed.capabilities?.filesystem?.enabled ?? DEFAULT_MANIFEST.capabilities.filesystem.enabled,
          scopes: parsed.capabilities?.filesystem?.scopes ?? DEFAULT_MANIFEST.capabilities.filesystem.scopes,
        },
        shell: {
          enabled: parsed.capabilities?.shell?.enabled ?? DEFAULT_MANIFEST.capabilities.shell.enabled,
          blocked: mergeArray(parsed.capabilities?.shell?.blocked, DEFAULT_MANIFEST.capabilities.shell.blocked),
          autoApproved: mergeArray(parsed.capabilities?.shell?.autoApproved, DEFAULT_MANIFEST.capabilities.shell.autoApproved),
          needsApproval: mergeArray(parsed.capabilities?.shell?.needsApproval, DEFAULT_MANIFEST.capabilities.shell.needsApproval),
          cwdOnly: parsed.capabilities?.shell?.cwdOnly ?? DEFAULT_MANIFEST.capabilities.shell.cwdOnly,
        },
        git: {
          enabled: parsed.capabilities?.git?.enabled ?? DEFAULT_MANIFEST.capabilities.git.enabled,
          autoApproveRead: parsed.capabilities?.git?.autoApproveRead ?? DEFAULT_MANIFEST.capabilities.git.autoApproveRead,
          approveWrite: parsed.capabilities?.git?.approveWrite ?? DEFAULT_MANIFEST.capabilities.git.approveWrite,
        },
      },
    };
  }
}