import type { Identity } from '../soul/identity.js';
import type { TotaConfig } from '../utils/config.js';
import type { TokenBudget } from '../utils/tokens.js';
import type { CapabilityRegistry } from '../capabilities/registry.js';
import type { UserMemoryStore } from '../memory/user-memory.js';

export interface BuildSystemPromptArgs {
  identity: Identity;
  config: TotaConfig;
  tokenBudget: TokenBudget;
  capabilities: CapabilityRegistry;
  userMemory: UserMemoryStore | null;
  channelType?: string;
}

/**
 * Pure builder for the agent's system prompt. Extracted from
 * `Agent.buildSystemPrompt` so the large block of static prompt text and the
 * capability-driven hints live in one place. Takes the agent's collaborators
 * as parameters rather than reading private `this` state.
 */
export function buildSystemPrompt(args: BuildSystemPromptArgs): string {
  const { identity, config, tokenBudget, capabilities, userMemory, channelType } = args;

  let prompt = identity.getSystemPrompt(config.identity);
  const skillContext = capabilities.getSkillContext();
  if (skillContext) {
    prompt += '\n\n' + skillContext;
  }
  const budgetStatus = tokenBudget.getStatusText();
  prompt += '\n\n' + budgetStatus;
  if (tokenBudget.getUsagePercentage() > 70) {
    prompt += '\nBe concise to conserve tokens.';
  }

  prompt += `\n\nEnvironment:\n- Platform: ${process.platform}\n- Working directory: ${capabilities.getCwd()}`;

  if (userMemory) {
    const summary = userMemory.getSummary();
    prompt += `\n\nSecond Brain is ENABLED. You have a persistent, structured memory of ${summary.total} facts about this user.`;
    prompt += `\nMemory types: identity, preference, goal, project, habit, decision, constraint, relationship, episode, reflection.`;
    prompt += `\nRelevant memories are automatically injected before each message. You can reference them naturally (e.g. "I remember you prefer TypeScript").`;
    prompt += `\nUsers can manage memory with: /memory (overview, search, pause learning, clear).`;
    if (summary.learningPaused) {
      prompt += `\nLearning is currently PAUSED — no new memories will be extracted from conversations until resumed.`;
    }
  } else {
    prompt += '\n\nSecond Brain is DISABLED. Basic long-term memory (text search over facts) is still active.';
  }

  const toolNames = capabilities.getToolNames();

  // Computer-use tools hint
  const hasComputerUse = toolNames.includes('computer_screenshot') || toolNames.includes('computer_see');
  if (hasComputerUse) {
    prompt += `\n\nComputer-use tools are ACTIVE on this machine. You can directly control the desktop:
- computer_screenshot: capture the full screen (no arguments needed)
- computer_see: capture screen then analyze it with vision AI (pass a question)
- computer_click: click at x,y coordinates
- computer_type: type text (keyboard input)
- computer_key: press keyboard keys (e.g. "enter", "ctrl+c", "cmd+space")
- computer_move: move mouse to x,y
- computer_scroll: scroll at x,y
- computer_drag: drag from one position to another
- computer_screen_size: get screen width/height

IMPORTANT: When the user asks you to open apps, take screenshots, interact with the desktop, automate UI workflows, or see what is on screen — USE THESE TOOLS. Do not say you cannot see the screen or control the computer. You can. Just call the tool.`;
  }

  // Browser automation tools hint
  const hasBrowser = toolNames.includes('browser_open');
  if (hasBrowser) {
    prompt += `\n\nBrowser automation tools are ACTIVE (Playwright). The browser opens as a VISIBLE window on the desktop:
- browser_open: open a URL in the browser
- browser_click: click a CSS selector or text
- browser_type: type text into an input field (click-to-focus + fill, works on SPAs)
- browser_key: press keyboard keys e.g. "Enter", "Tab", "Escape", "ArrowDown"
- browser_wait: wait for a CSS selector or navigation to complete
- browser_screenshot: screenshot the current page (sends image to user)
- browser_extract: extract text content from a CSS selector
- browser_scroll: scroll the page
- browser_close: close the browser
- browser_engine: switch browser engine — "chromium" (default), "firefox", or "webkit" (Safari)

IMPORTANT RULES:
1. USE THESE TOOLS for all web tasks — visiting sites, filling forms, logging in, reading pages.
2. When the user explicitly provides credentials (email + password) and asks you to log in on their behalf, you MUST do it. The user owns the account, they have given explicit consent, and it is their right to have you automate it. Do NOT refuse.
3. For login flows: browser_open → browser_type (email) → browser_key("Enter") → browser_wait → browser_type (password) → browser_key("Enter") → browser_wait → browser_screenshot.
4. After page transitions, always use browser_wait before reading content or taking screenshots.
5. Use browser_engine to switch engines when the user asks for Firefox or WebKit/Safari, or when a site behaves differently across browsers.`;
  }

  const githubTools = ['create_pr', 'review_pr', 'list_issues', 'create_issue', 'github_api'];
  const hasGitHub = githubTools.some(t => toolNames.includes(t));
  if (hasGitHub) {
    let githubHint = '\n\nGitHub companion is active.';
    const { defaultOwner, defaultRepo } = config.github;
    if (defaultOwner && defaultRepo) {
      githubHint += ` Default repo: ${defaultOwner}/${defaultRepo}. Use this when the user doesn't specify a repo.`;
    }

    githubHint += `

Available GitHub tools and when to use them:
- git_add, git_commit, git_push: LOCAL git operations (stage, commit, push to a remote you have SSH/auth access to). All commits include "Co-authored-by: tota <tota@github.com>".
- create_pr: Create a pull request on GitHub. The head branch must already exist on the remote.
- review_pr: Get PR details and optionally post a review comment.
- list_issues, create_issue: Browse and file issues.
- github_api: Raw GitHub API access. IMPORTANT USE CASES:
  - Push files directly to GitHub via PUT /repos/{owner}/{repo}/contents/{path} when git push fails due to auth. The body must include "message" and "content" (base64-encoded file content). This creates a commit on GitHub with tota as co-author.
  - Delete files via DELETE /repos/{owner}/{repo}/contents/{path} with a "message" and "sha" in the body.
  - Any other GitHub API operation not covered by the other tools.

When the user asks to "push to GitHub" or "upload files" and git push fails, use github_api with PUT /repos/{owner}/{repo}/contents/{path} to push content directly through the API. This bypasses local git entirely.

Always specify owner and repo parameters on GitHub tools. The user's GitHub username is ${config.github.username || 'not set'}.'`;

    prompt += githubHint;
  }

  // Secrets vault
  if (toolNames.includes('secret_store')) {
    prompt += `\n\nSecrets Vault is ACTIVE. Store and retrieve sensitive values (API keys, passwords, tokens) using the OS keychain or encrypted local vault:
- secret_store(name, value): Store a secret securely — ALWAYS use this instead of writing secrets to files
- secret_get(name): Retrieve a stored secret by name
- secret_list(): List all secret names (values never shown)
- secret_delete(name): Remove a secret from the vault
Use this whenever you handle credentials, API keys, or any sensitive data.`;
  }

  // Desktop notifications
  if (toolNames.includes('notify')) {
    prompt += `\n\nDesktop Notifications are ACTIVE. Send native OS notifications to the user's screen:
- notify(title, message, sound?): Send a desktop notification (macOS/Linux/Windows)
Use this to alert the user when long tasks complete, timers fire, or important events happen.`;
  }

  // Clipboard
  if (toolNames.includes('clipboard_read')) {
    prompt += `\n\nClipboard tools are ACTIVE:
- clipboard_read(): Read the current clipboard contents
- clipboard_write(text): Write text to the clipboard for easy pasting
Use these to move data between tota and other applications.`;
  }

  // Voice TTS/STT
  if (toolNames.includes('text_to_speech')) {
    prompt += `\n\nVoice tools are ACTIVE (requires OPENAI_API_KEY):
- text_to_speech(text, voice?, send?): Convert text to speech MP3. Voices: alloy (neutral), echo (male), fable (British), onyx (deep), nova (female), shimmer (soft). Default: alloy.
- transcribe_audio(path, language?): Transcribe an audio file to text using OpenAI Whisper.
When the user sends a Telegram voice message, it is automatically transcribed and delivered as text — just respond naturally to what they said. Use text_to_speech to reply with audio when the conversation context calls for it.`;
  }

  // Google Calendar
  if (toolNames.includes('list_events')) {
    prompt += `\n\nGoogle Calendar tools are ACTIVE:
- calendar_auth(code): Complete OAuth2 authorization (one-time setup)
- list_events(calendar_id?, from?, to?, max_results?): List upcoming events
- create_event(title, start, end, description?, attendees?, location?, calendar_id?): Create a calendar event (times in ISO 8601)
- check_availability(emails[], from, to): Check free/busy status for people
- delete_event(event_id, calendar_id?): Delete an event
If calendar_auth is needed, the tools will return authorization URL instructions. Use list_events or create_event and follow the auth steps if prompted.`;
  }

  // Multi-agent crew
  if (toolNames.includes('spawn_agent')) {
    prompt += `\n\nMulti-Agent Crew is ACTIVE. Spawn specialized sub-agents with custom roles and tool restrictions:
- spawn_agent(role, task, allowed_tools?): Create a specialized agent to handle a focused sub-task
Example roles: "You are a security researcher..." / "You are a senior Python developer..." / "You are a data analyst..."
Use allowed_tools to restrict what tools the sub-agent can use (e.g. ["read_file","run_code"] for a coder agent).
Results flow back to you. Chain multiple spawn_agent calls to build multi-step pipelines.`;
  }

  // WhatsApp channel awareness
  if (channelType === 'whatsapp' || toolNames.includes('whatsapp_send')) {
    prompt += `\n\nWhatsApp channel is ACTIVE and BIDIRECTIONAL:
- You receive incoming WhatsApp messages from the user in real time — the message you are replying to RIGHT NOW came in via WhatsApp.
- The full conversation history with this contact is available in your context above.
- Use send_message to reply in this same WhatsApp thread.
- Use whatsapp_send(phone, message) ONLY when you need to message a DIFFERENT phone number.
- You can read everything the user sent you — you have full access to the conversation. Never claim you cannot read or see their messages.
- Do NOT say you have "only outbound access" — that is wrong. You read every incoming message and the whole chat history is your context.`;
  }

  return prompt;
}
