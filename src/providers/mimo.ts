import { createDeepSeek } from '@ai-sdk/deepseek';
import { BaseProvider } from './base.js';
import type { ProviderConfig } from '../utils/config.js';

export class MiMoProvider extends BaseProvider {
  readonly name: string;
  readonly model: string;
  readonly isReasoner = true;
  private modelInstance: any;

  constructor(config: ProviderConfig) {
    super(config);
    this.name = config.name;
    this.model = config.model;

    // MiMo uses thinking/reasoning mode that returns reasoning_content.
    // createDeepSeek handles reasoning_content passthrough in message history;
    // createOpenAI strips it, causing MiMo's API to reject with 400.
    const client = createDeepSeek({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.modelInstance = client(config.model);
  }

  async generateText(_prompt: string, _systemPrompt: string): Promise<never> {
    throw new Error('Use getModelInstance() with the AI SDK agent loop');
  }

  async *streamText(_prompt: string, _systemPrompt: string): AsyncIterable<never> {
    throw new Error('Use getModelInstance() with the AI SDK agent loop');
  }

  isAvailable(): boolean {
    return this.config.apiKey.length > 0;
  }

  getModelInstance() {
    return this.modelInstance;
  }
}
