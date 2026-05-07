import { createOllama } from 'ollama-ai-provider';
import { BaseProvider } from './base.js';
import type { ProviderConfig } from '../utils/config.js';

export class OllamaProvider extends BaseProvider {
  readonly name: string;
  readonly model: string;
  private client: ReturnType<typeof createOllama>;
  private modelInstance: any;

  constructor(config: ProviderConfig) {
    super(config);
    this.name = config.name;
    this.model = config.model;

    const headers = config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : undefined;

    this.client = createOllama({
      baseURL: config.baseUrl,
      headers,
    });
    this.modelInstance = this.client(config.model);
  }

  async generateText(_prompt: string, _systemPrompt: string): Promise<never> {
    throw new Error('Use getModelInstance() with the AI SDK agent loop');
  }

  async *streamText(_prompt: string, _systemPrompt: string): AsyncIterable<never> {
    throw new Error('Use getModelInstance() with the AI SDK agent loop');
  }

  isAvailable(): boolean {
    if (!this.config.enabled) return false;
    if (this.name === 'ollamaLocal') {
      return this.config.baseUrl.length > 0 && this.config.model.length > 0;
    }
    return this.config.apiKey.length > 0 && this.config.baseUrl.length > 0;
  }

  getModelInstance() {
    return this.modelInstance;
  }
}
