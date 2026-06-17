import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

import {
  loadConfig,
  saveConfig,
  getTotaHome,
  clearTelegramAccess,
} from '../../utils/config.js';
import type { TotaConfig } from '../../utils/config.js';
import { selectWithArrowKeys } from '../../utils/arrow-select.js';
import { banner, hr, splashScreen } from '../banner.js';
import { ask, maskKey, appendToEnv, parseGithubRepo } from './prompts.js';
import {
  getConfiguredProviderNames,
  chooseProvidersToConfigure,
  chooseDefaultProvider,
  promptApiKeyWithModelSelection,
  promptOllamaLocalModelSelection,
  promptOpenAICompatSetup,
} from './providers.js';
import { completeInitialTelegramPairing } from './telegram-pairing.js';

export const SETUP_SECTIONS: Record<string, string> = {
  identity: 'Identity & Name',
  llm: 'LLM Providers',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  github: 'GitHub Integration',
  websearch: 'Web Search',
  browser: 'Browser Automation',
  computer: 'Computer-Use & Android',
  api: 'REST API Channel',
  budget: 'Token Budget',
  calendar: 'Google Calendar',
  gmail: 'Gmail (read/send)',
  voice: 'Voice TTS/STT',
  vault: 'Secrets Vault',
};

export async function configure(existingConfig?: TotaConfig, section?: string): Promise<void> {
  const isReconfig = !!existingConfig || !!section;
  const config = existingConfig ?? loadConfig();

  if (section) {
    const label = SETUP_SECTIONS[section] ?? section;
    banner();
    console.log(chalk.yellow(`  Configuring: ${label} — press Enter to keep current value.`));
  } else if (isReconfig) {
    banner();
    console.log(chalk.yellow('  Reconfiguring tota — press Enter to keep current value.'));
  } else {
    splashScreen();
    console.log(chalk.yellow('  First run detected — let\'s set you up.'));
  }

  if (!section || section === 'identity') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Identity'));
  console.log('');

  if (isReconfig) {
    const ownerName = await ask(chalk.white(`  Your name [${config.identity.owner}]: `));
    if (ownerName) config.identity.owner = ownerName;

    const agentName = await ask(chalk.white(`  Agent name [${config.identity.name}]: `));
    if (agentName) config.identity.name = agentName;
  } else {
    const ownerName = await ask(chalk.white('  Your name: '));
    if (!ownerName) {
      console.log(chalk.red('  Name is required.'));
      process.exit(1);
    }
    config.identity.owner = ownerName;

    const agentName = await ask(chalk.white(`  Agent name [${config.identity.name}]: `));
    if (agentName) config.identity.name = agentName;
  }

  config.identity.creator = config.identity.creator || 'manu14357';
  } // end identity section

  if (!section || section === 'llm') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  LLM Providers'));
  if (isReconfig) {
    console.log(chalk.dim('  Choose which providers to configure now. Existing values are shown where available.'));
  } else {
    console.log(chalk.dim('  Choose one or more providers. Press Enter to configure DeepSeek by default.'));
  }
  console.log('');

  while (true) {
    const selectedProviders = await chooseProvidersToConfigure(config, isReconfig);
    console.log('');

    for (const provider of selectedProviders) {
      if (provider === 'deepseek') {
        const mask = isReconfig && config.providers.deepseek.apiKey ? ` [${maskKey(config.providers.deepseek.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'deepseek',
          'DeepSeek',
          chalk.white(`  DeepSeek API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.deepseek.apiKey = result.apiKey;
          config.providers.deepseek.model = result.model;
          config.providers.deepseek.enabled = true;
        }
        continue;
      }

      if (provider === 'openai') {
        const mask = isReconfig && config.providers.openai.apiKey ? ` [${maskKey(config.providers.openai.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'openai',
          'OpenAI',
          chalk.white(`  OpenAI API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.openai.apiKey = result.apiKey;
          config.providers.openai.model = result.model;
          config.providers.openai.enabled = true;
        }
        continue;
      }

      if (provider === 'anthropic') {
        const mask = isReconfig && config.providers.anthropic.apiKey ? ` [${maskKey(config.providers.anthropic.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'anthropic',
          'Anthropic',
          chalk.white(`  Anthropic API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.anthropic.apiKey = result.apiKey;
          config.providers.anthropic.model = result.model;
          config.providers.anthropic.enabled = true;
        }
        continue;
      }

      if (provider === 'grok') {
        const mask = isReconfig && config.providers.grok.apiKey ? ` [${maskKey(config.providers.grok.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'grok',
          'Grok',
          chalk.white(`  Grok API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.grok.apiKey = result.apiKey;
          config.providers.grok.model = result.model;
          config.providers.grok.enabled = true;
        }
        continue;
      }

      if (provider === 'groq') {
        const mask = isReconfig && config.providers.groq.apiKey ? ` [${maskKey(config.providers.groq.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'groq',
          'Groq',
          chalk.white(`  Groq API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.groq.apiKey = result.apiKey;
          config.providers.groq.model = result.model;
          config.providers.groq.enabled = true;
        }
        continue;
      }

      if (provider === 'ollamaCloud') {
        const mask = isReconfig && config.providers.ollamaCloud.apiKey ? ` [${maskKey(config.providers.ollamaCloud.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'ollamaCloud',
          'Ollama Cloud',
          chalk.white(`  Ollama Cloud API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.ollamaCloud.apiKey = result.apiKey;
          config.providers.ollamaCloud.model = result.model;
          config.providers.ollamaCloud.enabled = true;
        }
        continue;
      }

      if (provider === 'ollamaLocal') {
        const result = await promptOllamaLocalModelSelection(config);
        if (!result.skipped && result.baseUrl && result.model) {
          config.providers.ollamaLocal.baseUrl = result.baseUrl;
          config.providers.ollamaLocal.model = result.model;
          config.providers.ollamaLocal.enabled = true;
        }
        continue;
      }

      if (provider === 'openaiCompat') {
        const result = await promptOpenAICompatSetup(config, isReconfig);
        if (!result.skipped && result.baseUrl && result.model) {
          config.providers.openaiCompat.baseUrl = result.baseUrl;
          config.providers.openaiCompat.model = result.model;
          config.providers.openaiCompat.enabled = true;
          if (result.apiKey) {
            config.providers.openaiCompat.apiKey = result.apiKey;
          }
        }
        continue;
      }

      if (provider === 'mimo') {
        const mask = isReconfig && config.providers.mimo.apiKey ? ` [${maskKey(config.providers.mimo.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'mimo',
          'MiMo',
          chalk.white(`  MiMo API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.mimo.apiKey = result.apiKey;
          config.providers.mimo.model = result.model;
          config.providers.mimo.enabled = true;
        }
        continue;
      }

      if (provider === 'mimoTokenPlan') {
        const mask = isReconfig && config.providers.mimoTokenPlan.apiKey ? ` [${maskKey(config.providers.mimoTokenPlan.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'mimoTokenPlan',
          'MiMo Token Plan',
          chalk.white(`  MiMo Token Plan API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.mimoTokenPlan.apiKey = result.apiKey;
          config.providers.mimoTokenPlan.model = result.model;
          config.providers.mimoTokenPlan.enabled = true;
        }
      }

      if (provider === 'nvidia') {
        const mask = isReconfig && config.providers.nvidia.apiKey ? ` [${maskKey(config.providers.nvidia.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'nvidia',
          'NVIDIA NIM',
          chalk.white(`  NVIDIA API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.nvidia.apiKey = result.apiKey;
          config.providers.nvidia.model = result.model;
          config.providers.nvidia.enabled = true;
        }
      }

      if (provider === 'openrouter') {
        const mask = isReconfig && config.providers.openrouter.apiKey ? ` [${maskKey(config.providers.openrouter.apiKey)}]` : '';
        const result = await promptApiKeyWithModelSelection(
          config,
          'openrouter',
          'OpenRouter',
          chalk.white(`  OpenRouter API key${mask}${isReconfig ? '' : ' (Enter to skip)'}: `),
          isReconfig,
        );
        if (!result.skipped && result.apiKey && result.model) {
          config.providers.openrouter.apiKey = result.apiKey;
          config.providers.openrouter.model = result.model;
          config.providers.openrouter.enabled = true;
        }
      }
    }

    const configuredProviders = getConfiguredProviderNames(config);
    if (configuredProviders.length === 0) {
      console.log(chalk.red('  You need to configure at least one LLM provider to continue.'));
      console.log(chalk.dim('  Let\'s try that step again.'));
      console.log('');
      continue;
    }

    await chooseDefaultProvider(config);
    break;
  }
  } // end llm section

  if (!section || section === 'telegram') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Telegram (optional)'));
  if (isReconfig) {
    console.log(chalk.dim('  Leave empty to keep current value. Enter "none" to disable.'));
  } else {
    console.log(chalk.dim('  Leave empty to skip. You can add it later.'));
    console.log(chalk.dim('  To create a bot token:'));
    console.log(chalk.dim('    1. Open Telegram and message @BotFather'));
    console.log(chalk.dim('    2. Run /newbot and follow the prompts'));
    console.log(chalk.dim('    3. Copy the bot token BotFather gives you'));
    console.log(chalk.dim('    4. Paste that token here'));
    console.log(chalk.dim('  After setup, users send /start to request access.'));
    console.log(chalk.dim('  The first Telegram user gets a pairing code, and you approve that code from the CLI.'));
  }
  console.log('');

  const tgMask = isReconfig && config.channels.telegram.botToken ? ` [${maskKey(config.channels.telegram.botToken)}]` : '';
  const telegramToken = await ask(chalk.white(`  Telegram Bot Token${tgMask}: `));
  if (isReconfig && telegramToken.toLowerCase() === 'none') {
    config.channels.telegram.enabled = false;
    config.channels.telegram.botToken = '';
    clearTelegramAccess(config);
  } else if (telegramToken) {
    if (telegramToken !== config.channels.telegram.botToken) {
      clearTelegramAccess(config);
    }
    config.channels.telegram.botToken = telegramToken;
    config.channels.telegram.enabled = true;
  }

  await completeInitialTelegramPairing(config);
  } // end telegram section

  if (!section || section === 'whatsapp') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  WhatsApp (optional)'));
  if (isReconfig) {
    console.log(chalk.dim('  Enter "none" to disable, or leave empty to keep current value.'));
  } else {
    console.log(chalk.dim('  Connect tota to your WhatsApp — no business account or API key needed.'));
    console.log(chalk.dim('  Uses WhatsApp Web (Baileys). A QR code will appear when you start tota.'));
    console.log(chalk.dim('  Scan it from WhatsApp → Linked Devices → Link a Device.'));
    console.log('');
    console.log(chalk.dim('  After enabling, run `tota start` and scan the QR code to link.'));
    console.log(chalk.dim('  Then add your phone with: tota whatsapp allow +<phone>'));
  }
  console.log('');

  const waEnabled = config.channels.whatsapp?.enabled ?? false;
  const waOptions = [
    { value: 'skip', label: isReconfig ? (waEnabled ? 'Keep enabled' : 'Keep disabled / skip') : 'Skip — don\'t enable WhatsApp' },
    { value: 'enable', label: 'Enable WhatsApp channel' },
    ...(isReconfig && waEnabled ? [{ value: 'disable', label: 'Disable WhatsApp channel' }] : []),
  ];

  if (isReconfig && waEnabled) {
    const allowFrom = config.channels.whatsapp?.allowFrom ?? [];
    const authDir = config.channels.whatsapp?.authDir ?? '';
    console.log(chalk.dim(`  Current: enabled · auth: ${authDir}`));
    if (allowFrom.length > 0) {
      console.log(chalk.dim(`  Allowed numbers: ${allowFrom.join(', ')}`));
    } else {
      console.log(chalk.dim('  Allowed numbers: none set (use pairing requests)'));
    }
    console.log('');
  }

  const waChoice = await selectWithArrowKeys('WhatsApp Channel', waOptions);

  if (waChoice === 'disable') {
    config.channels.whatsapp.enabled = false;
    console.log(chalk.dim('  WhatsApp channel disabled.'));
  } else if (waChoice === 'enable') {
    config.channels.whatsapp.enabled = true;

    const defaultAuthDir = config.channels.whatsapp?.authDir || join(homedir(), '.tota', 'whatsapp-auth');
    const authDirInput = await ask(chalk.white(`  Auth directory [${defaultAuthDir}]: `));
    config.channels.whatsapp.authDir = authDirInput || defaultAuthDir;

    console.log('');
    console.log(chalk.dim('  Allow specific phone numbers (E.164 format, comma-separated).'));
    console.log(chalk.dim('  Example: +15551234567,+447911123456'));
    console.log(chalk.dim('  Leave empty — anyone can send a pairing/access request instead.'));
    const allowFromInput = await ask(chalk.white('  Allowed numbers (comma-separated, or Enter to skip): '));
    if (allowFromInput.trim()) {
      config.channels.whatsapp.allowFrom = allowFromInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const allowGroupsInput = await ask(chalk.white('  Allow group messages? (y/N): '));
    config.channels.whatsapp.allowGroups = allowGroupsInput.toLowerCase().startsWith('y');

    console.log('');
    console.log(chalk.green(`  ✓ WhatsApp enabled. Auth stored at: ${config.channels.whatsapp.authDir}`));
    console.log(chalk.dim('  Run `tota start` and scan the QR code that appears to link your WhatsApp.'));
  }
  } // end whatsapp section

  if (!section || section === 'github') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  GitHub Integration (optional)'));
  console.log(chalk.dim('  Connect tota to GitHub so it can create PRs, manage issues,'));
  console.log(chalk.dim('  review code, and co-author commits on your behalf.'));
  console.log(chalk.dim('  Leave empty to skip. You can add it later with tota doctor.'));
  console.log('');

  const ghUserCurrent = isReconfig && config.github.username ? ` [${config.github.username}]` : '';
  const ghUsername = await ask(chalk.white(`  1. Your GitHub username${ghUserCurrent}: `));
  if (ghUsername) config.github.username = ghUsername;

  if (!config.github.email) {
    config.github.email = 'tota@github.com';
  }

  console.log('');
  console.log(chalk.dim('     You need a Personal Access Token (PAT) with repo access.'));
  console.log(chalk.dim('     Fine-grained (recommended): github.com/settings/personal-access-tokens/new'));
  console.log(chalk.dim('       → Permissions: Contents (R/W), Pull requests (R/W), Issues (R/W)'));
  console.log(chalk.dim('     Classic: github.com/settings/tokens/new'));
  console.log(chalk.dim('       → Scope: repo (full control)'));
  const ghTokenCurrent = process.env.GITHUB_TOKEN ? ` [${maskKey(process.env.GITHUB_TOKEN)}]` : '';
  const ghToken = await ask(chalk.white(`  2. GitHub PAT${ghTokenCurrent}: `));
  if (ghToken) {
    appendToEnv('GITHUB_TOKEN', ghToken);
  }

  if (config.github.username || process.env.GITHUB_TOKEN) {
    console.log('');
    console.log(chalk.dim('     Set a default repo so you can say "create an issue" without'));
    console.log(chalk.dim('     specifying the repo every time. Enter owner/name or a full URL.'));
    console.log(chalk.dim('     Example: manu14357/tota-agent'));
    console.log(chalk.dim('     Example: https://github.com/manu14357/tota-agent'));
    const ghOwnerCurrent = isReconfig && config.github.defaultOwner ? ` [${config.github.defaultOwner}/${config.github.defaultRepo}]` : '';
    const ghRepoInput = await ask(chalk.white(`  3. Default repo${ghOwnerCurrent}: `));
    if (ghRepoInput) {
      const parsed = parseGithubRepo(ghRepoInput);
      if (parsed) {
        config.github.defaultOwner = parsed.owner;
        config.github.defaultRepo = parsed.repo;
      } else {
        console.log(chalk.yellow('  Could not parse repo. Use format: owner/repo or a GitHub URL.'));
      }
    }
  }
  } // end github section

  if (!section || section === 'websearch') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Web Search (optional)'));
  console.log(chalk.dim('  Enable tota to search the web. Provide an API key for one of the'));
  console.log(chalk.dim('  supported providers below. Leave empty to skip.'));
  console.log('');
  console.log(chalk.dim('    Brave Search  — brave.com/search/api'));
  console.log(chalk.dim('    Serper        — serper.dev'));
  console.log(chalk.dim('    Tavily        — tavily.com'));
  console.log('');

  const webSearchProviders = [
    { key: 'brave', label: 'Brave Search', envKey: 'BRAVE_API_KEY', prefix: '' },
    { key: 'serper', label: 'Serper', envKey: 'SERPER_API_KEY', prefix: '' },
    { key: 'tavily', label: 'Tavily', envKey: 'TAVILY_API_KEY', prefix: '' },
  ] as const;

  const existingWebKey = process.env.BRAVE_API_KEY || process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY || config.webSearch?.apiKey || '';
  const existingWebProvider = process.env.BRAVE_API_KEY ? 'Brave' : process.env.SERPER_API_KEY ? 'Serper' : process.env.TAVILY_API_KEY ? 'Tavily' : '';

  const webSearchOptions = [
    { value: 'skip', label: isReconfig ? 'Keep current / skip' : 'Skip' },
    ...webSearchProviders.map((p, i) => ({ value: p.envKey, label: `${i + 1}. ${p.label}` })),
  ];

  if (existingWebKey && existingWebProvider) {
    console.log(chalk.dim(`  Current: ${existingWebProvider} (${maskKey(existingWebKey)})`));
    console.log('');
  }

  const webChoice = await selectWithArrowKeys('Web Search Provider', webSearchOptions);

  if (webChoice && webChoice !== 'skip') {
    const chosen = webSearchProviders.find(p => p.envKey === webChoice)!;
    const currentKey = process.env[chosen.envKey] || '';
    const mask = isReconfig && currentKey ? ` [${maskKey(currentKey)}]` : '';
    while (true) {
      const wsKey = await ask(chalk.white(`  ${chosen.label} API key${mask}: `));
      if (!wsKey) {
        if (isReconfig && currentKey) {
          console.log(chalk.dim(`  Keeping current ${chosen.label} key.`));
        }
        break;
      }
      if (wsKey.length < 10 || /\s/.test(wsKey)) {
        console.log(chalk.red('  That doesn\'t look like a valid API key. Try again.'));
        continue;
      }
      appendToEnv(chosen.envKey, wsKey);
      console.log(chalk.green(`  ✓ ${chosen.label} API key saved to ~/.tota/.env`));
      break;
    }
  }
  } // end websearch section

  if (!section || section === 'api') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  REST API Channel (optional)'));
  console.log(chalk.dim('  Expose a local HTTP endpoint so other apps or scripts can send'));
  console.log(chalk.dim('  messages to tota and get replies (POST /message).'));
  console.log(chalk.dim('  Leave empty to skip. You can enable it later with tota doctor.'));
  console.log('');

  const apiEnabled = config.channels.api?.enabled ?? false;
  const apiCurrentPort = config.channels.api?.port ?? 3001;
  const apiCurrentKey = config.channels.api?.apiKey ?? '';

  const apiEnableOptions = [
    { value: 'skip', label: isReconfig ? (apiEnabled ? 'Keep enabled' : 'Keep disabled / skip') : 'Skip — don\'t enable the REST API' },
    { value: 'enable', label: 'Enable the REST API channel' },
    ...(isReconfig && apiEnabled ? [{ value: 'disable', label: 'Disable the REST API channel' }] : []),
  ];

  if (isReconfig && apiEnabled) {
    console.log(chalk.dim(`  Current: enabled on port ${apiCurrentPort}${apiCurrentKey ? `, key: ${maskKey(apiCurrentKey)}` : ', no auth'}`));
    console.log('');
  }

  const apiChoice = await selectWithArrowKeys('REST API Channel', apiEnableOptions);

  if (apiChoice === 'disable') {
    config.channels.api.enabled = false;
    console.log(chalk.dim('  REST API channel disabled.'));
  } else if (apiChoice === 'enable') {
    config.channels.api.enabled = true;

    const portPrompt = isReconfig
      ? chalk.white(`  Port [${apiCurrentPort}]: `)
      : chalk.white(`  Port [3001]: `);
    while (true) {
      const portStr = await ask(portPrompt);
      if (!portStr) {
        config.channels.api.port = apiCurrentPort;
        break;
      }
      const portNum = parseInt(portStr, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        console.log(chalk.red('  Please enter a valid port number (1–65535).'));
        continue;
      }
      config.channels.api.port = portNum;
      break;
    }

    const keyMask = isReconfig && apiCurrentKey ? ` [${maskKey(apiCurrentKey)}]` : '';
    const apiKeyPrompt = isReconfig && apiCurrentKey
      ? chalk.white(`  API key for auth (Enter to keep current)${keyMask}: `)
      : chalk.white('  API key for auth (optional, Enter to skip — no auth): ');
    const newApiKey = await ask(apiKeyPrompt);
    if (newApiKey) {
      if (newApiKey.length < 8 || /\s/.test(newApiKey)) {
        console.log(chalk.yellow('  That key looks too short or has spaces — saved anyway. Consider using a longer key.'));
      }
      config.channels.api.apiKey = newApiKey;
      console.log(chalk.green(`  ✓ REST API channel enabled on port ${config.channels.api.port} with auth.`));
    } else {
      if (isReconfig && apiCurrentKey) config.channels.api.apiKey = apiCurrentKey;
      console.log(chalk.green(`  ✓ REST API channel enabled on port ${config.channels.api.port}${config.channels.api.apiKey ? ' with auth' : ' (no auth)'}.`));
    }
  }
  } // end api section

  if (!section || section === 'budget') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Token Budget'));
  console.log('');

  const budgetPrompt = isReconfig
    ? chalk.white(`  Daily token budget [${config.tokens.dailyBudget.toLocaleString()}]: `)
    : chalk.white(`  Daily token budget [${config.tokens.dailyBudget.toLocaleString()}]: `);
  const budgetStr = await ask(budgetPrompt);
  if (budgetStr) {
    const budget = parseInt(budgetStr.replace(/,/g, ''), 10);
    if (!isNaN(budget) && budget > 0) {
      config.tokens.dailyBudget = budget;
    }
  }
  } // end budget section

  if (!section || section === 'browser') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Browser Automation'));
  console.log(chalk.dim('  Playwright-powered Chromium: open pages, click, type, screenshot, extract.'));
  console.log(chalk.dim('  Works out of the box — no API keys needed.'));
  console.log('');

  const browserOptions = [
    { value: 'skip', label: 'Skip — browser tools are already available' },
    { value: 'install', label: 'Install Chromium browser binary now (npx playwright install chromium)' },
  ];

  const browserChoice = await selectWithArrowKeys('Browser Automation', browserOptions);
  if (browserChoice === 'install') {
    console.log(chalk.dim('  Running: npx playwright install chromium ...'));
    try {
      const { execSync: exec2 } = await import('node:child_process');
      exec2('npx playwright install chromium', { stdio: 'inherit' });
      console.log(chalk.green('  ✓ Chromium installed. Browser tools are ready.'));
    } catch (e: any) {
      console.log(chalk.yellow(`  Could not install Chromium automatically: ${e.message}`));
      console.log(chalk.dim('  Run manually: npx playwright install chromium'));
    }
  } else {
    console.log(chalk.dim('  Skipped. Run `npx playwright install chromium` when ready.'));
  }
  } // end browser section

  if (!section || section === 'computer') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Computer-Use & Android'));
  console.log(chalk.dim('  Let tota see your screen (via vision AI) and control mouse/keyboard.'));
  console.log(chalk.dim('  Also enables Android ADB tools (tap, swipe, type, shell...).'));
  console.log(chalk.dim('  Disabled by default for safety.'));
  console.log('');

  const computerEnabled = config.capabilities?.computer?.enabled ?? false;
  const computerOptions = [
    { value: 'skip',    label: isReconfig ? (computerEnabled ? 'Keep enabled' : 'Keep disabled / skip') : 'Skip — keep computer-use disabled' },
    { value: 'enable',  label: 'Enable computer-use (desktop + Android ADB tools)' },
    ...(isReconfig && computerEnabled ? [{ value: 'disable', label: 'Disable computer-use' }] : []),
  ];

  const computerChoice = await selectWithArrowKeys('Computer-Use', computerOptions);
  if (computerChoice === 'enable') {
    config.capabilities = { ...config.capabilities, computer: { enabled: true } };
    appendToEnv('COMPUTER_USE_ENABLED', 'true');
    console.log(chalk.green('  ✓ COMPUTER_USE_ENABLED=true saved to ~/.tota/.env'));
    console.log(chalk.dim('  Desktop tools use @nut-tree-fork/nut-js. On Linux: sudo apt install libxtst-dev'));
    console.log(chalk.dim('  Android tools use `adb` — ensure adb is in your PATH.'));
  } else if (computerChoice === 'disable') {
    config.capabilities = { ...config.capabilities, computer: { enabled: false } };
    appendToEnv('COMPUTER_USE_ENABLED', 'false');
    console.log(chalk.dim('  COMPUTER_USE_ENABLED=false saved to ~/.tota/.env'));
  } else {
    console.log(chalk.dim('  Skipped. Set COMPUTER_USE_ENABLED=true in ~/.tota/.env to enable later.'));
  }
  } // end computer section

  // ── Google Calendar setup (only when explicitly requested) ─────────────────
  if (section === 'calendar') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Google Calendar'));
  console.log(chalk.dim('  Lets tota read, create, and check your Google Calendar events.'));
  console.log('');
  console.log(chalk.bold('  Step 1 — Create a Google Cloud project:'));
  console.log(chalk.dim('  1. Go to https://console.cloud.google.com/'));
  console.log(chalk.dim('  2. Create a project → Enable "Google Calendar API"'));
  console.log(chalk.dim('  3. Go to APIs & Services → Credentials → + Create Credentials → OAuth client ID'));
  console.log(chalk.dim('  4. Application type: Desktop app. Download the credentials JSON.'));
  console.log(chalk.dim('  5. Edit the Client ID → Authorized redirect URIs → Add:'));
  console.log(chalk.cyan('       http://localhost:8765/oauth2callback'));
  console.log(chalk.dim('     (required — without this Google shows a "not safe" error)'));
  console.log('');
  const existingClientId = (config as any).calendar?.clientId || process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  const existingSecret  = (config as any).calendar?.clientSecret || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  const clientIdPrompt  = existingClientId ? `  Client ID [${existingClientId.slice(0, 20)}...]: ` : '  Client ID: ';
  const clientSecretPrompt = existingSecret ? `  Client Secret [${existingSecret.slice(0, 8)}...]: ` : '  Client Secret: ';

  const clientId = await ask(chalk.white(clientIdPrompt));
  const clientSecret = await ask(chalk.white(clientSecretPrompt));

  const finalClientId     = clientId     || existingClientId;
  const finalClientSecret = clientSecret || existingSecret;

  if (finalClientId && finalClientSecret) {
    appendToEnv('GOOGLE_CALENDAR_CLIENT_ID', finalClientId);
    appendToEnv('GOOGLE_CALENDAR_CLIENT_SECRET', finalClientSecret);
    if (!config.calendar) config.calendar = {};
    config.calendar.clientId = finalClientId;
    config.calendar.clientSecret = finalClientSecret;
    console.log('');
    console.log(chalk.green('  ✓ Credentials saved to ~/.tota/.env'));
    console.log('');
    console.log(chalk.bold('  Step 2 — Authorize tota:'));
    console.log(chalk.dim('  Just ask tota about your calendar (e.g. "what\'s on my calendar today?")'));
    console.log(chalk.dim('  Tota opens your browser automatically → click Allow → done.'));
    console.log(chalk.dim('  (Headless/server? Use the calendar_auth tool to paste the code manually.)'));
  } else {
    console.log(chalk.yellow('  Skipped — enter credentials later or set GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET in ~/.tota/.env'));
  }
  } // end calendar section

  // ── Gmail + Google Workspace setup ─────────────────────────────────────────
  if (section === 'gmail') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Gmail'));
  console.log(chalk.dim('  Lets tota search, read, send, and triage your email.'));
  console.log('');
  console.log(chalk.bold('  Step 1 — Google Cloud project:'));
  console.log(chalk.dim('  1. https://console.cloud.google.com/ → create/select a project'));
  console.log(chalk.dim('  2. Enable the "Gmail API"'));
  console.log(chalk.dim('  3. APIs & Services → Credentials → Create OAuth client ID → Desktop app'));
  console.log(chalk.dim('  4. On the Client ID, add this Authorized redirect URI:'));
  console.log(chalk.cyan('       http://localhost:8765/oauth2callback'));
  console.log('');
  console.log(chalk.bold('  Company / Google Workspace accounts (e.g. you@yourcompany.com):'));
  console.log(chalk.dim('  • OAuth consent screen → if "Testing", either add your address as a'));
  console.log(chalk.dim('    Test user OR publish the app (Testing → In production).'));
  console.log(chalk.dim('  • To restrict sign-in to your domain, set "Hosted domain" below.'));
  console.log(chalk.dim('  • A Workspace admin may need to allow the app under Admin console →'));
  console.log(chalk.dim('    Security → API controls. For headless servers, use a service account'));
  console.log(chalk.dim('    with domain-wide delegation (set GOOGLE_SERVICE_ACCOUNT_KEY +'));
  console.log(chalk.dim('    GOOGLE_IMPERSONATE_SUBJECT in ~/.tota/.env).'));
  console.log('');
  const exGmailId = (config as any).gmail?.clientId || (config as any).google?.clientId || process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const exGmailSecret = (config as any).gmail?.clientSecret || (config as any).google?.clientSecret || process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  const gmailId = await ask(chalk.white(exGmailId ? `  Client ID [${exGmailId.slice(0, 20)}...]: ` : '  Client ID: '));
  const gmailSecret = await ask(chalk.white(exGmailSecret ? `  Client Secret [${exGmailSecret.slice(0, 8)}...]: ` : '  Client Secret: '));
  const hostedDomain = await ask(chalk.white('  Workspace domain to restrict to (optional, e.g. yourcompany.com): '));

  const finalGmailId = gmailId || exGmailId;
  const finalGmailSecret = gmailSecret || exGmailSecret;

  if (finalGmailId && finalGmailSecret) {
    appendToEnv('GOOGLE_GMAIL_CLIENT_ID', finalGmailId);
    appendToEnv('GOOGLE_GMAIL_CLIENT_SECRET', finalGmailSecret);
    if (!config.gmail) config.gmail = {};
    config.gmail.clientId = finalGmailId;
    config.gmail.clientSecret = finalGmailSecret;
    if (hostedDomain.trim()) {
      if (!config.google) config.google = {};
      config.google.hostedDomain = hostedDomain.trim();
      appendToEnv('GOOGLE_HOSTED_DOMAIN', hostedDomain.trim());
    }
    console.log('');
    console.log(chalk.green('  ✓ Gmail credentials saved to ~/.tota/.env'));
    console.log(chalk.bold('  Step 2 — Authorize:'));
    console.log(chalk.dim('  Just ask tota to "check my email" — the browser opens → click Allow.'));
    console.log(chalk.dim('  (Headless? Use the gmail_auth tool to paste the code.)'));
  } else {
    console.log(chalk.yellow('  Skipped — set GOOGLE_GMAIL_CLIENT_ID / GOOGLE_GMAIL_CLIENT_SECRET in ~/.tota/.env later.'));
  }
  } // end gmail section

  // ── Voice TTS/STT setup (only when explicitly requested) ───────────────────
  if (section === 'voice') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Voice — TTS & STT'));
  console.log(chalk.dim('  Configure text-to-speech and speech-to-text providers.'));
  console.log('');
  console.log(chalk.bold('  TTS Provider (Text-to-Speech):'));
  let openaiApiKey = config.providers?.openai?.apiKey || process.env.OPENAI_API_KEY || '';
  let openaiKeyPrompted = false;
  const ensureOpenAIKey = async (): Promise<boolean> => {
    if (openaiKeyPrompted) return !!openaiApiKey;
    openaiKeyPrompted = true;
    const keyPrompt = `  OpenAI API key${openaiApiKey ? ' [keep current]' : ''}: `;
    const key = await ask(chalk.white(keyPrompt));
    const finalKey = key || openaiApiKey;
    if (!finalKey) {
      console.log(chalk.yellow('  Skipped — set OPENAI_API_KEY in ~/.tota/.env later.'));
      return false;
    }
    config.providers.openai.apiKey = finalKey;
    config.providers.openai.enabled = true;
    appendToEnv('OPENAI_API_KEY', finalKey);
    openaiApiKey = finalKey;
    return true;
  };
  const ttsOptions = [
    { value: 'skip',       label: 'Skip / keep current TTS provider' },
    { value: 'openai',     label: 'OpenAI TTS — voices: alloy, echo, fable, onyx, nova, shimmer  [needs OPENAI_API_KEY]' },
    { value: 'elevenlabs', label: 'ElevenLabs — ultra-realistic voices  [needs ELEVENLABS_API_KEY]' },
    { value: 'google',     label: 'Google Cloud TTS — natural voices  [needs GOOGLE_TTS_API_KEY]' },
  ];
  const ttsChoice = await selectWithArrowKeys('TTS Provider', ttsOptions);
  if (ttsChoice !== 'skip') {
    if (!config.voice) config.voice = {};
    config.voice.ttsProvider = ttsChoice as any;
    if (ttsChoice === 'elevenlabs') {
      const existing = (config.voice as any).elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '';
      const key = await ask(chalk.white(`  ElevenLabs API key${existing ? ' [keep current]' : ''}: `));
      if (key) { (config.voice as any).elevenLabsApiKey = key; appendToEnv('ELEVENLABS_API_KEY', key); }
      const vid = await ask(chalk.white('  Voice ID [21m00Tcm4TlvDq8ikWAM = Rachel, Enter to keep]: '));
      if (vid) (config.voice as any).elevenLabsVoiceId = vid;
    } else if (ttsChoice === 'google') {
      const existing = (config.voice as any).googleTtsApiKey || process.env.GOOGLE_TTS_API_KEY || '';
      const key = await ask(chalk.white(`  Google TTS API key${existing ? ' [keep current]' : ''}: `));
      if (key) { (config.voice as any).googleTtsApiKey = key; appendToEnv('GOOGLE_TTS_API_KEY', key); }
    } else if (ttsChoice === 'openai') {
      await ensureOpenAIKey();
      const voiceOptions = [
        { value: 'alloy',   label: 'alloy — neutral, balanced' },
        { value: 'echo',    label: 'echo — male' },
        { value: 'fable',   label: 'fable — British accent' },
        { value: 'onyx',    label: 'onyx — deep, authoritative' },
        { value: 'nova',    label: 'nova — female' },
        { value: 'shimmer', label: 'shimmer — soft, gentle' },
      ];
      const voiceChoice = await selectWithArrowKeys('Default Voice', voiceOptions);
      (config.voice as any).defaultVoice = voiceChoice;
    }
    console.log(chalk.green(`  ✓ TTS provider set to: ${ttsChoice}`));
  }
  console.log('');
  console.log(chalk.bold('  STT Provider (Speech-to-Text / Transcription):'));
  const sttOptions = [
    { value: 'skip',  label: 'Skip / keep current STT provider' },
    { value: 'openai', label: 'OpenAI Whisper (whisper-1)  [needs OPENAI_API_KEY]' },
    { value: 'groq',   label: 'Groq Whisper (whisper-large-v3 — faster & cheaper)  [needs GROQ_API_KEY]' },
  ];
  const sttChoice = await selectWithArrowKeys('STT Provider', sttOptions);
  if (sttChoice !== 'skip') {
    if (!config.voice) config.voice = {};
    config.voice.sttProvider = sttChoice as any;
    if (sttChoice === 'groq') {
      const existing = (config.voice as any).groqApiKey || process.env.GROQ_API_KEY || '';
      const key = await ask(chalk.white(`  Groq API key${existing ? ' [keep current]' : ''}: `));
      if (key) { (config.voice as any).groqApiKey = key; appendToEnv('GROQ_API_KEY', key); }
    } else if (sttChoice === 'openai') {
      await ensureOpenAIKey();
    }
    console.log(chalk.green(`  ✓ STT provider set to: ${sttChoice}`));
  }
  } // end voice section

  // ── Secrets Vault info (only when explicitly requested) ────────────────────
  if (section === 'vault') {
  hr();
  console.log('');
  console.log(chalk.bold.white('  Secrets Vault'));
  console.log(chalk.dim('  tota stores secrets securely using the OS keychain or an encrypted local vault.'));
  console.log('');
  let keytarAvailable = false;
  try {
    await import('keytar');
    keytarAvailable = true;
  } catch {
    keytarAvailable = false;
  }
  const vaultPath = join(homedir(), '.tota', 'vault.enc.json');
  const { existsSync: efs } = await import('node:fs');
  const vaultExists = efs(vaultPath);
  console.log(`  Backend:    ${keytarAvailable ? chalk.green('OS Keychain (macOS Keychain / GNOME Keyring / Windows Credential Manager)') : chalk.yellow('Encrypted file vault (AES-256-GCM)')}`);
  if (!keytarAvailable) {
    console.log(`  Vault file: ${chalk.dim(vaultPath)}${vaultExists ? chalk.green(' (exists)') : chalk.dim(' (empty)')}`);
    console.log(chalk.dim('  To enable OS keychain: npm install -g keytar (requires native build tools)'));
  }
  console.log('');
  console.log(chalk.dim('  Store a secret:  ask tota → "store my API key X as MY_KEY"'));
  console.log(chalk.dim('  Retrieve:        ask tota → "what is MY_KEY?"'));
  console.log(chalk.dim('  Or use tools:    secret_store, secret_get, secret_list, secret_delete'));
  } // end vault section

  hr();
  saveConfig(config);

  const home = getTotaHome();
  console.log('');
  if (section) {
    const label = SETUP_SECTIONS[section] ?? section;
    console.log(chalk.green(`  ✓ ${label} updated in ${home}/tota.yaml`));
  } else {
  console.log(chalk.green(`  ✓ Config saved to ${home}/tota.yaml`));
  console.log(chalk.green(`  ✓ Soul files seeded in ${home}/soul/`));
  console.log(chalk.green(`  ✓ Memory stored in ${home}/memory/`));
  console.log(chalk.green(`  ✓ Permissions seeded in ${home}/permissions.yaml`));
  console.log(chalk.green(`  ✓ Skills directory ready in ${home}/skills/`));
  }
  console.log('');
  if (!section) {
  const _setupScriptPath = process.argv[1] ?? '';
  const _isNpxSetup = _setupScriptPath.includes('_npx') || _setupScriptPath.includes('npx-cache') || _setupScriptPath.includes('.npm/_npx');
  if (_isNpxSetup) {
    console.log(chalk.cyan(`  ${config.identity.name} is ready. Run \`npx tota-agent start\` to chat.`));
    console.log(chalk.yellow('  Tip: Install permanently with `npm i -g tota-agent` so `tota` is always available.'));
  } else {
    console.log(chalk.cyan(`  ${config.identity.name} is ready. Run \`tota start\` to chat.`));
  }
  console.log(chalk.dim('  github.com/manu14357/tota-agent'));
  }
  console.log('');
}
