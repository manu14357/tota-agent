import chalk from 'chalk';

import { isProviderConfigured } from '../../utils/config.js';
import type { TotaConfig, ProviderName } from '../../utils/config.js';
import { selectWithArrowKeys } from '../../utils/arrow-select.js';
import { ProviderModelFetchError, fetchProviderModelCatalog } from '../../utils/provider-models.js';
import { ask, maskKey, validateApiKey, validateBaseUrl, validateModelName, promptValidatedValue } from './prompts.js';

export const PROVIDER_OPTIONS: Array<{ key: ProviderName; label: string }> = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'grok', label: 'Grok (xAI)' },
  { key: 'groq', label: 'Groq' },
  { key: 'ollamaCloud', label: 'Ollama Cloud' },
  { key: 'ollamaLocal', label: 'Ollama Local' },
  { key: 'openaiCompat', label: 'OpenAI Compilations' },
  { key: 'mimo', label: 'MiMo (Xiaomi)' },
  { key: 'mimoTokenPlan', label: 'MiMo Token Plan (Xiaomi)' },
  { key: 'nvidia', label: 'NVIDIA NIM' },
  { key: 'openrouter', label: 'OpenRouter' },
];

export function getConfiguredProviderNames(config: TotaConfig): ProviderName[] {
  return PROVIDER_OPTIONS
    .map((option) => option.key)
    .filter((key) => isProviderConfigured(config.providers[key]));
}

export function getProviderLabel(name: ProviderName): string {
  return PROVIDER_OPTIONS.find((option) => option.key === name)?.label || name;
}

export function parseProviderSelection(input: string): ProviderName[] | null {
  const values = input.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) return [];

  const selected: ProviderName[] = [];
  for (const value of values) {
    const index = parseInt(value, 10);
    if (isNaN(index) || index < 1 || index > PROVIDER_OPTIONS.length) {
      return null;
    }
    const provider = PROVIDER_OPTIONS[index - 1].key;
    if (!selected.includes(provider)) {
      selected.push(provider);
    }
  }
  return selected;
}

export async function chooseProvidersToConfigure(config: TotaConfig, isReconfig: boolean): Promise<ProviderName[]> {
  const configured = getConfiguredProviderNames(config);

  while (true) {
    for (let i = 0; i < PROVIDER_OPTIONS.length; i++) {
      const option = PROVIDER_OPTIONS[i];
      const status = configured.includes(option.key) ? ' (configured)' : '';
      console.log(chalk.white(`    ${i + 1}. ${option.label}${status}`));
    }
    console.log('');

    const prompt = isReconfig
      ? chalk.white('  Choose providers to configure [comma-separated, Enter keeps current]: ')
      : chalk.white('  Choose providers to configure [comma-separated, Enter for DeepSeek]: ');

    const input = await ask(prompt);
    const parsed = parseProviderSelection(input);
    if (parsed === null) {
      console.log(chalk.red('  Please choose valid provider numbers, like `1` or `1,3,5`.'));
      console.log('');
      continue;
    }

    if (parsed.length > 0) return parsed;
    if (!isReconfig) return ['deepseek'];
    return configured.length > 0 ? configured : ['deepseek'];
  }
}

export async function chooseDefaultProvider(config: TotaConfig): Promise<void> {
  const configured = getConfiguredProviderNames(config);

  if (configured.length === 0) {
    return;
  }

  if (configured.length === 1) {
    config.providers.default = configured[0];
    console.log(chalk.dim(`  Default provider set to ${getProviderLabel(configured[0])}`));
    return;
  }

  const suggested = configured.includes('deepseek') ? 'deepseek' : configured[0];

  console.log('');
  console.log(chalk.bold.white('  Default Provider'));
  console.log(chalk.dim('  Select the LLM provider tota should use first.'));
  console.log('');
  for (let i = 0; i < configured.length; i++) {
    const provider = configured[i];
    const recommended = provider === suggested ? ' (recommended)' : '';
    const current = provider === config.providers.default ? ' (current)' : '';
    console.log(chalk.white(`    ${i + 1}. ${getProviderLabel(provider)}${recommended}${current}`));
  }
  console.log('');

  while (true) {
    const choice = await ask(chalk.white(`  Choose [1-${configured.length}] [Enter for ${getProviderLabel(suggested)}]: `));
    if (!choice) {
      config.providers.default = suggested;
      return;
    }

    const num = parseInt(choice, 10);
    if (num >= 1 && num <= configured.length) {
      config.providers.default = configured[num - 1];
      return;
    }

    console.log(chalk.red('  Please choose a valid number from the list above.'));
  }
}

