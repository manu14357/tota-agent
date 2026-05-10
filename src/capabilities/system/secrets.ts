import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { logger } from '../../utils/logger.js';

const SERVICE = 'tota-agent';
const VAULT_PATH = join(homedir(), '.tota', 'vault.enc.json');

// ── Keytar (optional native OS keychain) ────────────────────────────────────
let keytar: typeof import('keytar') | null = null;
try {
  keytar = (await import('keytar')).default ?? (await import('keytar'));
} catch {
  logger.info('keytar not available — using encrypted file vault fallback');
}

// ── AES-256-GCM file-based vault fallback ───────────────────────────────────
function deriveVaultKey(): Buffer {
  const machineId = `${hostname()}-${homedir()}-tota-vault-v1`;
  return scryptSync(machineId, 'tota-salt-2024', 32);
}

interface VaultEntry { iv: string; tag: string; data: string }
interface VaultFile { [name: string]: VaultEntry }

function readVault(): VaultFile {
  if (!existsSync(VAULT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeVault(vault: VaultFile): void {
  mkdirSync(join(homedir(), '.tota'), { recursive: true });
  writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), { mode: 0o600 });
}

function encryptValue(value: string): VaultEntry {
  const key = deriveVaultKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

function decryptValue(entry: VaultEntry): string {
  const key = deriveVaultKey();
  const iv = Buffer.from(entry.iv, 'hex');
  const tag = Buffer.from(entry.tag, 'hex');
  const data = Buffer.from(entry.data, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ── Store ────────────────────────────────────────────────────────────────────
async function storeSecret(name: string, value: string): Promise<void> {
  if (keytar) {
    await keytar.setPassword(SERVICE, name, value);
  } else {
    const vault = readVault();
    vault[name] = encryptValue(value);
    writeVault(vault);
  }
}

async function getSecret(name: string): Promise<string | null> {
  if (keytar) {
    return keytar.getPassword(SERVICE, name);
  } else {
    const vault = readVault();
    const entry = vault[name];
    if (!entry) return null;
    try {
      return decryptValue(entry);
    } catch {
      return null;
    }
  }
}

async function listSecrets(): Promise<string[]> {
  if (keytar) {
    const credentials = await keytar.findCredentials(SERVICE);
    return credentials.map(c => c.account);
  } else {
    return Object.keys(readVault());
  }
}

async function deleteSecret(name: string): Promise<boolean> {
  if (keytar) {
    return keytar.deletePassword(SERVICE, name);
  } else {
    const vault = readVault();
    if (!vault[name]) return false;
    delete vault[name];
    writeVault(vault);
    return true;
  }
}

// ── Tool factories ───────────────────────────────────────────────────────────
export function createSecretStoreTool() {
  return tool({
    description: 'Store a secret (API key, password, token) securely in the OS keychain (macOS Keychain, GNOME Keyring, Windows Credential Manager) or an encrypted local vault. Use this instead of writing secrets to files.',
    inputSchema: zodSchema(z.object({
      name: z.string().describe('Secret name / key (e.g. "STRIPE_KEY", "MY_PASSWORD")'),
      value: z.string().describe('The secret value to store'),
    })),
    execute: async ({ name, value }) => {
      if (!name.trim()) return 'Error: Secret name cannot be empty.';
      if (!value.trim()) return 'Error: Secret value cannot be empty.';
      try {
        await storeSecret(name.trim(), value);
        const backend = keytar ? 'OS keychain' : 'encrypted local vault';
        logger.info({ name }, 'Secret stored');
        return `Secret "${name}" stored securely in ${backend}.`;
      } catch (err: any) {
        return `Error storing secret: ${err.message}`;
      }
    },
  });
}

export function createSecretGetTool() {
  return tool({
    description: 'Retrieve a stored secret by name from the secure vault.',
    inputSchema: zodSchema(z.object({
      name: z.string().describe('Secret name to retrieve'),
    })),
    execute: async ({ name }) => {
      try {
        const value = await getSecret(name.trim());
        if (value === null) return `Secret "${name}" not found in vault.`;
        logger.info({ name }, 'Secret retrieved');
        return `Secret "${name}": ${value}`;
      } catch (err: any) {
        return `Error retrieving secret: ${err.message}`;
      }
    },
  });
}

export function createSecretListTool() {
  return tool({
    description: 'List all secret names stored in the vault (values are not shown).',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      try {
        const names = await listSecrets();
        if (names.length === 0) return 'No secrets stored in vault.';
        const backend = keytar ? 'OS keychain' : 'encrypted local vault';
        return `Secrets stored in ${backend} (${names.length}):\n${names.map(n => `  • ${n}`).join('\n')}`;
      } catch (err: any) {
        return `Error listing secrets: ${err.message}`;
      }
    },
  });
}

export function createSecretDeleteTool() {
  return tool({
    description: 'Delete a secret from the vault by name.',
    inputSchema: zodSchema(z.object({
      name: z.string().describe('Secret name to delete'),
    })),
    execute: async ({ name }) => {
      try {
        const deleted = await deleteSecret(name.trim());
        if (!deleted) return `Secret "${name}" not found in vault.`;
        logger.info({ name }, 'Secret deleted');
        return `Secret "${name}" deleted from vault.`;
      } catch (err: any) {
        return `Error deleting secret: ${err.message}`;
      }
    },
  });
}
