import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { PermissionManager, isDangerousSystemPath } from './capabilities/permissions.js';
import { SkillLoader } from './skills/loader.js';
import { homedir } from 'node:os';

describe('Phase 1 security fixes', () => {
  let workDir: string;
  let totaHome: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tota-sec-test-'));
    totaHome = mkdtempSync(join(tmpdir(), 'tota-home-'));
    process.env.TOTA_HOME = totaHome;
  });

  afterEach(() => {
    delete process.env.TOTA_HOME;
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    if (existsSync(totaHome)) rmSync(totaHome, { recursive: true, force: true });
  });

  describe('C2: shell command injection via metacharacters', () => {
    it('blocks sudo chained after echo', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('echo hello; sudo rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/sudo/i);
    });

    it('blocks rm -rf chained via &&', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('ls /tmp && rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/rm -rf/i);
    });

    it('blocks sudo chained via ||', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('false || sudo reboot');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/sudo/i);
    });

    it('blocks shutdown chained via pipe', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('cat /etc/hosts | shutdown now');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/shutdown/i);
    });

    it('still allows safe commands without metachars', async () => {
      const pm = new PermissionManager();
      // 'ls' is in the default autoApproved list, so this should auto-approve
      const result = await pm.checkShellCommand('ls -la');
      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(false);
    });

    it('auto-approves simple echo', async () => {
      const pm = new PermissionManager();
      const result = await pm.checkShellCommand('echo hello');
      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(false);
    });
  });

  describe('C3: skill name sanitization', () => {
    it('rejects skill name with path traversal', () => {
      const loader = new SkillLoader();
      expect(() => loader.saveSkill('../escape', 'content')).toThrow(/Invalid skill name/);
    });

    it('rejects skill name with slash', () => {
      const loader = new SkillLoader();
      expect(() => loader.saveSkill('foo/bar', 'content')).toThrow(/Invalid skill name/);
    });

    it('rejects skill name with spaces', () => {
      const loader = new SkillLoader();
      expect(() => loader.saveSkill('foo bar', 'content')).toThrow(/Invalid skill name/);
    });

    it('accepts a valid skill name', () => {
      const loader = new SkillLoader();
      expect(() => loader.saveSkill('my-cool_skill.v2', 'content')).not.toThrow();
    });
  });

  describe('C4: dangerous system path denylist', () => {
    it('refuses to grant scope for /etc', () => {
      expect(isDangerousSystemPath('/etc')).toBe(true);
      expect(isDangerousSystemPath('/etc/passwd')).toBe(true);
      expect(isDangerousSystemPath('/etc/sudoers.d')).toBe(true);
    });

    it('refuses to grant scope for /proc', () => {
      expect(isDangerousSystemPath('/proc')).toBe(true);
      expect(isDangerousSystemPath('/proc/sys')).toBe(true);
      expect(isDangerousSystemPath('/proc/sysrq-trigger')).toBe(true);
    });

    it('refuses to grant scope for /sys', () => {
      expect(isDangerousSystemPath('/sys')).toBe(true);
      expect(isDangerousSystemPath('/sys/firmware')).toBe(true);
    });

    it('refuses to grant scope for /boot', () => {
      expect(isDangerousSystemPath('/boot')).toBe(true);
    });

    it('refuses to grant scope for /dev', () => {
      expect(isDangerousSystemPath('/dev')).toBe(true);
      expect(isDangerousSystemPath('/dev/sda')).toBe(true);
    });

    it('allows normal user paths', () => {
      expect(isDangerousSystemPath('/Users/alice/projects')).toBe(false);
      expect(isDangerousSystemPath('/home/bob/documents')).toBe(false);
      expect(isDangerousSystemPath('/tmp/foo')).toBe(false);
    });

    it('throws when addScope is called for /etc', () => {
      const pm = new PermissionManager();
      expect(() => pm.addScope('/etc', true, true)).toThrow(/sensitive system path/i);
    });

    it('throws when addScope is called for /proc', () => {
      const pm = new PermissionManager();
      expect(() => pm.addScope('/proc/sys', false, true)).toThrow(/sensitive system path/i);
    });

    it('allows addScope for non-dangerous paths', () => {
      const pm = new PermissionManager();
      expect(() => pm.addScope(workDir, true, true)).not.toThrow();
    });
  });

  describe('C5: symlink TOCTOU re-validation on file tools', () => {
    it('write_file rejects when file is a symlink to out-of-scope', async () => {
      const allowedDir = join(workDir, 'allowed');
      mkdirSync(allowedDir, { recursive: true });
      const outOfScope = join(workDir, 'secret');
      mkdirSync(outOfScope, { recursive: true });
      const target = join(outOfScope, 'protected.txt');
      writeFileSync(target, 'do not touch');

      const linkPath = join(allowedDir, 'sneaky.txt');
      symlinkSync(target, linkPath);

      // Use a real PermissionManager configured to allow writes in allowedDir
      const pm = new PermissionManager();
      // Save manifest with the allowed scope (writeFile happens in beforeEach cleanup)
      // We need to inject a scope without re-reading the persisted file.
      (pm as any).manifest.capabilities.filesystem.scopes = [
        { path: allowedDir, read: true, write: true },
      ];

      // Import the tool factory
      const { createWriteFileTool } = await import('./capabilities/filesystem/write-file.js');
      const tool = createWriteFileTool(pm, () => workDir);
      // Invoke the tool's execute fn (the tool is from the AI SDK)
      const result = await (tool as any).execute({
        path: linkPath,
        content: 'pwned',
      });
      // C5: The symlink target is /outside the allowed scope, so write must be refused.
      // Note: in this test we used the resolved path explicitly; the check may
      // not trip if the resolved path resolves to target which is also under workDir.
      // Adjust assertion based on actual scope resolution.
      const content = readFileSync(target, 'utf-8');
      // The target IS in workDir but NOT in allowedDir — the recheck should reject
      expect(content).toBe('do not touch');
      expect(result).toMatch(/symlink|Permission denied/i);
    });
  });
});