export async function chooseProviderModel(
  providerLabel: string,
  recommendedModel: string,
  models: string[],
): Promise<string> {
  const selection = await selectWithArrowKeys(
    `${providerLabel} Models`,
    [
      {
        value: '__default__',
        label: `Use provider default (${recommendedModel})`,
      },
      ...models.map((model) => ({
        value: model,
        label: model,
      })),
      {
        value: '__custom__',
        label: 'Enter a custom model name',
      },
    ],
  );

  if (!selection || selection === '__default__') {
    return recommendedModel;
  }

  if (selection !== '__custom__') {
    return selection;
  }

  while (true) {
    const customModel = await ask(chalk.white(`  ${providerLabel} model [Enter or "none" for ${recommendedModel}]: `));
    if (!customModel || customModel.toLowerCase() === 'none') {
      return recommendedModel;
    }

    const error = validateModelName(customModel);
    if (!error) {
      return customModel;
    }

    console.log(chalk.red(`  ${error}`));
  }
}

export async function promptApiKeyWithModelSelection(
  config: TotaConfig,
  provider: ProviderName,
  providerLabel: string,
  prompt: string,
  isReconfig: boolean,
): Promise<{ apiKey?: string; model?: string; skipped: boolean }> {
  const existingConfig = config.providers[provider];

  while (true) {
    const value = await ask(prompt);
    if (!value) {
      if (isReconfig && existingConfig.apiKey) {
        return {
          apiKey: existingConfig.apiKey,
          model: existingConfig.model,
          skipped: true,
        };
      }

      return { skipped: true };
    }

    const formatError = validateApiKey(provider, value);
    if (formatError) {
      console.log(chalk.red(`  ${formatError}`));
      continue;
    }

    console.log(chalk.dim(`  Validating ${providerLabel} and fetching models...`));
    try {
      const catalog = await fetchProviderModelCatalog(provider, {
        ...existingConfig,
        apiKey: value,
      });
      const model = await chooseProviderModel(
        providerLabel,
        catalog.recommendedModel,
        catalog.models,
      );
      return { apiKey: value, model, skipped: false };
    } catch (error) {
      const message = error instanceof ProviderModelFetchError
        ? error.message
        : `tota could not fetch models for ${providerLabel}. Please re-enter the key.`;
      console.log(chalk.red(`  ${message}`));
    }
  }
}

export async function promptOllamaLocalModelSelection(config: TotaConfig): Promise<{ baseUrl?: string; model?: string; skipped: boolean }> {
  const existingConfig = config.providers.ollamaLocal;

  while (true) {
    const baseUrl = (await promptValidatedValue(
      chalk.white(`  Ollama Local base URL [${existingConfig.baseUrl}]: `),
      validateBaseUrl,
      existingConfig.baseUrl,
    ))!;

    console.log(chalk.dim('  Fetching Ollama Local models...'));
    try {
      const catalog = await fetchProviderModelCatalog('ollamaLocal', {
        ...existingConfig,
        baseUrl,
      });
      const model = await chooseProviderModel(
        'Ollama Local',
        catalog.recommendedModel,
        catalog.models,
      );
      return { baseUrl, model, skipped: false };
    } catch (error) {
      const message = error instanceof ProviderModelFetchError
        ? error.message
        : 'tota could not fetch Ollama Local models. Please check the base URL and try again.';
      console.log(chalk.red(`  ${message}`));
    }
  }
}

export async function promptOpenAICompatSetup(config: TotaConfig, isReconfig: boolean): Promise<{ baseUrl?: string; apiKey?: string; model?: string; skipped: boolean }> {
  const existingConfig = config.providers.openaiCompat;

  const baseUrl = (await promptValidatedValue(
    chalk.white(`  Server base URL${isReconfig && existingConfig.baseUrl ? ` [${existingConfig.baseUrl}]` : ''}: `),
    validateBaseUrl,
    existingConfig.baseUrl,
  ))!;
  if (!baseUrl) return { skipped: true };

  const apiKeyPrompt = isReconfig && existingConfig.apiKey
    ? chalk.white(`  API key (optional, press Enter to keep current) [${maskKey(existingConfig.apiKey)}]: `)
    : chalk.white('  API key (optional, press Enter to skip): ');
  const apiKey = await ask(apiKeyPrompt);
  const resolvedApiKey = apiKey || existingConfig.apiKey || '';

  console.log(chalk.dim('  Fetching models from server...'));
  try {
    const catalog = await fetchProviderModelCatalog('openaiCompat', {
      ...existingConfig,
      baseUrl,
      apiKey: resolvedApiKey,
    });
    const model = await chooseProviderModel(
      'OpenAI Compilations',
      catalog.recommendedModel,
      catalog.models,
    );
    return { baseUrl, apiKey: resolvedApiKey, model, skipped: false };
  } catch {
    console.log(chalk.yellow('  Could not fetch models from this server. You can enter the model name manually.'));
    const model = (await promptValidatedValue(
      chalk.white('  Model name: '),
      validateModelName,
    ))!;
    if (!model) return { baseUrl, apiKey: resolvedApiKey, model: existingConfig.model, skipped: false };
    return { baseUrl, apiKey: resolvedApiKey, model, skipped: false };
  }
}
