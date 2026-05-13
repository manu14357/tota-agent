import type { ProviderConfig, ProviderName } from './config.js';

export interface ProviderModelCatalog {
  models: string[];
  recommendedModel: string;
}

const MAX_MODEL_OPTIONS = 7;

const OPENAI_PREFERRED_MODELS = [
  'gpt-5.2',
  'gpt-5.2-chat-latest',
  'gpt-5.2-pro',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-oss-120b',
  'gpt-oss-20b',
] as const;

const ANTHROPIC_PREFERRED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
] as const;

const DEEPSEEK_PREFERRED_MODELS = [
  'deepseek-chat',
  'deepseek-reasoner',
] as const;

const GROK_PREFERRED_MODELS = [
  'grok-4',
  'grok-4-latest',
  'grok-4.20',
  'grok-3',
  'grok-3-latest',
] as const;

const OLLAMA_CLOUD_PREFERRED_MODELS = [
  'gpt-oss:120b',
  'gpt-oss:120b-cloud',
  'gpt-oss:20b',
] as const;

const OLLAMA_LOCAL_PREFERRED_MODELS = [
  'qwen3.5:2b',
  'qwen3:8b',
  'qwen3:4b',
  'qwen3:2b',
  'llama3.2:latest',
  'llama3.2:3b',
  'gpt-oss:20b',
  'gpt-oss:120b',
] as const;

const MIMO_PREFERRED_MODELS = [
  'mimo-v2.5-pro',
  'mimo-v2.5',
  'mimo-v2-pro',
  'mimo-v2-omni',
  'mimo-v2-flash',
] as const;

const MIMO_TOKEN_PLAN_PREFERRED_MODELS = MIMO_PREFERRED_MODELS;

const NVIDIA_PREFERRED_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'moonshotai/kimi-k2.5',
  'minimaxai/minimax-m2.5',
  'z-ai/glm5',
] as const;

const OPENAI_COMPAT_PREFERRED_MODELS = [] as const;

export class ProviderModelFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderModelFetchError';
  }
}

interface OpenAIModelResponse {
  data?: Array<{ id?: string }>;
}

interface AnthropicModelResponse {
  data?: Array<{ id?: string }>;
}

interface XAIModelResponse {
  data?: Array<{
    id?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  }>;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

async function fetchJson<T>(url: string, init: RequestInit, invalidMessage: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderModelFetchError(invalidMessage);
  }

  if (!response.ok) {
    throw new ProviderModelFetchError(invalidMessage);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new ProviderModelFetchError('tota could not read the model list returned by this provider.');
  }
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function prioritizeModels(models: string[], preferred: readonly string[]): string[] {
  const preferredSet = new Set(preferred);
  const preferredMatches = preferred.filter((model) => models.includes(model));
  const others = models
    .filter((model) => !preferredSet.has(model))
    .sort((a, b) => a.localeCompare(b));

  return [...preferredMatches, ...others];
}

function limitModels(models: string[]): string[] {
  return models.slice(0, MAX_MODEL_OPTIONS);
}

function isOpenAIChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (
    lower.includes('image')
    || lower.includes('audio')
    || lower.includes('tts')
    || lower.includes('transcribe')
    || lower.includes('embedding')
    || lower.includes('moderation')
    || lower.includes('realtime')
    || lower.includes('whisper')
    || lower.includes('search')
    || lower.includes('computer')
  ) {
    return false;
  }

  return lower.startsWith('gpt-') || /^o\d/.test(lower);
}

function chooseRecommendedModel(
  provider: ProviderName,
  models: string[],
  currentModel?: string,
): string {
  const preferredByProvider: Record<ProviderName, readonly string[]> = {
    deepseek: DEEPSEEK_PREFERRED_MODELS,
    openai: OPENAI_PREFERRED_MODELS,
    anthropic: ANTHROPIC_PREFERRED_MODELS,
    grok: GROK_PREFERRED_MODELS,
    ollamaCloud: OLLAMA_CLOUD_PREFERRED_MODELS,
    ollamaLocal: OLLAMA_LOCAL_PREFERRED_MODELS,
    openaiCompat: OPENAI_COMPAT_PREFERRED_MODELS,
    mimo: MIMO_PREFERRED_MODELS,
    mimoTokenPlan: MIMO_TOKEN_PLAN_PREFERRED_MODELS,
    nvidia: NVIDIA_PREFERRED_MODELS,
  };

  for (const candidate of preferredByProvider[provider]) {
    if (models.includes(candidate)) {
      return candidate;
    }
  }

  if (currentModel && models.includes(currentModel)) {
    return currentModel;
  }

  return models[0];
}

