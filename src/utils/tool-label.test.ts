import { describe, it, expect } from 'vitest';
import { formatToolStep, formatToolResult } from './tool-label.js';

// ─── formatToolStep ───────────────────────────────────────────────────────────

describe('formatToolStep', () => {
  // Unknown tool — falls back to the raw name
  it('returns tool name for unknown tools', () => {
    expect(formatToolStep('unknown_tool', {})).toBe('unknown_tool');
    expect(formatToolStep('mcp_my_server_action', {})).toBe('mcp_my_server_action');
  });

  // Filesystem
  it('read_file: includes basename of path', () => {
    const r = formatToolStep('read_file', { path: '/home/user/notes/todo.md' });
    expect(r).toMatch(/📄/);
    expect(r).toContain('todo.md');
    expect(r).not.toContain('/home/user');
  });

  it('write_file: includes basename', () => {
    const r = formatToolStep('write_file', { path: '/tmp/out.txt' });
    expect(r).toContain('out.txt');
  });

  it('find_files: includes pattern truncated to 30 chars', () => {
    const long = '**/*.{ts,tsx,js,jsx,mjs,cjs,mts}';
    const r = formatToolStep('find_files', { pattern: long });
    expect(r).toMatch(/🔍/);
    // pattern is 31 chars → truncated
    expect(r.length).toBeLessThan(long.length + 20);
  });

  it('approve_scope: no argKey shows clean label', () => {
    const r = formatToolStep('approve_scope', {});
    expect(r).toMatch(/🔓/);
    expect(r).toContain('Approving scope');
  });

  // Shell
  it('run_command: includes command truncated to 40 chars', () => {
    const cmd = 'ls -la /very/long/path/that/exceeds/forty/characters/in/total';
    const r = formatToolStep('run_command', { command: cmd });
    expect(r).toMatch(/⌨/);
    expect(r).toContain('…');
  });

  it('run_code: shows language', () => {
    const r = formatToolStep('run_code', { language: 'python' });
    expect(r).toContain('python');
  });

  // Web
  it('fetch_url: extracts domain', () => {
    const r = formatToolStep('fetch_url', { url: 'https://api.example.com/v1/data' });
    expect(r).toMatch(/↗/);
    expect(r).toContain('api.example.com');
    expect(r).not.toContain('/v1/data');
  });

  it('web_search: shows query truncated', () => {
    const r = formatToolStep('web_search', { query: 'what is the best TypeScript linter tool in 2026' });
    expect(r).toMatch(/🔍/);
    expect(r).toContain('what is the best');
  });

  // Git
  it('git_commit: shows clean label', () => {
    const r = formatToolStep('git_commit', { message: 'feat: add new tool' });
    expect(r).toMatch(/💾/);
    expect(r).toContain('Committing');
  });

  // Calendar
  it('create_event: includes truncated title', () => {
    const r = formatToolStep('create_event', { title: 'Team Standup' });
    expect(r).toMatch(/📅/);
    expect(r).toContain('Team Standup');
  });

  // System
  it('secret_store: shows secret name', () => {
    const r = formatToolStep('secret_store', { name: 'MY_API_KEY' });
    expect(r).toMatch(/🔐/);
    expect(r).toContain('MY_API_KEY');
  });

  // ── Browser: original 10 tools ──────────────────────────────────────────────

  it('browser_open: extracts domain from URL', () => {
    const r = formatToolStep('browser_open', { url: 'https://news.ycombinator.com/newest' });
    expect(r).toMatch(/🌐/);
    expect(r).toContain('news.ycombinator.com');
    expect(r).not.toContain('/newest');
  });

  it('browser_click: shows truncated selector', () => {
    const r = formatToolStep('browser_click', { selector: 'button.submit-form-long-class-name-here' });
    expect(r).toMatch(/🖱/);
  });

  it('browser_type: shows truncated selector', () => {
    const r = formatToolStep('browser_type', { selector: 'input[name="q"]', text: 'tota agent' });
    expect(r).toMatch(/⌨/);
    expect(r).toContain('input[name="q"]');
  });

  it('browser_key: shows key name', () => {
    const r = formatToolStep('browser_key', { key: 'Enter' });
    expect(r).toContain('Enter');
  });

  it('browser_wait: shows selector', () => {
    const r = formatToolStep('browser_wait', { selector: '.loaded' });
    expect(r).toMatch(/⏳/);
    expect(r).toContain('.loaded');
  });

  it('browser_screenshot: shows label only (no args)', () => {
    const r = formatToolStep('browser_screenshot', {});
    expect(r).toMatch(/📸/);
    expect(r).toContain('screenshot');
  });

  it('browser_engine: shows engine name', () => {
    const r = formatToolStep('browser_engine', { engine: 'firefox' });
    expect(r).toContain('firefox');
  });

  // ── Browser: 16 new tools ───────────────────────────────────────────────────

  it('browser_hover: shows selector', () => {
    const r = formatToolStep('browser_hover', { selector: 'nav > a:first-child' });
    expect(r).toMatch(/🖱/);
    expect(r).toContain('nav > a:first-child');
  });

  it('browser_select: shows selector', () => {
    const r = formatToolStep('browser_select', { selector: 'select#country', value: 'IN' });
    expect(r).toMatch(/🔽/);
    expect(r).toContain('select#country');
  });

  it('browser_drag: shows source selector', () => {
    const r = formatToolStep('browser_drag', { source_selector: '#card-1', target_selector: '#zone-a' });
    expect(r).toMatch(/🖱/);
    expect(r).toContain('#card-1');
  });

  it('browser_scroll_into_view: shows selector', () => {
    const r = formatToolStep('browser_scroll_into_view', { selector: '#section-faq' });
    expect(r).toMatch(/↕/);
    expect(r).toContain('#section-faq');
  });

  it('browser_get_url: shows label only (no args)', () => {
    const r = formatToolStep('browser_get_url', {});
    expect(r).toMatch(/🌐/);
    expect(r).toContain('URL');
  });

  it('browser_reload: shows label only', () => {
    const r = formatToolStep('browser_reload', {});
    expect(r).toMatch(/🔄/);
    expect(r).toContain('Reloading');
  });

  it('browser_evaluate: shows script snippet', () => {
    const r = formatToolStep('browser_evaluate', { script: 'document.title' });
    expect(r).toMatch(/⚡/);
    expect(r).toContain('document.title');
  });

  it('browser_evaluate: truncates long scripts', () => {
    const long = 'const x = document.querySelectorAll(".item"); return Array.from(x).map(el => el.textContent);';
    const r = formatToolStep('browser_evaluate', { script: long });
    expect(r).toMatch(/⚡/);
    expect(r.length).toBeLessThan(long.length + 20);
  });

  it('browser_navigate: shows direction', () => {
    const r = formatToolStep('browser_navigate', { direction: 'back' });
    expect(r).toMatch(/🌐/);
    expect(r).toContain('back');
  });

  it('browser_cookies_get: shows label only', () => {
    const r = formatToolStep('browser_cookies_get', {});
    expect(r).toMatch(/🍪/);
    expect(r).toContain('cookies');
  });

  it('browser_cookies_set: shows cookie name', () => {
    const r = formatToolStep('browser_cookies_set', { name: 'session_id', value: 'abc123' });
    expect(r).toMatch(/🍪/);
    expect(r).toContain('session_id');
  });

  it('browser_cookies_clear: shows label only', () => {
    const r = formatToolStep('browser_cookies_clear', {});
    expect(r).toMatch(/🍪/);
    expect(r).toContain('Clearing');
  });

  it('browser_storage_get: shows storage kind', () => {
    const r = formatToolStep('browser_storage_get', { kind: 'local' });
    expect(r).toMatch(/💾/);
    expect(r).toContain('local');
  });

  it('browser_storage_set: shows key being written', () => {
    const r = formatToolStep('browser_storage_set', { kind: 'session', key: 'auth_token', value: 'xyz' });
    expect(r).toMatch(/💾/);
    expect(r).toContain('auth_token');
  });

  it('browser_storage_clear: shows kind', () => {
    const r = formatToolStep('browser_storage_clear', { kind: 'session' });
    expect(r).toMatch(/💾/);
    expect(r).toContain('session');
  });

  it('browser_pdf: shows filename when provided', () => {
    const r = formatToolStep('browser_pdf', { filename: 'report.pdf' });
    expect(r).toMatch(/📄/);
    expect(r).toContain('report.pdf');
  });

  it('browser_pdf: shows label when filename absent', () => {
    const r = formatToolStep('browser_pdf', {});
    expect(r).toMatch(/📄/);
    expect(r).toContain('PDF');
  });

  it('browser_set_viewport: shows preset when provided', () => {
    const r = formatToolStep('browser_set_viewport', { width: 390, height: 844, preset: 'mobile' });
    expect(r).toMatch(/🖥/);
    expect(r).toContain('mobile');
  });

  it('browser_set_viewport: shows label when no preset', () => {
    const r = formatToolStep('browser_set_viewport', { width: 1280, height: 720 });
    expect(r).toMatch(/🖥/);
    expect(r).toContain('viewport');
  });
});

