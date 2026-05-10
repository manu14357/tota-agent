import { z } from 'zod';

const TOOL_LABELS: Record<string, { icon: string; label: string; argKey?: string; argTransform?: (v: string) => string }> = {
  // ── Filesystem ───────────────────────────────────────────────────────────────
  fetch_url:          { icon: '↗',  label: 'Fetching',            argKey: 'url',     argTransform: extractDomain },
  read_file:          { icon: '📄', label: 'Reading',             argKey: 'path',    argTransform: basename },
  write_file:         { icon: '✏️', label: 'Writing',             argKey: 'path',    argTransform: basename },
  create_file:        { icon: '✨', label: 'Creating',            argKey: 'path',    argTransform: basename },
  edit_file:          { icon: '✂️', label: 'Editing',             argKey: 'path',    argTransform: basename },
  delete_file:        { icon: '🗑',  label: 'Deleting',            argKey: 'path',    argTransform: basename },
  list_dir:           { icon: '📂', label: 'Listing',             argKey: 'path',    argTransform: basename },
  find_files:         { icon: '🔍', label: 'Finding files',       argKey: 'pattern', argTransform: truncate(30) },
  approve_scope:      { icon: '🔓', label: 'Approving scope' },
  read_pdf:           { icon: '📕', label: 'Reading PDF',         argKey: 'path',    argTransform: basename },
  read_excel:         { icon: '📊', label: 'Reading Excel',       argKey: 'path',    argTransform: basename },
  write_excel:        { icon: '📊', label: 'Writing Excel',       argKey: 'path',    argTransform: basename },
  read_docx:          { icon: '📝', label: 'Reading Word doc',    argKey: 'path',    argTransform: basename },
  // ── Shell ────────────────────────────────────────────────────────────────────
  run_command:        { icon: '⌨',  label: 'Running command',     argKey: 'command', argTransform: truncate(40) },
  run_code:           { icon: '🖥',  label: 'Running code',        argKey: 'language' },
  cd:                 { icon: '📂', label: 'Changing dir to',     argKey: 'path' },
  approve_command:    { icon: '✅', label: 'Approving command' },
  // ── Messaging ────────────────────────────────────────────────────────────────
  send_message:       { icon: '💬', label: 'Sending message' },
  whatsapp_send:      { icon: '📱', label: 'Sending WhatsApp to', argKey: 'phone' },
  send_file:          { icon: '📎', label: 'Sending file',        argKey: 'path',    argTransform: basename },
  text_to_speech:     { icon: '🔊', label: 'Speaking',            argKey: 'text',    argTransform: truncate(30) },
  transcribe_audio:   { icon: '🎙',  label: 'Transcribing',        argKey: 'path',    argTransform: basename },
  // ── Calendar ─────────────────────────────────────────────────────────────────
  calendar_auth:      { icon: '📅', label: 'Authorising calendar' },
  list_events:        { icon: '📅', label: 'Listing events' },
  create_event:       { icon: '📅', label: 'Creating event',      argKey: 'title',   argTransform: truncate(30) },
  check_availability: { icon: '📅', label: 'Checking availability' },
  delete_event:       { icon: '📅', label: 'Deleting event' },
  // ── Git ──────────────────────────────────────────────────────────────────────
  git_status:         { icon: '📊', label: 'Git status' },
  git_diff:           { icon: '📝', label: 'Git diff' },
  git_log:            { icon: '📋', label: 'Git log' },
  git_add:            { icon: '➕', label: 'Staging files' },
  git_commit:         { icon: '💾', label: 'Committing' },
  git_push:           { icon: '⬆',  label: 'Pushing' },
  // ── GitHub ───────────────────────────────────────────────────────────────────
  create_pr:          { icon: '🔀', label: 'Creating PR' },
  review_pr:          { icon: '👀', label: 'Reviewing PR' },
  list_issues:        { icon: '📋', label: 'Listing issues' },
  create_issue:       { icon: '🐛', label: 'Creating issue' },
  github_api:         { icon: '🔀', label: 'GitHub API',          argKey: 'path',    argTransform: truncate(30) },
  // ── Web ──────────────────────────────────────────────────────────────────────
  web_search:         { icon: '🔍', label: 'Searching web',       argKey: 'query',   argTransform: truncate(40) },
  analyze_image:      { icon: '🖼',  label: 'Analysing image' },
  // ── Browser automation ────────────────────────────────────────────────────────
  browser_open:       { icon: '🌐', label: 'Opening URL',         argKey: 'url',     argTransform: extractDomain },
  browser_click:      { icon: '🖱',  label: 'Clicking',           argKey: 'selector', argTransform: truncate(30) },
  browser_type:       { icon: '⌨',  label: 'Typing into',         argKey: 'selector', argTransform: truncate(30) },
  browser_key:        { icon: '⌨',  label: 'Pressing key',        argKey: 'key' },
  browser_wait:       { icon: '⏳', label: 'Waiting for',         argKey: 'selector', argTransform: truncate(30) },
  browser_screenshot: { icon: '📸', label: 'Browser screenshot' },
  browser_extract:    { icon: '📄', label: 'Extracting content' },
  browser_scroll:     { icon: '↕',  label: 'Scrolling page' },
  browser_close:      { icon: '🌐', label: 'Closing browser' },
  browser_engine:     { icon: '🌐', label: 'Switching engine',    argKey: 'engine' },
  // ── Computer use ─────────────────────────────────────────────────────────────
  computer_screenshot:{ icon: '📸', label: 'Screen screenshot' },
  computer_see:       { icon: '👁',  label: 'Looking at screen' },
  computer_click:     { icon: '🖱',  label: 'Clicking screen' },
  computer_move:      { icon: '🖱',  label: 'Moving cursor' },
  computer_type:      { icon: '⌨',  label: 'Typing on desktop' },
  computer_key:       { icon: '⌨',  label: 'Pressing key',        argKey: 'keys' },
  computer_scroll:    { icon: '↕',  label: 'Scrolling screen' },
  computer_drag:      { icon: '🖱',  label: 'Dragging on screen' },
  computer_screen_size:{ icon: '🖥', label: 'Getting screen size' },
  // ── ADB / Android ─────────────────────────────────────────────────────────────
  adb_devices:        { icon: '📱', label: 'Listing Android devices' },
  adb_screenshot:     { icon: '📸', label: 'Android screenshot' },
  adb_see:            { icon: '👁',  label: 'Looking at Android screen' },
  adb_tap:            { icon: '👆', label: 'Tapping Android screen' },
  adb_swipe:          { icon: '👆', label: 'Swiping Android screen' },
  adb_type:           { icon: '⌨',  label: 'Typing on Android' },
  adb_key:            { icon: '⌨',  label: 'Android key event',   argKey: 'keycode' },
  adb_shell:          { icon: '⌨',  label: 'Android shell',       argKey: 'command', argTransform: truncate(30) },
  adb_pull:           { icon: '📥', label: 'Pulling from Android', argKey: 'remote',  argTransform: basename },
  adb_push:           { icon: '📤', label: 'Pushing to Android',   argKey: 'local',   argTransform: basename },
  // ── Skills ───────────────────────────────────────────────────────────────────
  use_skill:          { icon: '🧠', label: 'Using skill',          argKey: 'name' },
  list_skills:        { icon: '📋', label: 'Listing skills' },
  install_skill:      { icon: '📥', label: 'Installing skill' },
  // ── Scheduler ────────────────────────────────────────────────────────────────
  schedule_task:          { icon: '⏰', label: 'Scheduling task' },
  list_scheduled_tasks:   { icon: '📋', label: 'Listing scheduled tasks' },
  cancel_scheduled_task:  { icon: '❌', label: 'Cancelling task' },
  // ── System ───────────────────────────────────────────────────────────────────
  budget_status:      { icon: '💰', label: 'Budget status' },
  notify:             { icon: '🔔', label: 'Notifying',            argKey: 'title',   argTransform: truncate(30) },
  clipboard_read:     { icon: '📋', label: 'Reading clipboard' },
  clipboard_write:    { icon: '📋', label: 'Writing clipboard' },
  secret_store:       { icon: '🔐', label: 'Storing secret',       argKey: 'name' },
  secret_get:         { icon: '🔐', label: 'Getting secret',       argKey: 'name' },
  secret_list:        { icon: '🔐', label: 'Listing secrets' },
  secret_delete:      { icon: '🔐', label: 'Deleting secret',      argKey: 'name' },
  delegate_task:      { icon: '🤖', label: 'Delegating task' },
  spawn_agent:        { icon: '🤖', label: 'Spawning agent',        argKey: 'role',    argTransform: truncate(30) },
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

function truncate(maxLen: number): (v: string) => string {
  return (v: string) => v.length > maxLen ? v.slice(0, maxLen) + '…' : v;
}

export function formatToolStep(toolName: string, args: Record<string, any>): string {
  const config = TOOL_LABELS[toolName];
  if (!config) {
    return toolName;
  }

  let detail = '';
  if (config.argKey && args[config.argKey] !== undefined) {
    const raw = String(args[config.argKey]);
    detail = config.argTransform ? config.argTransform(raw) : raw;
  }

  return detail ? `${config.icon} ${config.label} ${detail}` : `${config.icon} ${config.label}`;
}

export function formatToolResult(toolName: string, result: unknown): string {
  if (result == null) return '';
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  if (!str) return '';

  if (str.startsWith('Error') || str.startsWith('⚠')) {
    const first = str.split('\n')[0];
    return first.length > 80 ? first.slice(0, 77) + '…' : first;
  }

  const RESULT_HINTS: Record<string, (s: string) => string> = {
    // Filesystem
    read_file:           (s) => `${s.split('\n').length} lines`,
    write_file:          (s) => s.startsWith('Success') ? 'saved' : trimFirst(s),
    create_file:         (s) => s.startsWith('Success') ? 'created' : trimFirst(s),
    edit_file:           (s) => s.startsWith('Success') ? 'edited' : trimFirst(s),
    delete_file:         (s) => s.startsWith('Success') ? 'deleted' : trimFirst(s),
    list_dir:            (s) => `${s.split('\n').filter(Boolean).length} entries`,
    find_files:          (s) => `${s.split('\n').filter(Boolean).length} files`,
    read_pdf:            (s) => `${s.split('\n').length} lines`,
    read_excel:          (s) => `${s.split('\n').length} lines`,
    write_excel:         (s) => s.startsWith('Success') ? 'saved' : trimFirst(s),
    read_docx:           (s) => `${s.split('\n').length} lines`,
    approve_scope:       () => 'approved',
    // Shell
    run_command:         (s) => {
      if (s.includes('exited with code')) return s.split('\n')[0];
      const lines = s.split('\n').filter(Boolean).length;
      return lines <= 1 ? trimFirst(s) : `${lines} lines output`;
    },
    run_code:            (s) => {
      const lines = s.split('\n').filter(Boolean).length;
      return lines <= 1 ? trimFirst(s) : `${lines} lines output`;
    },
    approve_command:     () => 'approved',
    cd:                  () => 'changed',
    // Messaging
    send_message:        () => 'sent',
    whatsapp_send:       () => 'sent',
    send_file:           () => 'sent',
    text_to_speech:      (s) => s.includes('sent') ? 'spoken + sent' : trimFirst(s),
    transcribe_audio:    (s) => `${s.split(' ').length} words`,
    // Calendar
    calendar_auth:       (s) => s.includes('success') ? 'authorised' : trimFirst(s),
    list_events:         (s) => `${s.split('\n').filter(Boolean).length} events`,
    create_event:        (s) => s.includes('created') ? 'created' : trimFirst(s),
    check_availability:  (s) => `${s.split('\n').filter(Boolean).length} lines`,
    delete_event:        (s) => s.includes('deleted') ? 'deleted' : trimFirst(s),
    // Web
    fetch_url:           () => 'fetched',
    web_search:          (s) => `${s.split('\n').filter(Boolean).length} lines`,
    analyze_image:       (s) => trimFirst(s),
    // Browser
    browser_open:        () => 'opened',
    browser_click:       () => 'clicked',
    browser_type:        () => 'typed',
    browser_key:         () => 'pressed',
    browser_wait:        () => 'ready',
    browser_screenshot:  () => 'captured',
    browser_extract:     (s) => `${s.split('\n').filter(Boolean).length} lines`,
    browser_scroll:      () => 'scrolled',
    browser_close:       () => 'closed',
    browser_engine:      (s) => trimFirst(s),
    // Computer use
    computer_screenshot: () => 'captured',
    computer_see:        (s) => trimFirst(s),
    computer_click:      () => 'clicked',
    computer_move:       () => 'moved',
    computer_type:       () => 'typed',
    computer_key:        () => 'pressed',
    computer_scroll:     () => 'scrolled',
    computer_drag:       () => 'dragged',
    computer_screen_size:(s) => trimFirst(s),
    // ADB / Android
    adb_devices:         (s) => `${s.split('\n').filter(Boolean).length} devices`,
    adb_screenshot:      () => 'captured',
    adb_see:             (s) => trimFirst(s),
    adb_tap:             () => 'tapped',
    adb_swipe:           () => 'swiped',
    adb_type:            () => 'typed',
    adb_key:             () => 'sent',
    adb_shell:           (s) => `${s.split('\n').filter(Boolean).length} lines`,
    adb_pull:            (s) => s.includes('Success') ? 'pulled' : trimFirst(s),
    adb_push:            (s) => s.includes('Success') ? 'pushed' : trimFirst(s),
    // Git
    git_status:          (s) => `${s.split('\n').filter(Boolean).length} lines`,
    git_diff:            (s) => `${s.split('\n').filter(Boolean).length} lines`,
    git_log:             (s) => `${s.split('\n').filter(Boolean).length} commits`,
    git_add:             () => 'staged',
    git_commit:          () => 'committed',
    git_push:            () => 'pushed',
    // GitHub
    create_pr:           (s) => s.includes('created') ? 'created' : trimFirst(s),
    review_pr:           (s) => `${s.split('\n').filter(Boolean).length} lines`,
    list_issues:         (s) => `${s.split('\n').filter(Boolean).length} issues`,
    create_issue:        (s) => s.includes('created') ? 'created' : trimFirst(s),
    github_api:          (s) => `${s.split('\n').filter(Boolean).length} lines`,
    // Skills
    use_skill:           (s) => trimFirst(s),
    list_skills:         (s) => `${s.split('\n').filter(Boolean).length} skills`,
    install_skill:       (s) => trimFirst(s),
    // Scheduler
    schedule_task:         (s) => trimFirst(s),
    list_scheduled_tasks:  (s) => `${s.split('\n').filter(Boolean).length} tasks`,
    cancel_scheduled_task: () => 'cancelled',
    // System
    budget_status:       () => 'reported',
    notify:              () => 'sent',
    clipboard_read:      (s) => trimFirst(s),
    clipboard_write:     () => 'written',
    secret_store:        () => 'stored',
    secret_get:          () => 'retrieved',
    secret_list:         (s) => `${s.split('\n').filter(Boolean).length} secrets`,
    secret_delete:       () => 'deleted',
    delegate_task:       (s) => trimFirst(s),
    spawn_agent:         (s) => trimFirst(s),
  };

  const hint = RESULT_HINTS[toolName];
  if (hint) return hint(str);
  return trimFirst(str);
}

function trimFirst(s: string): string {
  const first = s.split('\n')[0];
  return first.length > 80 ? first.slice(0, 77) + '…' : first;
}