export function buildModelCatalog(
  provider: ProviderName,
  models: string[],
  currentModel?: string,
): ProviderModelCatalog {
  const filtered = uniq(models);
  if (filtered.length === 0) {
    throw new ProviderModelFetchError('tota could not find any supported chat models for this provider.');
  }

  const recommendedModel = chooseRecommendedModel(provider, filtered, currentModel);
  const preferredByProvider: Record<ProviderName, readonly string[]> = {
    deepseek: DEEPSEEK_PREFERRED_MODELS,
    openai: OPENAI_PREFERRED_MODELS,
    anthropic: ANTHROPIC_PREFERRED_MODELS,
    grok: GROK_PREFERRED_MODELS,
    ollamaCloud: OLLAMA_CLOUD_PREFERRED_MODELS,
    ollamaLocal: OLLAMA_LOCAL_PREFERRED_MODELS,
    openaiCompat: OPENAI_COMPAT_PREFERRED_MODELS,
    mimo: MIMO_PREFERRED_MODELS,
    mimoTokenPlan: MIMO_TOKEN_PLAN_PREFERRED_MODELS,
    nvidia: NVIDIA_PREFERRED_MODELS,
  };

  const withoutRecommended = filtered.filter((model) => model !== recommendedModel);
  const prioritized = prioritizeModels(withoutRecommended, preferredByProvider[provider]);

  return {
    recommendedModel,
    models: limitModels(prioritized),
  };
}

async function fetchOpenAICompatModels(provider: ProviderName, config: ProviderConfig): Promise<ProviderModelCatalog> {
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  let errorMessage: string;
  if (provider === 'grok') {
    errorMessage = 'tota could not fetch models for this Grok key. Please re-enter it.';
  } else if (provider === 'deepseek') {
    errorMessage = 'tota could not fetch models for this DeepSeek key. Please re-enter it.';
  } else if (provider === 'openaiCompat') {
    errorMessage = 'tota could not fetch models from this server. Please check the base URL and try again.';
  } else {
    errorMessage = 'tota could not fetch models for this OpenAI key. Please re-enter it.';
  }

  const data = await fetchJson<OpenAIModelResponse>(
    `${trimTrailingSlash(config.baseUrl)}/models`,
    { headers },
    errorMessage,
  );

  const ids = (data.data ?? [])
    .map((model) => model.id?.trim() ?? '')
    .filter((id) => {
      if (provider === 'deepseek') {
        return id.startsWith('deepseek-');
      }
      if (provider === 'openaiCompat') {
        return id.length > 0;
      }
      return isOpenAIChatModel(id);
    });

  return buildModelCatalog(provider, ids, config.model);
}

async function fetchAnthropicModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  const data = await fetchJson<AnthropicModelResponse>(
    'https://api.anthropic.com/v1/models',
    {
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
    },
    'tota could not fetch models for this Anthropic key. Please re-enter it.',
  );

  const ids = (data.data ?? [])
    .map((model) => model.id?.trim() ?? '')
    .filter((id) => id.startsWith('claude-'));

  return buildModelCatalog('anthropic', ids, config.model);
}

async function fetchGrokModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  const data = await fetchJson<XAIModelResponse>(
    `${trimTrailingSlash(config.baseUrl)}/language-models`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    'tota could not fetch models for this Grok key. Please re-enter it.',
  );

  const ids = (data.data ?? [])
    .filter((model) => model.output_modalities?.includes('text') || model.output_modalities == null)
    .map((model) => model.id?.trim() ?? '')
    .filter((id) => id.startsWith('grok-'));

  return buildModelCatalog('grok', ids, config.model);
}

