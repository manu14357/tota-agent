import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';

import { getTotaHome } from '../../utils/config.js';
import type { ProviderName } from '../../utils/config.js';

export async function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

export function looksLikeToken(value: string, minLength: number = 20): boolean {
  return value.length >= minLength && !/\s/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function validateApiKey(provider: ProviderName, value: string): string | null {
  if (provider === 'openai') {
    return /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'OpenAI keys must start with `sk-`, `sk-proj-`, or `sk-svcacct-`.';
  }

  if (provider === 'anthropic') {
    return /^sk-ant-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'Anthropic keys must start with `sk-ant-`.';
  }

  if (provider === 'deepseek') {
    return /^sk-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'DeepSeek keys must start with `sk-`.';
  }

  if (provider === 'grok') {
    return looksLikeToken(value)
      ? null
      : 'Grok keys must look like a real API token: long, no spaces, and not plain text.';
  }

  if (provider === 'groq') {
    return /^gsk_[A-Za-z0-9_-]{20,}$/.test(value)
      ? null
      : 'Groq keys must start with `gsk_`.';
  }

  if (provider === 'ollamaCloud') {
    return looksLikeToken(value)
      ? null
      : 'Ollama Cloud keys must look like a real API token: long, no spaces, and not plain text.';
  }

  if (provider === 'mimo') {
    return /^sk-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'MiMo keys must start with `sk-`.';
  }

  if (provider === 'mimoTokenPlan') {
    return /^tp-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'MiMo Token Plan keys must start with `tp-`.';
  }

  if (provider === 'nvidia') {
    return /^nvapi-[A-Za-z0-9_-]{20,}$/i.test(value)
      ? null
      : 'NVIDIA API keys must start with `nvapi-`.';
  }

  if (provider === 'openrouter') {
    return /^sk-or-[A-Za-z0-9_-]{16,}$/i.test(value)
      ? null
      : 'OpenRouter API keys must start with `sk-or-`.';
  }

  return null;
}

export function validateBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Base URL must start with http:// or https://.';
    }
    return null;
  } catch {
    return 'Please enter a valid URL.';
  }
}

export function validateModelName(value: string): string | null {
  if (!value.trim()) return 'Model name is required.';
  if (/\s/.test(value)) return 'Model name cannot contain spaces.';
  return null;
}

export async function promptValidatedValue(
  prompt: string,
  validator: (value: string) => string | null,
  existingValue?: string,
  options?: { allowSkip?: boolean },
): Promise<string | undefined> {
  while (true) {
    const value = await ask(prompt);
    if (!value) {
      if (existingValue) return existingValue;
      if (options?.allowSkip) return undefined;
      console.log(chalk.red('  A value is required here.'));
      continue;
    }

    const error = validator(value);
    if (!error) return value;

    console.log(chalk.red(`  ${error}`));
  }
}

export function appendToEnv(key: string, value: string): void {
  const envPath = join(getTotaHome(), '.env');
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }
  const lines = envContent.split('\n').filter((l: string) => !l.startsWith(`${key}=`) && l.trim() !== '');
  lines.push(`${key}=${value}`);
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
  process.env[key] = value;
}

export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}
