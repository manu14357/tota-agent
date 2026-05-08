import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { config as loadDotenv } from 'dotenv';

const TOTA_HOME = join(homedir(), '.tota');

loadDotenv();
const totaEnvPath = join(TOTA_HOME, '.env');
if (existsSync(totaEnvPath)) {
  loadDotenv({ path: totaEnvPath, override: true });
}

export function getTotaHome(): string {
  return process.env.TOTA_HOME || TOTA_HOME;
}

export function getMemoryDir(): string {
  return join(getTotaHome(), 'memory');
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
}

export interface TelegramAccessUser {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  requestedAt?: string;
  approvedAt: string;
}

export interface TelegramPendingRequest {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  requestedAt: string;
  pairingCode?: string;
}

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'grok'
  | 'ollamaCloud'
  | 'ollamaLocal'
  | 'openaiCompat'
  | 'mimo'
  | 'mimoTokenPlan';

export interface LoopGuardConfig {
  /** Max LLM steps per request (default 50). Raise for complex multi-tool tasks. */
  maxSteps: number;
  /** Hard abort after this many total tool calls (default 100). */
  absoluteMax: number;
  /** Hard abort after this many failed tool calls (default 25). */
  failedAbsoluteMax: number;
  /** Abort when same tool called with identical params N times in a row (default 5). */
  identicalThreshold: number;
  /** Abort when same tool keeps failing N times in a row (default 8). */
  similarThreshold: number;
  /** Warn/ask user when same tool is called N times in a row (default 10). */
  sameToolThreshold: number;
  /** Abort after N consecutive steps with no tool calls (reasoning-only loops, default 10). */
  noActionMax: number;
  /** Abort when output text is >70% identical for N steps in a row (default 3). */
  textRepeatThreshold: number;
}

export interface WebSearchConfig {
  enabled: boolean;
  /** Provider: 'brave' | 'serper' | 'tavily' (auto-detected from env vars). */
  provider: 'brave' | 'serper' | 'tavily' | 'auto';
  apiKey: string;
  maxResults: number;
}

export interface MCPServerConfig {
  name: string;
  url: string;
  apiKey?: string;
  enabled: boolean;
}

export interface TotaConfig {
  identity: {
    name: string;
    owner: string;
    creator?: string;
  };
  providers: {
    default: ProviderName;
    openai: ProviderConfig;
    anthropic: ProviderConfig;
    deepseek: ProviderConfig;
    grok: ProviderConfig;
    ollamaCloud: ProviderConfig;
    ollamaLocal: ProviderConfig;
    openaiCompat: ProviderConfig;
    mimo: ProviderConfig;
    mimoTokenPlan: ProviderConfig;
  };
  channels: {
    telegram: {
      enabled: boolean;
      botToken: string;
      webhookUrl?: string;
      allowedChatIds?: number[];
      streaming?: boolean;
      admins: TelegramAccessUser[];
      members: TelegramAccessUser[];
      pending: TelegramPendingRequest[];
      pairedUserId?: number;
      pairedChatId?: number;
      pairedUsername?: string;
    };
    api: {
      enabled: boolean;
      port: number;
      apiKey: string;
    };
  };
  loopGuard: LoopGuardConfig;
  webSearch: WebSearchConfig;
  mcp: {
    servers: MCPServerConfig[];
  };
  github: {
    username: string;
    email: string;
    defaultOwner: string;
    defaultRepo: string;
  };
  memory: {
    shortTermMaxMessages: number;
    secondBrain: {
      enabled: boolean;
      maxRecords: number;
    };
  };
  heartbeat: {
    intervalMinutes: number;
  };
  tokens: {
    dailyBudget: number;
  };
}

function getEnv(key: string, fallback: string = ''): string {
  return process.env[key] || fallback;
}

