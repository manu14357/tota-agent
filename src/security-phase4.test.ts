import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PermissionManager, isDangerousSystemPath, getSensitivePathWarning } from './capabilities/permissions.js';

describe('Phase 4: permissions hardening', () => {
  let workDir: string;
  let totaHome: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tota-p4-test-'));
    totaHome = mkdtempSync(join(tmpdir(), 'tota-p4-home-'));
    process.env.TOTA_HOME = totaHome;
  });

  afterEach(() => {
    delete process.env.TOTA_HOME;
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    if (existsSync(totaHome)) rmSync(totaHome, { recursive: true, force: true });
  });

  describe('H10: sensitive path warning', () => {
    it('returns null for non-sensitive paths', () => {
      expect(getSensitivePathWarning('/home/user/projects')).toBeNull();
      expect(getSensitivePathWarning('/Users/alice/code')).toBeNull();
      expect(getSensitivePathWarning('/var/folders/abc')).toBeNull();
    });

    it('returns warning for SSH keys on Linux', () => {
      const warn = getSensitivePathWarning('/home/testuser/.ssh');
      if (process.platform === 'linux') {
        expect(warn).toMatch(/SSH/i);
      } else {
        // On macOS, /home paths are not under SENSITIVE_MACOS_PATHS
        expect(warn).toBeNull();
      }
    });

    it('returns warning for SSH keys in subdir on Linux', () => {
      const warn = getSensitivePathWarning('/home/testuser/.ssh/id_rsa');
      if (process.platform === 'linux') {
        expect(warn).toMatch(/SSH/i);
      } else {
        expect(warn).toBeNull();
      }
    });

    it('returns warning for AWS credentials on macOS', () => {
      const warn = getSensitivePathWarning('/Users/alice/.aws/credentials');
      if (process.platform === 'darwin') {
        expect(warn).toMatch(/AWS/i);
      } else {
        // On Linux, /Users paths are not under SENSITIVE_LINUX_PATHS
        expect(warn).toBeNull();
      }
    });

    it('returns warning for AWS credentials on Linux', () => {
      const warn = getSensitivePathWarning('/home/bob/.aws/credentials');
      if (process.platform === 'linux') {
        expect(warn).toMatch(/AWS/i);
      } else {
        expect(warn).toBeNull();
      }
    });

    it('does NOT match unrelated paths with similar names', () => {
      expect(getSensitivePathWarning('/home/testuser/myproject/.ssh-config')).toBeNull();
      expect(getSensitivePathWarning('/Users/alice/work/.aws-config')).toBeNull();
    });
  });

  describe('H11: per-channel autoApproveAll', () => {
    it('does not leak between channels', async () => {
      const pm = new PermissionManager();
      pm.setCurrentChannelId('cli');
      pm.setAutoApproveAll(true);
      expect(pm.isAutoApproveAll()).toBe(true);

      pm.setCurrentChannelId('telegram:12345');
      // Switching to telegram: should NOT inherit CLI's allow-all
      expect(pm.isAutoApproveAll()).toBe(false);

      // CLI mode is preserved
      pm.setCurrentChannelId('cli');
      expect(pm.isAutoApproveAll()).toBe(true);
    });

    it('setChannelMode updates the current channel', () => {
      const pm = new PermissionManager();
      pm.setCurrentChannelId('cli');
      pm.setChannelMode('cli', 'allow-all');
      expect(pm.isAutoApproveAll()).toBe(true);
      expect(pm.getChannelMode('cli')).toBe('allow-all');
    });

    it('setChannelMode does not affect other channels', () => {
      const pm = new PermissionManager();
      pm.setCurrentChannelId('cli');
      pm.setChannelMode('cli', 'allow-all');
      // Telegram's mode is unchanged
      expect(pm.getChannelMode('telegram:999')).toBe('ask-me');
    });

    it('isEffectiveAutoApprove respects per-channel mode', async () => {
      const pm = new PermissionManager();
      pm.setCurrentChannelId('cli');
      // CLI default is ask-me; a non-scoped fs access should be denied
      const result = await pm.checkFsAccess('/tmp/whatever', 'read');
      expect(result.allowed).toBe(false);
    });
  });

  describe('H12: user can remove default blocklist entries', () => {
    it('removeFromBlocked removes the default pattern from the merged list', async () => {
      const pm = new PermissionManager();
      // Simulate loading a manifest with a removal
      const mgr = pm as any;
      const merged = mgr.mergeDefaults({
        capabilities: {
          filesystem: { enabled: true, scopes: [] },
          shell: {
            enabled: true,
            blocked: [],
            autoApproved: [],
            needsApproval: [],
            cwdOnly: true,
            removeFromBlocked: ['shutdown *'],
          },
          git: { enabled: true, autoApproveRead: true, approveWrite: true },
        },
      });
      expect(merged.capabilities.shell.blocked).not.toContain('shutdown *');
      expect(merged.capabilities.shell.blocked).toContain('sudo *');
    });

    it('removeFromNeedsApproval removes the default pattern from the merged list', () => {
      const pm = new PermissionManager();
      const mgr = pm as any;
      const merged = mgr.mergeDefaults({
        capabilities: {
          filesystem: { enabled: true, scopes: [] },
          shell: {
            enabled: true,
            blocked: [],
            autoApproved: [],
            needsApproval: [],
            cwdOnly: true,
            removeFromNeedsApproval: ['docker *'],
          },
          git: { enabled: true, autoApproveRead: true, approveWrite: true },
        },
      });
      expect(merged.capabilities.shell.needsApproval).not.toContain('docker *');
      expect(merged.capabilities.shell.needsApproval).toContain('npm publish *');
    });

    it('default config without removals still has the full blocklist', () => {
      const pm = new PermissionManager();
      const mgr = pm as any;
      const merged = mgr.mergeDefaults({});
      expect(merged.capabilities.shell.blocked).toContain('shutdown *');
      expect(merged.capabilities.shell.blocked).toContain('sudo *');
    });
  });

  describe('M12: expanded blocklist coverage', () => {
    it('blocks powershell.exe with -Command', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('powershell.exe -Command "Get-Process"');
      expect(result.allowed).toBe(false);
    });

    it('blocks cmd.exe variants', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('cmd.exe /c rd /s /q evil');
      expect(result.allowed).toBe(false);
    });

    it('blocks pwsh', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('pwsh -Command "Get-Process"');
      expect(result.allowed).toBe(false);
    });

    it('blocks full Windows path to powershell', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -Command evil');
      expect(result.allowed).toBe(false);
    });

    it('still allows harmless commands', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('echo hello');
      expect(result.allowed).toBe(true);
    });
  });

  describe('C4 + H10: dangerous paths still throw', () => {
    it('addScope for /etc throws', () => {
      const pm = new PermissionManager();
      expect(() => pm.addScope('/etc', true, true)).toThrow(/sensitive system path/i);
    });

    it('addScope for /var/log throws', () => {
      const pm = new PermissionManager();
      expect(() => pm.addScope('/var/log', true, true)).toThrow(/sensitive system path/i);
    });

    it('isDangerousSystemPath catches /etc', () => {
      expect(isDangerousSystemPath('/etc')).toBe(true);
      expect(isDangerousSystemPath('/etc/passwd')).toBe(true);
    });
  });
});
