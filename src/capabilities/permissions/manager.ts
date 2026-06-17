import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getTotaHome } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import { isDangerousSystemPath, getSensitivePathWarning } from './path-safety.js';
import type {
  FileScope,
  PermissionsManifest,
} from './types.js';

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
        // M12: additional Windows / cross-platform coverage
        'cmd.exe *',
        'cmd.exe /c *',
        'C:\\Windows\\System32\\cmd.exe *',
        'C:\\Windows\\System32\\cmd.exe /c *',
        'powershell *',
        'powershell.exe *',
        'pwsh *',
        'pwsh.exe *',
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe *',
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -Command *',
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

  /**
   * H11: Switch the active channel context. The autoApproveAll flag is now
   * interpreted as "the CURRENT channel is in allow-all mode" — it is
   * automatically synced to the stored mode for the new channel. This way
   * /permissions on CLI does not leak to Telegram or WhatsApp.
   */
  setCurrentChannelId(id: string): void {
    this.currentChannelId = id;
    // Sync the global flag to the new channel's stored mode. The flag is now
    // effectively a cache of the per-channel mode for the current channel.
    this.autoApproveAll = this.channelModes.get(id) === 'allow-all';
  }

  getCurrentChannelId(): string {
    return this.currentChannelId;
  }

  /** Set the permission mode for a specific channel session. */
  setChannelMode(channelId: string, mode: 'allow-all' | 'ask-me'): void {
    this.channelModes.set(channelId, mode);
    // If this is the currently active channel, update the cached flag too.
    if (channelId === this.currentChannelId) {
      this.autoApproveAll = mode === 'allow-all';
    }
  }

  getChannelMode(channelId: string): 'allow-all' | 'ask-me' {
    return this.channelModes.get(channelId) ?? 'ask-me';
  }

  /**
   * H11: Backwards-compat shim. The flag is now scoped to the current
   * channel. Setting it true for one channel does NOT affect others —
   * they keep their own stored mode and the flag will be re-synced the
   * next time setCurrentChannelId is called for them.
   */
  private isEffectiveAutoApprove(): boolean {
    return this.autoApproveAll;
  }

  onAsk(handler: (prompt: string) => Promise<string>): void {
    this.askHandler = handler;
  }

  /**
   * H11: Per-channel alias for backwards compat. Affects ONLY the current
   * channel (the one last set via setCurrentChannelId). Other channels keep
   * their own mode.
   */
  setAutoApproveAll(value: boolean): void {
    const mode = value ? 'allow-all' : 'ask-me';
    this.channelModes.set(this.currentChannelId, mode);
    this.autoApproveAll = value;
  }

  /**
   * H11: Returns true if the CURRENT channel is in allow-all mode. Other
   * channels may have a different mode — this is no longer a global flag.
   */
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

    // H10: If the path is sensitive, augment the approval prompt with a
    // clear warning so the user knows they're exposing credentials.
    const sensitive = getSensitivePathWarning(path);
    const basePrompt = `tota needs ${mode} access to:\n${path}\n\nAllow access?`;
    const prompt = sensitive
      ? `⚠ This path contains ${sensitive}.\n\n${basePrompt}`
      : basePrompt;
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
    /**
     * H12: Union the user's array with defaults, then apply the
     * `removeFrom*` lists to let the user opt out of specific defaults.
     */
    const mergeArray = (existing: string[] | undefined, defaults: string[], removals?: string[]): string[] => {
      let combined = existing ? new Set([...defaults, ...existing]) : new Set(defaults);
      if (removals && removals.length > 0) {
        const removeSet = new Set(removals);
        combined = new Set([...combined].filter((p) => !removeSet.has(p)));
      }
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
          blocked: mergeArray(
            parsed.capabilities?.shell?.blocked,
            DEFAULT_MANIFEST.capabilities.shell.blocked,
            parsed.capabilities?.shell?.removeFromBlocked,
          ),
          autoApproved: mergeArray(parsed.capabilities?.shell?.autoApproved, DEFAULT_MANIFEST.capabilities.shell.autoApproved),
          needsApproval: mergeArray(
            parsed.capabilities?.shell?.needsApproval,
            DEFAULT_MANIFEST.capabilities.shell.needsApproval,
            parsed.capabilities?.shell?.removeFromNeedsApproval,
          ),
          cwdOnly: parsed.capabilities?.shell?.cwdOnly ?? DEFAULT_MANIFEST.capabilities.shell.cwdOnly,
          removeFromBlocked: parsed.capabilities?.shell?.removeFromBlocked ?? [],
          removeFromNeedsApproval: parsed.capabilities?.shell?.removeFromNeedsApproval ?? [],
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