function getEnvNum(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function getEnvBool(key: string, fallback: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (val === 'true') return true;
  if (val === 'false') return false;
  return fallback;
}

export function getDefaultConfig(): TotaConfig {
  const home = getTotaHome();
  return {
    identity: {
      name: getEnv('TOTA_NAME', 'tota'),
      owner: getEnv('TOTA_OWNER', ''),
      creator: getEnv('TOTA_CREATOR', ''),
    },
    providers: {
      default: getEnv('DEFAULT_PROVIDER', 'deepseek') as ProviderName,
      openai: {
        name: 'openai',
        apiKey: getEnv('OPENAI_API_KEY', ''),
        baseUrl: getEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        model: getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
        enabled: getEnvBool('OPENAI_ENABLED', true),
      },
      anthropic: {
        name: 'anthropic',
        apiKey: getEnv('ANTHROPIC_API_KEY', ''),
        baseUrl: getEnv('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
        model: getEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
        enabled: getEnvBool('ANTHROPIC_ENABLED', true),
      },
      deepseek: {
        name: 'deepseek',
        apiKey: getEnv('DEEPSEEK_API_KEY', ''),
        baseUrl: getEnv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
        model: getEnv('DEEPSEEK_MODEL', 'deepseek-chat'),
        enabled: getEnvBool('DEEPSEEK_ENABLED', true),
      },
      grok: {
        name: 'grok',
        apiKey: getEnv('GROK_API_KEY', ''),
        baseUrl: getEnv('GROK_BASE_URL', 'https://api.x.ai/v1'),
        model: getEnv('GROK_MODEL', 'grok-4'),
        enabled: getEnvBool('GROK_ENABLED', true),
      },
      ollamaCloud: {
        name: 'ollamaCloud',
        apiKey: getEnv('OLLAMA_CLOUD_API_KEY', ''),
        baseUrl: getEnv('OLLAMA_CLOUD_BASE_URL', 'https://ollama.com/v1'),
        model: getEnv('OLLAMA_CLOUD_MODEL', 'gpt-oss:120b'),
        enabled: getEnvBool('OLLAMA_CLOUD_ENABLED', true),
      },
      ollamaLocal: {
        name: 'ollamaLocal',
        apiKey: '',
        baseUrl: getEnv('OLLAMA_LOCAL_BASE_URL', 'http://127.0.0.1:11434/v1'),
        model: getEnv('OLLAMA_LOCAL_MODEL', 'qwen3.5:2b'),
        enabled: getEnvBool('OLLAMA_LOCAL_ENABLED', true),
      },
      openaiCompat: {
        name: 'openaiCompat',
        apiKey: getEnv('OPENAI_COMPAT_API_KEY', ''),
        baseUrl: getEnv('OPENAI_COMPAT_BASE_URL', ''),
        model: getEnv('OPENAI_COMPAT_MODEL', ''),
        enabled: getEnvBool('OPENAI_COMPAT_ENABLED', false),
      },
      mimo: {
        name: 'mimo',
        apiKey: getEnv('MIMO_API_KEY', ''),
        baseUrl: getEnv('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1'),
        model: getEnv('MIMO_MODEL', 'mimo-v2.5-pro'),
        enabled: getEnvBool('MIMO_ENABLED', true),
      },
      mimoTokenPlan: {
        name: 'mimoTokenPlan',
        apiKey: getEnv('MIMO_TOKEN_PLAN_API_KEY', ''),
        baseUrl: getEnv('MIMO_TOKEN_PLAN_BASE_URL', 'https://token-plan-cn.xiaomimimo.com/v1'),
        model: getEnv('MIMO_TOKEN_PLAN_MODEL', 'mimo-v2.5-pro'),
        enabled: getEnvBool('MIMO_TOKEN_PLAN_ENABLED', false),
      },
    },
    channels: {
      telegram: {
        enabled: getEnvBool('TELEGRAM_ENABLED', false),
        botToken: getEnv('TELEGRAM_BOT_TOKEN', ''),
        webhookUrl: getEnv('TELEGRAM_WEBHOOK_URL', ''),
        allowedChatIds: getEnv('TELEGRAM_ALLOWED_CHAT_IDS', '')
          .split(',')
          .filter(Boolean)
          .map(Number),
        streaming: getEnvBool('TELEGRAM_STREAMING', true),
        admins: [],
        members: [],
        pending: [],
      },
      api: {
        enabled: getEnvBool('API_CHANNEL_ENABLED', false),
        port: getEnvNum('API_CHANNEL_PORT', 3001),
        apiKey: getEnv('API_CHANNEL_KEY', ''),
      },
    },
    loopGuard: {
      maxSteps: getEnvNum('LOOP_MAX_STEPS', 50),
      absoluteMax: getEnvNum('LOOP_ABSOLUTE_MAX', 100),
      failedAbsoluteMax: getEnvNum('LOOP_FAILED_ABSOLUTE_MAX', 25),
      identicalThreshold: getEnvNum('LOOP_IDENTICAL_THRESHOLD', 5),
      similarThreshold: getEnvNum('LOOP_SIMILAR_THRESHOLD', 8),
      sameToolThreshold: getEnvNum('LOOP_SAME_TOOL_THRESHOLD', 10),
      noActionMax: getEnvNum('LOOP_NO_ACTION_MAX', 10),
      textRepeatThreshold: getEnvNum('LOOP_TEXT_REPEAT_THRESHOLD', 3),
    },
    webSearch: {
      enabled: getEnvBool('WEB_SEARCH_ENABLED', true),
      provider: (getEnv('WEB_SEARCH_PROVIDER', 'auto') as WebSearchConfig['provider']),
      apiKey: getEnv('WEB_SEARCH_API_KEY', getEnv('BRAVE_API_KEY', getEnv('SERPER_API_KEY', getEnv('TAVILY_API_KEY', '')))),
      maxResults: getEnvNum('WEB_SEARCH_MAX_RESULTS', 5),
    },
    mcp: {
      servers: [],
    },
    github: {
      username: getEnv('GITHUB_USERNAME', ''),
      email: getEnv('GITHUB_EMAIL', 'tota@github.com'),
      defaultOwner: getEnv('GITHUB_DEFAULT_OWNER', ''),
      defaultRepo: getEnv('GITHUB_DEFAULT_REPO', ''),
    },
    memory: {
      shortTermMaxMessages: getEnvNum('SHORT_TERM_MAX_MESSAGES', 20),
      secondBrain: {
        enabled: getEnvBool('SECOND_BRAIN_ENABLED', true),
        maxRecords: getEnvNum('SECOND_BRAIN_MAX_RECORDS', 50),
      },
    },
    heartbeat: {
      intervalMinutes: getEnvNum('HEARTBEAT_INTERVAL_MINUTES', 60),
    },
    tokens: {
      dailyBudget: getEnvNum('DAILY_TOKEN_BUDGET', 1_000_000),
    },
  };
}

const CONFIG_PATH = join(getTotaHome(), 'tota.yaml');

export function loadConfig(): TotaConfig {
  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const fileConfig = parseYaml(raw) as Partial<TotaConfig>;
    const defaults = getDefaultConfig();
    return migrateLegacyOllamaCloudBaseUrl(
      migrateLegacyTelegramAccess(deepMerge(defaults, fileConfig)),
    );
  }
  return migrateLegacyTelegramAccess(getDefaultConfig());
}

export function saveConfig(config: TotaConfig): void {
  const dir = getTotaHome();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, stringifyYaml(config), 'utf-8');
}

