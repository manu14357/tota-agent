import { describe, it, expect } from 'vitest';
import { renderMarkdown, mdToTelegram } from './markdown.js';

function noAnsi(s: string): string {
  return s.replace(/\x1b\[[\d;]*m/g, '');
}

describe('renderMarkdown', () => {
  it('renders a fenced code block in a labelled box', () => {
    const out = noAnsi(renderMarkdown('```ts\nconst x = 1;\n```'));
    expect(out).toContain('ts');
    expect(out).toContain('const x = 1;');
    expect(out).toContain('┌');
    expect(out).toContain('└');
    expect(out).toContain('│');
  });

  it('renders headings and bold without throwing', () => {
    const out = noAnsi(renderMarkdown('# Title\n\nSome **bold** text.'));
    expect(out).toContain('Title');
    expect(out).toContain('bold');
  });

  it('keeps inline code content', () => {
    const out = noAnsi(renderMarkdown('Use `npm run build` to compile.'));
    expect(out).toContain('npm run build');
  });
});

describe('mdToTelegram', () => {
  it('converts a code block to <pre><code>', () => {
    const out = mdToTelegram('```js\nlet a = 2;\n```');
    expect(out).toContain('<pre><code');
    expect(out).toContain('let a = 2;');
  });

  it('converts bold to <b>', () => {
    expect(mdToTelegram('**hi**')).toContain('<b>hi</b>');
  });
});