// ─── formatToolResult ─────────────────────────────────────────────────────────

describe('formatToolResult', () => {
  // Edge cases
  it('returns empty string for null/undefined', () => {
    expect(formatToolResult('read_file', null)).toBe('');
    expect(formatToolResult('read_file', undefined)).toBe('');
  });

  it('returns empty string for empty string result', () => {
    expect(formatToolResult('read_file', '')).toBe('');
  });

  it('returns first line for error results', () => {
    const r = formatToolResult('any_tool', 'Error: connection refused\nDetails: ...');
    expect(r).toBe('Error: connection refused');
  });

  it('truncates error lines longer than 80 chars', () => {
    const longErr = 'Error: ' + 'x'.repeat(100);
    const r = formatToolResult('any_tool', longErr);
    expect(r).toMatch(/…$/);
    expect(r.length).toBeLessThanOrEqual(80);
  });

  it('handles non-string results via JSON.stringify', () => {
    const r = formatToolResult('any_tool', { key: 'value' });
    expect(r).toBeTruthy();
  });

  // Filesystem
  it('read_file: counts lines', () => {
    const content = 'line1\nline2\nline3\n';
    const r = formatToolResult('read_file', content);
    expect(r).toContain('lines');
  });

  it('write_file: shows "saved" on success', () => {
    const r = formatToolResult('write_file', 'Success: written 1024 bytes');
    expect(r).toBe('saved');
  });

  it('create_file: shows "created" on success', () => {
    const r = formatToolResult('create_file', 'Success: file created');
    expect(r).toBe('created');
  });

  it('edit_file: shows "edited" on success', () => {
    const r = formatToolResult('edit_file', 'Success: replacement applied');
    expect(r).toBe('edited');
  });

  it('delete_file: shows "deleted" on success', () => {
    const r = formatToolResult('delete_file', 'Success: deleted');
    expect(r).toBe('deleted');
  });

  it('list_dir: counts entries', () => {
    const r = formatToolResult('list_dir', 'src/\ntest/\nREADME.md\n');
    expect(r).toMatch(/\d+ entries/);
  });

  it('find_files: counts files', () => {
    const r = formatToolResult('find_files', 'a.ts\nb.ts\nc.ts');
    expect(r).toMatch(/\d+ files/);
  });

  // Shell
  it('run_command: returns first line when exit code mentioned', () => {
    const r = formatToolResult('run_command', 'Process exited with code 1\nstderr: ...');
    expect(r).toContain('exited with code');
  });

  it('run_command: returns line count for multi-line output', () => {
    const r = formatToolResult('run_command', 'a\nb\nc\nd\ne');
    expect(r).toMatch(/\d+ lines/);
  });

  it('cd: returns "changed"', () => {
    expect(formatToolResult('cd', '/some/path')).toBe('changed');
  });

  // Messaging
  it('send_message: returns "sent"', () => {
    expect(formatToolResult('send_message', 'anything')).toBe('sent');
  });

  it('whatsapp_send: returns "sent"', () => {
    expect(formatToolResult('whatsapp_send', 'anything')).toBe('sent');
  });

  it('transcribe_audio: counts words', () => {
    const r = formatToolResult('transcribe_audio', 'hello world how are you today');
    expect(r).toMatch(/\d+ words/);
  });

  // Web
  it('fetch_url: returns "fetched"', () => {
    expect(formatToolResult('fetch_url', '# Title\ncontent here')).toBe('fetched');
  });

  it('web_search: counts result lines', () => {
    const results = '1. Result A\n2. Result B\n3. Result C';
    const r = formatToolResult('web_search', results);
    expect(r).toMatch(/\d+ lines/);
  });

  // Git
  it('git_add: returns "staged"', () => {
    expect(formatToolResult('git_add', 'Staged 3 files')).toBe('staged');
  });

  it('git_commit: returns "committed"', () => {
    expect(formatToolResult('git_commit', 'Committed abc1234')).toBe('committed');
  });

  it('git_push: returns "pushed"', () => {
    expect(formatToolResult('git_push', 'Pushed to origin/main')).toBe('pushed');
  });

  it('git_log: counts commits', () => {
    const r = formatToolResult('git_log', 'commit a\ncommit b\ncommit c');
    expect(r).toMatch(/\d+ commits/);
  });

  // Skills
  it('list_skills: counts skills', () => {
    const r = formatToolResult('list_skills', 'daily-digest\ngit-summary\nnews-brief');
    expect(r).toMatch(/\d+ skills/);
  });

  // Scheduler
  it('cancel_scheduled_task: returns "cancelled"', () => {
    expect(formatToolResult('cancel_scheduled_task', 'Task cancelled')).toBe('cancelled');
  });

  // System
  it('budget_status: returns "reported"', () => {
    expect(formatToolResult('budget_status', 'Budget: 50%')).toBe('reported');
  });

  it('notify: returns "sent"', () => {
    expect(formatToolResult('notify', 'Notification sent')).toBe('sent');
  });

  it('clipboard_write: returns "written"', () => {
    expect(formatToolResult('clipboard_write', 'Clipboard updated')).toBe('written');
  });

  it('secret_store: returns "stored"', () => {
    expect(formatToolResult('secret_store', 'Secret stored')).toBe('stored');
  });

  it('secret_get: returns "retrieved"', () => {
    expect(formatToolResult('secret_get', 'MY_KEY=abc123')).toBe('retrieved');
  });

  it('secret_delete: returns "deleted"', () => {
    expect(formatToolResult('secret_delete', 'Secret deleted')).toBe('deleted');
  });

  // ── Browser: original 10 tools ──────────────────────────────────────────────

  it('browser_open: returns "opened"', () => {
    expect(formatToolResult('browser_open', 'Title: Example\ncontent...')).toBe('opened');
  });

  it('browser_click: returns "clicked"', () => {
    expect(formatToolResult('browser_click', 'Clicked .btn')).toBe('clicked');
  });

  it('browser_type: returns "typed"', () => {
    expect(formatToolResult('browser_type', 'Typed "hello" into input')).toBe('typed');
  });

  it('browser_key: returns "pressed"', () => {
    expect(formatToolResult('browser_key', 'Pressed Enter')).toBe('pressed');
  });

  it('browser_wait: returns "ready"', () => {
    expect(formatToolResult('browser_wait', 'Element found: .loaded')).toBe('ready');
  });

  it('browser_screenshot: returns "captured"', () => {
    expect(formatToolResult('browser_screenshot', '/tmp/screenshots/page.png')).toBe('captured');
  });

  it('browser_extract: counts lines of extracted content', () => {
    const r = formatToolResult('browser_extract', 'line1\nline2\nline3');
    expect(r).toMatch(/\d+ lines/);
  });

  it('browser_scroll: returns "scrolled"', () => {
    expect(formatToolResult('browser_scroll', 'Scrolled down 300px')).toBe('scrolled');
  });

  it('browser_close: returns "closed"', () => {
    expect(formatToolResult('browser_close', 'Browser closed')).toBe('closed');
  });

  it('browser_engine: returns first line of result', () => {
    const r = formatToolResult('browser_engine', 'Switched to firefox engine');
    expect(r).toContain('Switched');
  });

  // ── Browser: 16 new tools ───────────────────────────────────────────────────

  it('browser_hover: returns "hovered"', () => {
    expect(formatToolResult('browser_hover', 'Hovered over nav > a')).toBe('hovered');
  });

  it('browser_select: returns first line', () => {
    const r = formatToolResult('browser_select', 'Selected "India" in select#country');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('browser_drag: returns "dragged"', () => {
    expect(formatToolResult('browser_drag', 'Dragged #card to #zone')).toBe('dragged');
  });

  it('browser_scroll_into_view: returns first line', () => {
    const r = formatToolResult('browser_scroll_into_view', 'Scrolled #faq into view');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('browser_get_url: returns the URL string', () => {
    const r = formatToolResult('browser_get_url', 'https://example.com/page');
    expect(r).toContain('example.com');
  });

  it('browser_reload: returns "reloaded"', () => {
    expect(formatToolResult('browser_reload', 'Reloaded https://example.com')).toBe('reloaded');
  });

  it('browser_evaluate: returns first line of result', () => {
    const r = formatToolResult('browser_evaluate', 'Result: 42');
    expect(r).toContain('Result');
  });

  it('browser_navigate: returns first line', () => {
    const r = formatToolResult('browser_navigate', 'Navigated back to https://example.com');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('browser_cookies_get: extracts cookie count from formatted result', () => {
    const r = formatToolResult('browser_cookies_get', 'Cookies (3):\nsession=abc\ntoken=xyz\nprefs=1');
    expect(r).toContain('3 cookies');
  });

  it('browser_cookies_get: handles "No cookies" message', () => {
    const r = formatToolResult('browser_cookies_get', 'No cookies found in current session.');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('browser_cookies_set: returns first line', () => {
    const r = formatToolResult('browser_cookies_set', 'Cookie "session_id" set for domain "example.com"');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('browser_cookies_clear: returns "cleared"', () => {
    expect(formatToolResult('browser_cookies_clear', 'All cookies cleared.')).toBe('cleared');
  });

  it('browser_storage_get: counts items', () => {
    const r = formatToolResult('browser_storage_get', 'auth_token: abc\ntheme: dark\nlang: en');
    expect(r).toMatch(/\d+ items/);
  });

  it('browser_storage_get: counts 1 item for single key result', () => {
    const r = formatToolResult('browser_storage_get', 'auth_token: abc123');
    expect(r).toMatch(/1 items/);
  });

  it('browser_storage_set: returns first line', () => {
    const r = formatToolResult('browser_storage_set', 'Set localStorage["theme"] = "dark"');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('browser_storage_clear: returns "cleared"', () => {
    expect(formatToolResult('browser_storage_clear', 'localStorage cleared.')).toBe('cleared');
  });

  it('browser_pdf: returns first line of result', () => {
    const r = formatToolResult('browser_pdf', 'PDF saved: /tmp/screenshots/page-1234.pdf');
    expect(r).toContain('PDF');
  });

  it('browser_set_viewport: returns first line', () => {
    const r = formatToolResult('browser_set_viewport', 'Viewport set to 390×844 (mobile)');
    expect(r).toContain('390');
  });

  // Fallback path — unknown tool uses trimFirst
  it('falls back to trimFirst for unknown tool names', () => {
    const r = formatToolResult('mcp_someserver_sometool', 'First line\nSecond line');
    expect(r).toBe('First line');
  });

  it('trimFirst truncates very long first lines to 80 chars + ellipsis', () => {
    const r = formatToolResult('unknown_tool', 'a'.repeat(200));
    expect(r).toMatch(/…$/);
    expect(r.length).toBeLessThanOrEqual(83); // 80 + '…'
  });
});
