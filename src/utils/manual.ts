import chalk from 'chalk';

export function getManual(): string {
  const sections: string[] = [];

  sections.push('');
  sections.push(chalk.bold.cyan('  TOTA — Capabilities & Commands'));
  sections.push(chalk.dim('  ─────────────────────────────────────────'));
  sections.push('');

  sections.push(chalk.bold.white('  Built-in Tools'));
  sections.push(chalk.dim('  Tools tota can use during conversations.'));
  sections.push('');

  const tools = [
    ['read_file', 'Read file contents', 'path (required)'],
    ['write_file', 'Write to an existing file', 'path, content'],
    ['create_file', 'Create a new file (+ dirs)', 'path, content'],
    ['edit_file', 'Replace specific text in a file', 'path, old_string, new_string'],
    ['list_dir', 'List directory contents', 'path'],
    ['delete_file', 'Delete a file', 'path'],
    ['find_files', 'Find files matching a glob pattern', 'pattern, path?'],
    ['send_file', 'Send a local file to the user via the active channel', 'path'],
    ['approve_scope', 'Permanently approve a file/directory scope', 'path'],
    ['read_pdf', 'Extract text from a PDF file', 'path'],
    ['read_excel', 'Read an Excel/XLSX file as text', 'path, sheet?'],
    ['write_excel', 'Write data to an Excel/XLSX file', 'path, data, sheet?'],
    ['read_docx', 'Extract text from a Word .docx file', 'path'],
    ['send_message', 'Send a message to the user on their current channel (WhatsApp or Telegram)', 'content'],
    ['whatsapp_send', 'Send a WhatsApp message to a specific phone number (must be on approved list)', 'phone, message'],
    ['notify', 'Send a desktop notification (macOS/Linux/Windows)', 'title, message, sound?'],
    ['clipboard_read', 'Read the current clipboard contents', '—'],
    ['clipboard_write', 'Write text to the clipboard', 'text'],
    ['run_command', 'Execute a shell command', 'command'],
    ['cd', 'Change the working directory', 'path'],
    ['run_code', 'Execute code in a sandbox (Python/JS/Bash/TS/Ruby/Go)', 'language, code, timeout?, stdin?'],
    ['approve_command', 'Permanently approve a command type', 'command (e.g. "curl")'],
    ['fetch_url', 'Fetch a URL and return content', 'url, format? (text/markdown)'],
    ['web_search', 'Search the web (Brave/Serper/Tavily — needs API key in env)', 'query, max_results?'],
    ['analyze_image', 'Analyze a local image or URL (vision-capable model required)', 'path_or_url, prompt?'],
    ['delegate_task', 'Spawn a sub-agent for a focused sub-task', 'task, context?'],
    ['git_status', 'Show working tree status', 'path?'],
    ['git_diff', 'Show file changes', 'path?, staged?'],
    ['git_log', 'Show commit history', 'count?, path?'],
    ['git_add', 'Stage files for commit', 'paths (array)'],
    ['git_commit', 'Create a commit', 'message'],
    ['git_push', 'Push to remote (needs approval)', 'remote?, branch?'],
    ['install_skill', 'Install a skill from content or URL', 'content? or url?'],
    ['list_skills', 'List installed skills', '—'],
    ['use_skill', 'Invoke a skill by name', 'name'],
    ['schedule_task', 'Schedule a recurring or delayed task', 'cron? or delay_seconds, description, prompt? or skill_name?'],
    ['list_scheduled_tasks', 'List all scheduled tasks', '—'],
    ['cancel_scheduled_task', 'Cancel a scheduled task', 'id'],
    ['budget_status', 'Check token budget', '—'],
    ['mcp_<server>_<tool>', 'MCP plugin tools (loaded from ~/.tota/tota.yaml mcp.servers)', 'varies per server'],
    ['browser_open', 'Open a URL in a browser (visible window by default)', 'url'],
    ['browser_click', 'Click an element on the current page', 'selector'],
    ['browser_type', 'Type text into an input on the current page (SPA-safe)', 'selector, text'],
    ['browser_key', 'Press a keyboard key in the browser (Enter, Tab, Escape, …)', 'key, count?'],
    ['browser_wait', 'Wait for a CSS selector or page navigation to complete', 'selector? or wait_for_navigation'],
    ['browser_screenshot', 'Take a screenshot of the current page', '—'],
    ['browser_extract', 'Extract text/HTML from the current page', 'selector?'],
    ['browser_scroll', 'Scroll the current page', 'direction, amount?'],
    ['browser_close', 'Close the browser session', '—'],
    ['browser_engine', 'Switch browser engine: chromium (default), firefox, or webkit', 'engine'],
    // Computer-use tools (enabled via COMPUTER_USE_ENABLED=true or capabilities.computer.enabled)
    ['computer_screenshot', 'Take a screenshot of the primary display (or a region)', 'region?, send_to_user?'],
    ['computer_see', 'Screenshot + vision AI analysis of the screen', 'question?, region?'],
    ['computer_click', 'Click the mouse at screen coordinates', 'x, y, button? (left/right/double)'],
    ['computer_move', 'Move the mouse cursor to coordinates', 'x, y'],
    ['computer_type', 'Type text at the current keyboard focus', 'text, delay_ms?'],
    ['computer_key', 'Press a key or key combo (e.g. cmd+c, enter)', 'keys'],
    ['computer_scroll', 'Scroll mouse wheel at a position', 'x, y, direction, amount?'],
    ['computer_drag', 'Click and drag between two positions', 'from_x, from_y, to_x, to_y'],
    ['computer_screen_size', 'Get primary display resolution in pixels', '—'],
    ['adb_devices', 'List connected Android devices', '—'],
    ['adb_screenshot', 'Take a screenshot of an Android device', 'device?, send_to_user?'],
    ['adb_see', 'Screenshot + vision AI for an Android device', 'question?, device?'],
    ['adb_tap', 'Tap a coordinate on an Android screen', 'x, y, device?'],
    ['adb_swipe', 'Swipe on an Android screen', 'from_x, from_y, to_x, to_y, duration_ms?, device?'],
    ['adb_type', 'Type text on an Android device', 'text, device?'],
    ['adb_key', 'Send an Android key event (3=HOME, 4=BACK, 66=ENTER…)', 'keycode, device?'],
    ['adb_shell', 'Run adb shell command on Android device', 'command, device?'],
    ['adb_pull', 'Pull a file from Android device', 'remote, local, device?'],
    ['adb_push', 'Push a file to Android device', 'local, remote, device?'],
    // Secrets vault
    ['secret_store', 'Store a secret in OS keychain / encrypted vault', 'name, value'],
    ['secret_get', 'Retrieve a stored secret by name', 'name'],
    ['secret_list', 'List all secret names (values not shown)', '—'],
    ['secret_delete', 'Delete a secret from the vault', 'name'],
    // Desktop notifications
    // (notify, clipboard_read, clipboard_write listed above)
    // Voice TTS/STT
    ['text_to_speech', 'Convert text to speech MP3 (OpenAI/ElevenLabs/Google)', 'text, voice?, provider?, send?'],
    ['transcribe_audio', 'Transcribe audio file to text (OpenAI Whisper / Groq)', 'path, language?, provider?'],
    // Google Calendar
    ['calendar_auth', 'Manual OAuth2 fallback (headless envs only)', 'code'],
    ['list_events', 'List upcoming Google Calendar events', 'calendar_id?, from?, to?, max_results?'],
    ['create_event', 'Create a Google Calendar event', 'title, start, end, description?, attendees?, location?'],
    ['check_availability', 'Check free/busy status for people', 'emails[], from, to'],
    ['delete_event', 'Delete a Google Calendar event', 'event_id, calendar_id?'],
    // Multi-agent crew
    ['spawn_agent', 'Spawn a specialized sub-agent with a custom role', 'role, task, allowed_tools?'],
  ];

  for (const [name, desc, params] of tools) {
    sections.push(`  ${chalk.cyan(name.padEnd(24))} ${desc}`);
    sections.push(`  ${' '.repeat(24)} ${chalk.dim(params)}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  CLI Commands'));
  sections.push(chalk.dim('  Run these from your terminal (no API calls consumed).'));
  sections.push('');

  const commands = [
    ['tota up', 'Start persistently (install service + daemon)'],
    ['tota', 'Start the agent (same as tota start)'],
    ['tota start', 'Start the agent in foreground'],
    ['tota start -d', 'Start in background (daemon mode)'],
    ['tota restart', 'Restart a background process'],
    ['tota stop', 'Stop a background process'],
    ['tota logs', 'Show recent daemon logs (last 100 lines)'],
    ['tota logs -f', 'Live-follow daemon logs (Ctrl+C to stop)'],
    ['tota logs -n <n>', 'Show last N lines of daemon logs'],
    ['tota logs --clear', 'Clear the daemon log file'],
    ['tota doctor', 'Reconfigure settings (Enter keeps current)'],
    ['tota setup', 'Re-run the full setup wizard'],
    ['tota setup llm', 'Configure LLM providers only'],
    ['tota setup telegram', 'Configure Telegram only'],
    ['tota setup whatsapp', 'Configure WhatsApp channel'],
    ['tota setup github', 'Configure GitHub integration only'],
    ['tota setup websearch', 'Configure Web Search key only'],
    ['tota setup browser', 'Install Playwright browser binaries (Chromium, Firefox, WebKit)'],
    ['tota setup computer', 'Enable/disable computer-use & Android ADB tools'],
    ['tota setup api', 'Configure REST API channel only'],
    ['tota setup budget', 'Configure token budget only'],
    ['tota setup identity', 'Configure name and owner only'],
    ['tota setup calendar', 'Configure Google Calendar OAuth2 credentials'],
    ['tota setup voice', 'Configure TTS/STT providers (OpenAI/ElevenLabs/Google/Groq)'],
    ['tota setup vault', 'Show secrets vault backend and usage info'],
    ['tota status', 'Show config and daemon status'],
    ['tota telegram list', 'Show Telegram admins, members, and pending requests'],
    ['tota telegram approve <code|id>', 'Approve the first Telegram pairing code or a later Telegram request'],
    ['tota telegram reject <id>', 'Reject a pending Telegram request'],
    ['tota telegram remove <id>', 'Remove an approved Telegram user'],
    ['tota telegram promote <id>', 'Promote a Telegram member to admin'],
    ['tota telegram demote <id>', 'Demote a Telegram admin to member'],
    ['tota telegram unpair', 'Reset all Telegram access'],
    ['tota whatsapp status', 'Show WhatsApp linked state and access list'],
    ['tota whatsapp setup', 'Run the WhatsApp setup wizard'],
    ['tota whatsapp link', 'Show QR code to link your WhatsApp device'],
    ['tota whatsapp allow <phone>', 'Add a phone to the allowed list'],
    ['tota whatsapp disallow <phone>', 'Remove a phone from the allowed list'],
    ['tota whatsapp approve <phone>', 'Approve a pending WhatsApp access request'],
    ['tota whatsapp reject <phone>', 'Reject a pending WhatsApp access request'],
    ['tota whatsapp remove <phone>', 'Remove a number from WhatsApp access'],
    ['tota whatsapp pending', 'List pending WhatsApp access requests'],
    ['tota whatsapp revoke', 'Delete WhatsApp session auth and clear access lists'],
    ['tota help', 'Show this manual'],
    ['tota service install', 'Install as system service (auto-start)'],
    ['tota service uninstall', 'Uninstall system service'],
    ['tota service status', 'Show system service status'],
    ['tota upgrade', 'Upgrade tota to the latest version from npm'],
    ['tota --verbose', 'Start with debug logging on stderr'],
  ];

  for (const [cmd, desc] of commands) {
    sections.push(`  ${chalk.white(cmd.padEnd(26))} ${desc}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  In-Chat Commands'));
  sections.push(chalk.dim('  Type these during a conversation (no API calls).'));
  sections.push('');

  const chat = [
    ['/start', 'Start Telegram pairing or request Telegram access'],
    ['/pair', 'Start Telegram pairing or request Telegram access'],
    ['/', 'Open the CLI command picker with arrow-key navigation'],
    ['/menu', 'Open the CLI command picker with arrow-key navigation'],
    ['/help', 'Show this manual'],
    ['/status', 'Show config and budget info'],
    ['/telegram', 'CLI chat only: open the Telegram management menu'],
    ['/telegram pending', 'CLI chat only: list pending Telegram requests'],
    ['/telegram users', 'CLI chat only: list approved Telegram users'],
    ['/telegram approve <code|id>', 'CLI chat only: approve the first pairing code or a later request'],
    ['/telegram reject <id>', 'CLI chat only: reject a pending Telegram request'],
    ['/telegram remove <id>', 'CLI chat only: remove an approved Telegram user'],
    ['/telegram promote <id>', 'CLI chat only: promote a Telegram member to admin'],
    ['/telegram demote <id>', 'CLI chat only: demote a Telegram admin to member'],
    ['/telegram reset', 'CLI chat only: reset all Telegram access'],
    ['/tools', 'List currently loaded tools'],
    ['/skills', 'List installed skills'],
    ['/permissions', 'Change permission mode (Ask Me / Allow All)'],
    ['/tasks', 'List scheduled tasks'],
    ['/memory', 'View and manage second brain memory'],
    ['/stream', 'Toggle text streaming on/off (Telegram)'],
    ['/stream on', 'Enable streaming (live text updates)'],
    ['/stream off', 'Disable streaming (single message)'],
    ['/budget', 'Show current token budget status'],
    ['/budget override', 'Allow one more request past the daily budget'],
    ['/budget reset', 'Reset daily token usage to zero'],
    ['/budget set <n>', 'Set a new daily token budget'],
    ['/exit', 'Shut down tota (also /quit)'],
    ['/unpair', 'Reset all Telegram access for this tota instance (admins only)'],
  ];

  for (const [cmd, desc] of chat) {
    sections.push(`  ${chalk.white(cmd.padEnd(16))} ${desc}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Permissions'));
  sections.push('');

  const perms = [
    'Commands are blocked (never run), auto-approved, or need approval.',
    'Say "always" when prompted to permanently approve a command type.',
    'Edit ~/.tota/permissions.yaml to customize manually.',
    'File access is scoped — new paths need approval (y/n/always).',
    'At session start, choose "Ask Me" (confirm each action) or "Allow All" (auto-approve everything).',
    'Scheduled tasks always run in Allow All mode.',
  ];

  for (const p of perms) {
    sections.push(`  ${chalk.dim('•')} ${p}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Skills'));
  sections.push('');

  const skillInfo = [
    'Skills live in ~/.tota/skills/<name>/SKILL.md',
    'Install: ask tota to "install skill from <url>" or paste content',
    'Invoke: ask tota to "use skill <name>"',
    'Schedule: "remind me daily at 9am to run daily-digest skill"',
  ];

  for (const s of skillInfo) {
    sections.push(`  ${chalk.dim('•')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Scheduling'));
  sections.push('');

  const schedInfo = [
    'Recurring: "every day at 9am remind me to…"',
    'One-shot: "remind me in 15 seconds to…"',
    'Tasks persist to ~/.tota/schedules.yaml',
  ];

  for (const s of schedInfo) {
    sections.push(`  ${chalk.dim('•')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Web Search'));
  sections.push('');

  const webInfo = [
    'Set one of these env vars (or run tota setup websearch / tota doctor) to enable web_search:',
    '  BRAVE_API_KEY    — Brave Search (brave.com/search/api)',
    '  SERPER_API_KEY   — Serper (serper.dev)',
    '  TAVILY_API_KEY   — Tavily (tavily.com)',
    'Auto-detected: tota picks whichever key it finds. Pin with WEB_SEARCH_PROVIDER=brave|serper|tavily',
    'Disable entirely: WEB_SEARCH_ENABLED=false',
    'Ask tota: "search the web for <query>" once a key is set.',
  ];

  for (const s of webInfo) {
    sections.push(`  ${chalk.dim('\u2022')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Vision / Image Analysis'));
  sections.push('');

  const visionInfo = [
    'Requires a vision-capable model (OpenAI gpt-4o, Anthropic claude-3-5-sonnet, Gemini, etc.).',
    'Supports JPEG, PNG, GIF, WebP — local files or image URLs.',
    'Ask tota: "analyze this image: /path/to/file.png" or "what is in https://…/photo.jpg"',
    'Used automatically by computer_see and adb_see for screen understanding.',
  ];

  for (const s of visionInfo) {
    sections.push(`  ${chalk.dim('\u2022')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Browser Automation'));
  sections.push('');

  const browserInfo = [
    'Playwright-powered browser automation — Chromium, Firefox, or WebKit (Safari). No API keys needed.',
    'Install all browser binaries once: npx playwright install chromium firefox webkit',
    'Or run the wizard:               tota setup browser',
    'Default engine: Chromium. Switch with browser_engine e.g. "switch to Firefox".',
    'Browser opens as a VISIBLE window by default. Set PLAYWRIGHT_HEADLESS=true to run headless.',
    'Tools: browser_open, browser_click, browser_type, browser_key, browser_wait,',
    '       browser_screenshot, browser_extract, browser_scroll, browser_close, browser_engine',
    'Examples:',
    '  "Open https://example.com and take a screenshot"',
    '  "Switch to Firefox engine and open https://mozilla.org"',
    '  "Log into GitHub with my credentials"',
    '  "Extract all links from the current page"',
  ];

  for (const s of browserInfo) {
    sections.push(`  ${chalk.dim('\u2022')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Computer-Use (Desktop Control)'));
  sections.push('');

  const computerInfo = [
    'Enable: add COMPUTER_USE_ENABLED=true to ~/.tota/.env, or run: tota setup computer',
    'macOS, Linux, Windows — cross-platform via @nut-tree-fork/nut-js.',
    'Linux extra dep: sudo apt install libxtst-dev',
    'Desktop tools: computer_screenshot, computer_see, computer_click, computer_move,',
    '               computer_type, computer_key, computer_scroll, computer_drag, computer_screen_size',
    'Examples:',
    '  "Look at my screen and tell me what is open"',
    '  "Click the button at 640, 480"',
    '  "Type hello world and press Enter"',
    '  "Press cmd+c"',
    '  "Drag from 100,200 to 500,200"',
    '  "What is my screen resolution?"',
  ];

  for (const s of computerInfo) {
    sections.push(`  ${chalk.dim('\u2022')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Android Control (ADB)'));
  sections.push('');

  const adbInfo = [
    'Enable: same flag as computer-use — COMPUTER_USE_ENABLED=true',
    'Requires adb in your PATH and a connected device/emulator.',
    'Tools: adb_devices, adb_screenshot, adb_see, adb_tap, adb_swipe, adb_type,',
    '       adb_key, adb_shell, adb_pull, adb_push',
    'Examples:',
    '  "List my connected Android devices"',
    '  "Take a screenshot of my Android phone and describe what is on screen"',
    '  "Tap at 540, 960 on my phone"',
    '  "Press the Android back button (key 4)"',
    '  "Run pm list packages on my Android device"',
    '  "Pull /sdcard/Download/file.pdf from the device"',
  ];

  for (const s of adbInfo) {
    sections.push(`  ${chalk.dim('•')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  REST API Channel'));
  sections.push('');

  const apiInfo = [
    'Expose a local HTTP endpoint so scripts/apps can message tota.',
    'Enable it during setup (tota setup / tota doctor) or set env vars:',
    '  API_CHANNEL_ENABLED=true  — enable the channel',
    '  API_CHANNEL_PORT          — port to listen on (default: 3001)',
    '  API_CHANNEL_KEY           — Bearer/X-Api-Key token (optional auth)',
    'POST /message  { "content": "..." }  →  { "reply": "..." }',
    'GET  /status                         →  { "status": "ok", "ready": true }',
  ];

  for (const s of apiInfo) {
    sections.push(`  ${chalk.dim('•')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  WhatsApp Channel'));
  sections.push('');

  const waInfo = [
    'Use tota from WhatsApp — no Meta Business API or phone number required.',
    'Based on WhatsApp Web (Baileys). Scan a QR code from WhatsApp → Linked Devices.',
    'Enable during setup or with environment variables:',
    '  WHATSAPP_ENABLED=true          — enable the channel',
    '  WHATSAPP_AUTH_DIR=<path>        — where to store session auth (default: ~/.tota/whatsapp-auth)',
    '  WHATSAPP_ALLOW_FROM=+1555…,+44… — comma-separated allowed phone numbers (E.164)',
    '  WHATSAPP_ALLOW_GROUPS=true      — allow group messages (disabled by default)',
    'Quick start:',
    '  1. Run: tota setup whatsapp',
    '  2. Run: tota whatsapp link   (scan the QR code from WhatsApp)',
    '  3. Run: tota start',
    'Manage access:',
    '  tota whatsapp allow +15551234567    — pre-allow a number',
    '  tota whatsapp pending               — view access requests',
    '  tota whatsapp approve +15551234567  — approve a request',
    '  tota whatsapp remove +15551234567   — revoke access',
    '  tota whatsapp revoke                — delete session auth and re-link from scratch',
    'Agent tools:',
    '  send_message                        — sends back to the user on whichever channel they are on',
    '  whatsapp_send <phone> <message>     — send to a specific phone (must be on approved list)',
  ];

  for (const s of waInfo) {
    sections.push(`  ${chalk.dim('•')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  MCP Plugins'));
  sections.push('');

  const mcpInfo = [
    'Connect any JSON-RPC MCP server by adding it to ~/.tota/tota.yaml:',
    '  mcp:',
    '    servers:',
    '      - name: myserver',
    '        url: http://localhost:4000',
    '        apiKey: optional-key',
    'Tools are auto-loaded as mcp_<server>_<tool> at startup.',
  ];

  for (const s of mcpInfo) {
    sections.push(`  ${chalk.dim('•')} ${s}`);
  }

  sections.push('');
  sections.push(chalk.bold.white('  Configuration'));
  sections.push('');

  const configInfo = [
    ['~/.tota/tota.yaml', 'Main config (providers, channels, budget, MCP servers)'],
    ['~/.tota/permissions.yaml', 'Capabilities and approval rules'],
    ['~/.tota/whatsapp-auth/', 'WhatsApp session credentials (generated on link)'],
    ['~/.tota/soul/*.md', 'Agent personality (soul, persona, taste, heartbeat)'],
    ['~/.tota/skills/', 'Installed skills'],
    ['~/.tota/schedules.yaml', 'Scheduled tasks'],
    ['~/.tota/token-usage.json', 'Daily token usage tracking'],
    ['~/.tota/.env', 'API keys & env overrides (web search, GitHub)'],
    ['~/.tota/memory/', 'Short-term, long-term, episodic memory'],
  ];

  for (const [path, desc] of configInfo) {
    sections.push(`  ${chalk.dim(path.padEnd(36))} ${desc}`);
  }

  sections.push('');
  sections.push(chalk.dim('  github.com/manu14357/tota-agent'));
  sections.push('');

  return sections.join('\n');
}
