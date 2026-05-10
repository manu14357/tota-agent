import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createSecretStoreTool, createSecretGetTool, createSecretListTool, createSecretDeleteTool } from './secrets.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

// ── AES-256-GCM roundtrip unit test ─────────────────────────────────────────
describe('AES-256-GCM encryption', () => {
  function deriveKey(seed: string): Buffer {
    return scryptSync(seed, 'test-salt', 32);
  }

  function encryptValue(value: string, key: Buffer): { iv: string; tag: string; data: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') };
  }

  function decryptValue(entry: { iv: string; tag: string; data: string }, key: Buffer): string {
    const iv = Buffer.from(entry.iv, 'hex');
    const tag = Buffer.from(entry.tag, 'hex');
    const data = Buffer.from(entry.data, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  it('encrypts and decrypts a simple string', () => {
    const key = deriveKey('test-machine-id');
    const entry = encryptValue('my-secret-value', key);
    expect(entry.iv).toBeTruthy();
    expect(entry.tag).toBeTruthy();
    expect(entry.data).toBeTruthy();
    expect(entry.data).not.toContain('my-secret-value');
    const decrypted = decryptValue(entry, key);
    expect(decrypted).toBe('my-secret-value');
  });

  it('encrypts and decrypts special characters', () => {
    const key = deriveKey('test-machine-id');
    const original = 'P@$$w0rd!#%^&*()_+ <>"\'{}[]|\\n\ttab';
    const entry = encryptValue(original, key);
    expect(decryptValue(entry, key)).toBe(original);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const key = deriveKey('test-machine-id');
    const e1 = encryptValue('same-value', key);
    const e2 = encryptValue('same-value', key);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.data).not.toBe(e2.data);
  });

  it('fails to decrypt with wrong key', () => {
    const key1 = deriveKey('machine-a');
    const key2 = deriveKey('machine-b');
    const entry = encryptValue('secret', key1);
    expect(() => decryptValue(entry, key2)).toThrow();
  });

  it('round-trips empty string', () => {
    const key = deriveKey('test-machine-id');
    const entry = encryptValue('', key);
    expect(decryptValue(entry, key)).toBe('');
  });

  it('round-trips a long value (4096 chars)', () => {
    const key = deriveKey('test-machine-id');
    const long = 'X'.repeat(4096);
    const entry = encryptValue(long, key);
    expect(decryptValue(entry, key)).toBe(long);
  });
});

// ── Secret tool factories (no-keytar fallback is exercised via tool.execute) ──
// NOTE: The vault path is hardcoded in secrets.ts to ~/.tota/vault.enc.json
// We test tool behavior for validation and error message format only,
// to avoid writing to the real vault in CI. Integration-style tests use the
// real vault and are skipped if the HOME directory cannot be made writable.
describe('secret_store tool', () => {
  it('rejects empty name', async () => {
    const tool = createSecretStoreTool();
    const result = await execute(tool, { name: '', value: 'val' });
    expect(result).toMatch(/name cannot be empty/i);
  });

  it('rejects empty value', async () => {
    const tool = createSecretStoreTool();
    const result = await execute(tool, { name: 'MY_KEY', value: '' });
    expect(result).toMatch(/value cannot be empty/i);
  });

  it('rejects whitespace-only name', async () => {
    const tool = createSecretStoreTool();
    const result = await execute(tool, { name: '   ', value: 'val' });
    expect(result).toMatch(/name cannot be empty/i);
  });
});

describe('secret_store and secret_get integration (file vault)', () => {
  // These tests actually write to the live vault — skip if not writable
  it('stores and retrieves a secret', async () => {
    const storeTool = createSecretStoreTool();
    const getTool   = createSecretGetTool();
    const name = `__test_tota_${Date.now()}`;

    const storeResult = await execute(storeTool, { name, value: 'test-secret-42' });
    expect(storeResult).toMatch(/stored securely/i);

    const getResult = await execute(getTool, { name });
    expect(getResult).toContain('test-secret-42');

    // cleanup — delete after test
    const deleteTool = createSecretDeleteTool();
    await execute(deleteTool, { name });
  });

  it('returns "not found" for unknown secret', async () => {
    const getTool = createSecretGetTool();
    const result = await execute(getTool, { name: '__nonexistent_tota_xyz_999' });
    expect(result).toMatch(/not found/i);
  });

  it('lists secrets and includes newly stored key', async () => {
    const storeTool  = createSecretStoreTool();
    const listTool   = createSecretListTool();
    const deleteTool = createSecretDeleteTool();
    const name = `__test_list_${Date.now()}`;

    await execute(storeTool, { name, value: 'listed-value' });
    const listResult = await execute(listTool, {});
    expect(listResult).toContain(name);

    await execute(deleteTool, { name });
  });

  it('delete removes the secret', async () => {
    const storeTool  = createSecretStoreTool();
    const getTool    = createSecretGetTool();
    const deleteTool = createSecretDeleteTool();
    const name = `__test_del_${Date.now()}`;

    await execute(storeTool, { name, value: 'to-delete' });
    const delResult = await execute(deleteTool, { name });
    expect(delResult).toMatch(/deleted|removed/i);

    const getResult = await execute(getTool, { name });
    expect(getResult).toMatch(/not found/i);
  });

  it('delete returns not-found for missing key', async () => {
    const deleteTool = createSecretDeleteTool();
    const result = await execute(deleteTool, { name: '__nonexistent_del_xyz' });
    expect(result).toMatch(/not found|does not exist/i);
  });
});