async function fetchOllamaCloudModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  const data = await fetchJson<OpenAIModelResponse>(
    `${trimTrailingSlash(config.baseUrl)}/models`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    'tota could not fetch models for this Ollama Cloud key. Please re-enter it.',
  );

  const ids = (data.data ?? [])
    .map((model) => model.id?.trim() ?? '')
    .filter(Boolean);

  return buildModelCatalog('ollamaCloud', ids, config.model);
}

async function fetchOllamaLocalModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  // Ollama's model list endpoint is always at <host>/api/tags regardless of
  // whether the user configured the OpenAI-compat base URL (/v1) or the
  // native base URL (/api).  Strip any trailing /v1 or /api path segment so
  // we always hit the right place.
  const ollamaBase = trimTrailingSlash(config.baseUrl).replace(/\/(v\d+|api)$/i, '');
  const data = await fetchJson<OllamaTagsResponse>(
    `${ollamaBase}/api/tags`,
    {},
    'tota could not fetch models from this Ollama Local server. Please check the base URL and try again.',
  );

  const ids = (data.models ?? [])
    .map((model) => model.model?.trim() || model.name?.trim() || '')
    .filter(Boolean);

  return buildModelCatalog('ollamaLocal', ids, config.model);
}

async function fetchMiMoModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  const data = await fetchJson<OpenAIModelResponse>(
    `${trimTrailingSlash(config.baseUrl)}/models`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    'tota could not fetch models for this MiMo key. Please re-enter it.',
  );

  const ids = (data.data ?? [])
    .map((model) => model.id?.trim() ?? '')
    .filter((id) => {
      const lower = id.toLowerCase();
      return lower.startsWith('mimo-') && !lower.includes('tts');
    });

  return buildModelCatalog('mimo', ids, config.model);
}

async function fetchMiMoTokenPlanModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  const data = await fetchJson<OpenAIModelResponse>(
    `${trimTrailingSlash(config.baseUrl)}/models`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    'tota could not fetch models for this MiMo Token Plan key. Please re-enter it.',
  );

  const ids = (data.data ?? [])
    .map((model) => model.id?.trim() ?? '')
    .filter((id) => {
      const lower = id.toLowerCase();
      return lower.startsWith('mimo-') && !lower.includes('tts');
    });

  return buildModelCatalog('mimoTokenPlan', ids, config.model);
}

async function fetchNvidiaModels(config: ProviderConfig): Promise<ProviderModelCatalog> {
  // NVIDIA NIM uses OpenAI-compatible /models endpoint
  try {
    const data = await fetchJson<OpenAIModelResponse>(
      `${trimTrailingSlash(config.baseUrl)}/models`,
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
      'tota could not fetch models for this NVIDIA API key. Please re-enter it.',
    );

    const ids = (data.data ?? [])
      .map((model) => model.id?.trim() ?? '')
      .filter((id) => id.length > 0 && !id.includes('embedding') && !id.includes('rerank'));

    if (ids.length > 0) {
      return buildModelCatalog('nvidia', ids, config.model);
    }
  } catch {
    // Fall through to static catalog if live fetch fails
  }

  // Static fallback catalog when API is unreachable or returns empty list
  const staticModels = [
    'nvidia/nemotron-3-super-120b-a12b',
    'moonshotai/kimi-k2.5',
    'minimaxai/minimax-m2.5',
    'z-ai/glm5',
  ];
  return buildModelCatalog('nvidia', staticModels, config.model);
}

export async function fetchProviderModelCatalog(
  provider: ProviderName,
  config: ProviderConfig,
): Promise<ProviderModelCatalog> {
  if (provider === 'anthropic') {
    return fetchAnthropicModels(config);
  }

  if (provider === 'grok') {
    return fetchGrokModels(config);
  }

  if (provider === 'ollamaCloud') {
    return fetchOllamaCloudModels(config);
  }

  if (provider === 'ollamaLocal') {
    return fetchOllamaLocalModels(config);
  }

  if (provider === 'openaiCompat') {
    return fetchOpenAICompatModels(provider, config);
  }

  if (provider === 'mimo') {
    return fetchMiMoModels(config);
  }

  if (provider === 'mimoTokenPlan') {
    return fetchMiMoTokenPlanModels(config);
  }

  if (provider === 'nvidia') {
    return fetchNvidiaModels(config);
  }

  return fetchOpenAICompatModels(provider, config);
}
