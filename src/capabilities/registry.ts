import type { Tool } from 'ai';
import { PermissionManager } from './permissions.js';
import { createReadFileTool } from './filesystem/read-file.js';
import { createWriteFileTool } from './filesystem/write-file.js';
import { createCreateFileTool } from './filesystem/create-file.js';
import { createListDirTool } from './filesystem/list-dir.js';
import { createDeleteFileTool } from './filesystem/delete-file.js';
import { createEditFileTool } from './filesystem/edit-file.js';
import { createSendFileTool } from './filesystem/send-file.js';
import { createSendMessageTool } from './messaging/send-message.js';
import { createApproveScopeTool } from './filesystem/approve-scope.js';
import { createRunCommandTool } from './shell/run-command.js';
import { createCdTool } from './shell/cd.js';
import { createApproveCommandTool } from './shell/approve-command.js';
import { createInstallSkillTool } from './skills/install-skill.js';
import { createListSkillsTool } from './skills/list-skills.js';
import { createUseSkillTool } from './skills/use-skill.js';
import { createScheduleTaskTool } from './scheduler/schedule-task.js';
import { createListTasksTool } from './scheduler/list-tasks.js';
import { createCancelTaskTool } from './scheduler/cancel-task.js';
import { createBudgetStatusTool } from './system/budget-status.js';
import { createGitStatusTool } from './git/git-status.js';
import { createGitDiffTool } from './git/git-diff.js';
import { createGitLogTool } from './git/git-log.js';
import { createGitAddTool } from './git/git-add.js';
import { createGitCommitTool } from './git/git-commit.js';
import { createGitPushTool } from './git/git-push.js';
import { createCreatePrTool } from './github/create-pr.js';
import { createReviewPrTool } from './github/review-pr.js';
import { createListIssuesTool } from './github/list-issues.js';
import { createCreateIssueTool } from './github/create-issue.js';
import { createGithubApiTool } from './github/github-api.js';
import { createFetchUrlTool } from './web/fetch-url.js';
import { createWebSearchTool } from './web/web-search.js';
import { createAnalyzeImageTool, type VisionHandler } from './vision/analyze-image.js';
import { createDelegateTaskTool, type DelegateHandler } from './system/delegate-task.js';
import { createRunCodeTool } from './shell/run-code.js';
import { createReadPdfTool } from './filesystem/read-pdf.js';
import { createReadExcelTool, createWriteExcelTool } from './filesystem/read-excel.js';
import { createReadDocxTool } from './filesystem/read-docx.js';
import { createFindFilesTool } from './filesystem/find-files.js';
import {
  createBrowserOpenTool,
  createBrowserClickTool,
  createBrowserTypeTool,
  createBrowserScreenshotTool,
  createBrowserExtractTool,
  createBrowserScrollTool,
  createBrowserCloseTool,
} from './web/browser.js';
import { loadMCPTools } from './mcp/mcp-loader.js';
import { isGitHubConfigured, setGitHubToken } from '../utils/github.js';
import type { SkillLoader } from '../skills/loader.js';
import type { Scheduler } from '../core/scheduler.js';
import type { TokenBudget } from '../utils/tokens.js';
import type { TotaConfig, WebSearchConfig, MCPServerConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface ChatCommandContext {
  toolNames: () => string[];
  skillNames: () => string[];
  config: () => import('../utils/config.js').TotaConfig;
  tokenBudget: () => import('../utils/tokens.js').TokenBudget;
  manual: () => string;
  memorySummary: () => import('../memory/user-memory.js').UserMemorySummary;
  memoryRecent: (limit?: number) => import('../memory/user-memory.js').UserMemoryRecord[];
  memorySearch: (query: string, limit?: number) => import('../memory/user-memory.js').UserMemoryRecord[];
  memorySetLearningPaused: (paused: boolean) => void;
  memoryClear: () => number;
}

export class CapabilityRegistry {
  readonly permissions: PermissionManager;
  private tools: Record<string, Tool> = {};
  private skillLoader?: SkillLoader;
  private scheduler?: Scheduler;
  private tokenBudget?: TokenBudget;
  private sendFileHandler?: (filePath: string) => Promise<void>;
  private sendMessageHandler?: (content: string) => Promise<void>;
  private visionHandler?: VisionHandler;
  private delegateHandler?: DelegateHandler;
  private currentChannelId = 'cli';
  private currentChannelType = 'cli';
  private chatCommandContext?: ChatCommandContext;
  private currentCwd = process.cwd();
  private totaConfig?: TotaConfig;

  constructor(skillLoader?: SkillLoader, scheduler?: Scheduler, tokenBudget?: TokenBudget) {
    this.permissions = new PermissionManager();
    this.skillLoader = skillLoader;
    this.scheduler = scheduler;
    this.tokenBudget = tokenBudget;
  }

  setConfig(config: TotaConfig): void {
    this.totaConfig = config;
  }

  setVisionHandler(handler: VisionHandler): void {
    this.visionHandler = handler;
  }

  setDelegateHandler(handler: DelegateHandler): void {
    this.delegateHandler = handler;
  }

  setChatCommandContext(ctx: ChatCommandContext): void {
    this.chatCommandContext = ctx;
  }

  getChatCommandContext(): ChatCommandContext | undefined {
    return this.chatCommandContext;
  }

  setChannelContext(channelId: string, channelType: string): void {
    this.currentChannelId = channelId;
    this.currentChannelType = channelType;
  }

  getChannelContext(): { channelId: string; channelType: string } {
    return { channelId: this.currentChannelId, channelType: this.currentChannelType };
  }

  getCwd(): string {
    return this.currentCwd;
  }

  setCwd(dir: string): void {
    this.currentCwd = dir;
  }

  setSendFileHandler(handler: (filePath: string) => Promise<void>): void {
    this.sendFileHandler = handler;
  }

  setSendMessageHandler(handler: (content: string) => Promise<void>): void {
    this.sendMessageHandler = handler;
  }

  registerAll(): void {
    const manifest = this.permissions.getManifest();

    if (manifest.capabilities.filesystem.enabled) {
      this.tools.read_file = createReadFileTool(this.permissions, () => this.getCwd());
      this.tools.write_file = createWriteFileTool(this.permissions, () => this.getCwd());
      this.tools.create_file = createCreateFileTool(this.permissions, () => this.getCwd());
      this.tools.list_dir = createListDirTool(this.permissions, () => this.getCwd());
      this.tools.delete_file = createDeleteFileTool(this.permissions, () => this.getCwd());
      this.tools.edit_file = createEditFileTool(this.permissions, () => this.getCwd());

      if (this.sendFileHandler) {
        this.tools.send_file = createSendFileTool(this.permissions, () => this.getCwd(), this.sendFileHandler);
      }

      this.tools.approve_scope = createApproveScopeTool(this.permissions, () => this.getCwd());

      // Document readers
      this.tools.read_pdf = createReadPdfTool(this.permissions, () => this.getCwd());
      this.tools.read_excel = createReadExcelTool(this.permissions, () => this.getCwd());
      this.tools.write_excel = createWriteExcelTool(this.permissions, () => this.getCwd());
      this.tools.read_docx = createReadDocxTool(this.permissions, () => this.getCwd());
      this.tools.find_files = createFindFilesTool(this.permissions, () => this.getCwd());

      logger.info('Filesystem tools registered');
    }

    if (this.sendMessageHandler) {
      this.tools.send_message = createSendMessageTool(this.sendMessageHandler);
      logger.info('Messaging tool registered');
    }

    if (manifest.capabilities.shell.enabled) {
      this.tools.run_command = createRunCommandTool(this.permissions, () => this.getCwd(), (dir: string) => this.setCwd(dir));
      this.tools.cd = createCdTool(() => this.getCwd(), (dir: string) => this.setCwd(dir));
      this.tools.approve_command = createApproveCommandTool(this.permissions);
      logger.info('Shell tools registered');
    }

    if (this.skillLoader) {
      this.tools.install_skill = createInstallSkillTool(this.skillLoader);
      this.tools.list_skills = createListSkillsTool(this.skillLoader);
      this.tools.use_skill = createUseSkillTool(this.skillLoader, this.permissions);
      logger.info('Skill tools registered');
    }

    if (this.scheduler) {
      this.tools.schedule_task = createScheduleTaskTool(this.scheduler, () => this.getChannelContext());
      this.tools.list_scheduled_tasks = createListTasksTool(this.scheduler);
      this.tools.cancel_scheduled_task = createCancelTaskTool(this.scheduler);
      logger.info('Scheduler tools registered');
    }

    if (this.tokenBudget) {
      this.tools.budget_status = createBudgetStatusTool(this.tokenBudget);
      logger.info('Budget tool registered');
    }

    if (manifest.capabilities.git?.enabled) {
      this.tools.git_status = createGitStatusTool(() => this.getCwd());
      this.tools.git_diff = createGitDiffTool(() => this.getCwd());
      this.tools.git_log = createGitLogTool(() => this.getCwd());
      this.tools.git_add = createGitAddTool(() => this.getCwd());
      this.tools.git_commit = createGitCommitTool(() => this.getCwd());
      this.tools.git_push = createGitPushTool(this.permissions, () => this.getCwd());
      logger.info('Git tools registered');
    }

    if (isGitHubConfigured()) {
      this.tools.create_pr = createCreatePrTool();
      this.tools.review_pr = createReviewPrTool();
      this.tools.list_issues = createListIssuesTool();
      this.tools.create_issue = createCreateIssueTool();
      this.tools.github_api = createGithubApiTool();
      logger.info('GitHub tools registered');
    }

    this.tools.fetch_url = createFetchUrlTool();
    logger.info('Web fetch tool registered');

    // Web search tool
    if (this.totaConfig?.webSearch?.enabled !== false) {
      this.tools.web_search = createWebSearchTool(() => this.totaConfig?.webSearch);
      logger.info('Web search tool registered');
    }

    // Vision/image analysis tool
    if (this.visionHandler) {
      this.tools.analyze_image = createAnalyzeImageTool(() => this.visionHandler ?? null);
      logger.info('Vision analysis tool registered');
    }

    // Delegation tool
    if (this.delegateHandler) {
      this.tools.delegate_task = createDelegateTaskTool(() => this.delegateHandler ?? null);
      logger.info('Task delegation tool registered');
    }

    // Code execution sandbox
    this.tools.run_code = createRunCodeTool();
    logger.info('Code execution tool registered');

    // Browser automation
    this.tools.browser_open = createBrowserOpenTool(this.sendFileHandler);
    this.tools.browser_click = createBrowserClickTool();
    this.tools.browser_type = createBrowserTypeTool();
    this.tools.browser_screenshot = createBrowserScreenshotTool(this.sendFileHandler);
    this.tools.browser_extract = createBrowserExtractTool();
    this.tools.browser_scroll = createBrowserScrollTool();
    this.tools.browser_close = createBrowserCloseTool();
    logger.info('Browser automation tools registered');

    // Wrap all tools with output truncation
    this.tools = this.applyTruncation(this.tools);
  }

  /** Async — must be called after registerAll() to load MCP server tools */
  async registerMCPTools(): Promise<void> {
    const servers = this.totaConfig?.mcp?.servers;
    if (!servers || servers.length === 0) return;
    const mcpTools = await loadMCPTools(servers);
    const count = Object.keys(mcpTools).length;
    if (count > 0) {
      const truncated = this.applyTruncation(mcpTools);
      Object.assign(this.tools, truncated);
      logger.info({ count }, 'MCP tools registered');
    }
  }

  /** Wraps every tool's execute to truncate large outputs */
  private applyTruncation(tools: Record<string, Tool>, maxChars = 12000): Record<string, Tool> {
    const wrapped: Record<string, Tool> = {};
    for (const [name, t] of Object.entries(tools)) {
      const originalExecute = (t as any).execute;
      if (typeof originalExecute !== 'function') {
        wrapped[name] = t;
        continue;
      }
      wrapped[name] = {
        ...t,
        execute: async (...args: any[]) => {
          const result = await originalExecute(...args);
          if (typeof result === 'string' && result.length > maxChars) {
            return result.slice(0, maxChars) + `\n\n... [output truncated — ${result.length} chars total, showing first ${maxChars}]`;
          }
          return result;
        },
      } as Tool;
    }
    return wrapped;
  }

  getTools(): Record<string, Tool> {
    return this.tools;
  }

  getToolNames(): string[] {
    return Object.keys(this.tools);
  }

  getSkillContext(): string {
    return this.skillLoader?.getSkillSummariesText() || '';
  }
}