export function isSetupComplete(): boolean {
  if (!existsSync(CONFIG_PATH)) return false;
  const config = loadConfig();
  return config.identity.owner.length > 0;
}

export function ensureCreatorField(config: TotaConfig): TotaConfig {
  if (!config.identity.creator && config.identity.owner) {
    config.identity.creator = 'manu14357';
    saveConfig(config);
  }
  return config;
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] !== undefined && source[key] !== null) {
      if (
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(
          target[key] as Record<string, any>,
          source[key] as Record<string, any>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }
  return result;
}

export function getActiveProviders(config: TotaConfig): ProviderConfig[] {
  return Object.values(config.providers)
    .filter((p): p is ProviderConfig => typeof p === 'object' && isProviderConfigured(p));
}

export function isProviderConfigured(provider: ProviderConfig): boolean {
  if (!provider.enabled) return false;
  if (provider.name === 'ollamaLocal') {
    return provider.baseUrl.length > 0 && provider.model.length > 0;
  }
  if (provider.name === 'ollamaCloud') {
    return provider.apiKey.length > 0 && provider.baseUrl.length > 0;
  }
  if (provider.name === 'openaiCompat') {
    return provider.baseUrl.length > 0 && provider.model.length > 0;
  }
  return provider.apiKey.length > 0;
}

export function getTelegramApprovedUsers(config: TotaConfig): TelegramAccessUser[] {
  return [
    ...config.channels.telegram.admins,
    ...config.channels.telegram.members,
  ];
}

export function getTelegramApprovedChatIds(config: TotaConfig): number[] {
  return [...new Set(getTelegramApprovedUsers(config).map((user) => user.chatId))];
}

export function getTelegramAdmins(config: TotaConfig): TelegramAccessUser[] {
  return config.channels.telegram.admins;
}

export function getTelegramPendingRequests(config: TotaConfig): TelegramPendingRequest[] {
  return config.channels.telegram.pending;
}

export function findTelegramApprovedUser(config: TotaConfig, userId: number): TelegramAccessUser | undefined {
  return getTelegramApprovedUsers(config).find((user) => user.userId === userId);
}

export function findTelegramAdmin(config: TotaConfig, userId: number): TelegramAccessUser | undefined {
  return config.channels.telegram.admins.find((user) => user.userId === userId);
}

export function findTelegramPendingRequest(config: TotaConfig, userId: number): TelegramPendingRequest | undefined {
  return config.channels.telegram.pending.find((request) => request.userId === userId);
}

export function findTelegramPendingRequestByPairingCode(
  config: TotaConfig,
  pairingCode: string,
): TelegramPendingRequest | undefined {
  return config.channels.telegram.pending.find((request) => request.pairingCode === pairingCode);
}

export function hasTelegramAdmins(config: TotaConfig): boolean {
  return config.channels.telegram.admins.length > 0;
}

export function getTelegramAccessSummary(config: TotaConfig): string {
  return `${config.channels.telegram.admins.length} admin${config.channels.telegram.admins.length === 1 ? '' : 's'}, `
    + `${config.channels.telegram.members.length} member${config.channels.telegram.members.length === 1 ? '' : 's'}, `
    + `${config.channels.telegram.pending.length} pending`;
}

export function addTelegramPendingRequest(
  config: TotaConfig,
  request: Omit<TelegramPendingRequest, 'requestedAt'> & { requestedAt?: string },
): TelegramPendingRequest {
  const existing = findTelegramPendingRequest(config, request.userId);
  if (existing) {
    existing.chatId = request.chatId;
    existing.username = request.username || existing.username;
    existing.firstName = request.firstName || existing.firstName;
    existing.pairingCode = request.pairingCode || existing.pairingCode;
    return existing;
  }

  const created: TelegramPendingRequest = {
    ...request,
    requestedAt: request.requestedAt || new Date().toISOString(),
  };
  config.channels.telegram.pending.push(created);
  return created;
}

export function approveTelegramPendingRequest(
  config: TotaConfig,
  userId: number,
  role: 'admin' | 'member' = 'member',
): TelegramAccessUser | null {
  const request = findTelegramPendingRequest(config, userId);
  if (!request) return null;

  const approvedUser: TelegramAccessUser = {
    userId: request.userId,
    chatId: request.chatId,
    username: request.username,
    firstName: request.firstName,
    requestedAt: request.requestedAt,
    approvedAt: new Date().toISOString(),
  };

  config.channels.telegram.pending = config.channels.telegram.pending
    .filter((entry) => entry.userId !== userId);
  config.channels.telegram.admins = config.channels.telegram.admins
    .filter((entry) => entry.userId !== userId);
  config.channels.telegram.members = config.channels.telegram.members
    .filter((entry) => entry.userId !== userId);

  if (role === 'admin') {
    config.channels.telegram.admins.push(approvedUser);
  } else {
    config.channels.telegram.members.push(approvedUser);
  }

  return approvedUser;
}

export function approveTelegramPendingRequestByPairingCode(
  config: TotaConfig,
  pairingCode: string,
): TelegramAccessUser | null {
  const request = findTelegramPendingRequestByPairingCode(config, pairingCode);
  if (!request) return null;
  const role = hasTelegramAdmins(config) ? 'member' : 'admin';
  return approveTelegramPendingRequest(config, request.userId, role);
}

export function rejectTelegramPendingRequest(config: TotaConfig, userId: number): TelegramPendingRequest | null {
  const request = findTelegramPendingRequest(config, userId);
  if (!request) return null;
  config.channels.telegram.pending = config.channels.telegram.pending
    .filter((entry) => entry.userId !== userId);
  return request;
}

export function removeTelegramUser(config: TotaConfig, userId: number): TelegramAccessUser | null {
  const admin = config.channels.telegram.admins.find((entry) => entry.userId === userId);
  if (admin) {
    config.channels.telegram.admins = config.channels.telegram.admins
      .filter((entry) => entry.userId !== userId);
    return admin;
  }

  const member = config.channels.telegram.members.find((entry) => entry.userId === userId);
  if (member) {
    config.channels.telegram.members = config.channels.telegram.members
      .filter((entry) => entry.userId !== userId);
    return member;
  }

  return null;
}

export function promoteTelegramUserToAdmin(config: TotaConfig, userId: number): TelegramAccessUser | null {
  const member = config.channels.telegram.members.find((entry) => entry.userId === userId);
  if (!member) return null;
  config.channels.telegram.members = config.channels.telegram.members
    .filter((entry) => entry.userId !== userId);
  config.channels.telegram.admins.push(member);
  return member;
}

export function demoteTelegramAdmin(config: TotaConfig, userId: number): TelegramAccessUser | null {
  if (config.channels.telegram.admins.length <= 1) {
    return null;
  }

  const admin = config.channels.telegram.admins.find((entry) => entry.userId === userId);
  if (!admin) return null;
  config.channels.telegram.admins = config.channels.telegram.admins
    .filter((entry) => entry.userId !== userId);
  config.channels.telegram.members.push(admin);
  return admin;
}

export function clearTelegramAccess(config: TotaConfig): TotaConfig {
  config.channels.telegram.admins = [];
  config.channels.telegram.members = [];
  config.channels.telegram.pending = [];
  delete config.channels.telegram.pairedUserId;
  delete config.channels.telegram.pairedChatId;
  delete config.channels.telegram.pairedUsername;
  return config;
}

export function clearTelegramPairing(config: TotaConfig): TotaConfig {
  return clearTelegramAccess(config);
}

export function migrateLegacyTelegramAccess(config: TotaConfig): TotaConfig {
  const telegram = config.channels.telegram;
  telegram.admins = telegram.admins || [];
  telegram.members = telegram.members || [];
  telegram.pending = telegram.pending || [];

  if (
    telegram.admins.length === 0
    && telegram.members.length === 0
    && typeof telegram.pairedUserId === 'number'
    && typeof telegram.pairedChatId === 'number'
  ) {
    telegram.admins.push({
      userId: telegram.pairedUserId,
      chatId: telegram.pairedChatId,
      username: telegram.pairedUsername,
      approvedAt: new Date().toISOString(),
    });
  }

  delete telegram.pairedUserId;
  delete telegram.pairedChatId;
  delete telegram.pairedUsername;

  return config;
}

export function migrateLegacyOllamaCloudBaseUrl(config: TotaConfig): TotaConfig {
  if (config.providers.ollamaCloud.baseUrl === 'https://ollama.com/api') {
    config.providers.ollamaCloud.baseUrl = 'https://ollama.com/v1';
    saveConfig(config);
  }
  return config;
}
