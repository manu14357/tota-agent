import { describe, expect, it, vi } from 'vitest';
import { createAnalyzeImageTool, type VisionHandler } from './analyze-image.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

const noop = () => null;

describe('analyze_image tool', () => {
  it('returns unavailable message when no handler set', async () => {
    const tool = createAnalyzeImageTool(noop);
    const result = await execute(tool, { source: 'https://example.com/img.jpg' });
    expect(result).toMatch(/not available|handler/i);
  });

  it('calls handler with URL source and question', async () => {
    const calls: any[] = [];
    const handler: VisionHandler = async (params) => {
      calls.push(params);
      return 'A beautiful landscape';
    };
    const tool = createAnalyzeImageTool(() => handler);
    const result = await execute(tool, {
      source: 'https://example.com/landscape.jpg',
      question: 'What is in this image?',
    });
    expect(result).toBe('A beautiful landscape');
    expect(calls[0].isUrl).toBe(true);
    expect(calls[0].question).toBe('What is in this image?');
  });

  it('uses default question when none provided', async () => {
    const calls: any[] = [];
    const handler: VisionHandler = async (params) => {
      calls.push(params);
      return 'An image';
    };
    const tool = createAnalyzeImageTool(() => handler);
    await execute(tool, { source: 'https://example.com/img.jpg' });
    expect(calls[0].question).toMatch(/describe/i);
  });

  it('reads local file and passes buffer to handler', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tota-vision-'));
    const imgPath = join(dir, 'test.png');
    // Minimal PNG header bytes
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeFileSync(imgPath, pngHeader);

    const calls: any[] = [];
    const handler: VisionHandler = async (params) => {
      calls.push(params);
      return 'PNG image analyzed';
    };
    const tool = createAnalyzeImageTool(() => handler);

    try {
      const result = await execute(tool, { source: imgPath });
      expect(result).toBe('PNG image analyzed');
      expect(calls[0].isUrl).toBe(false);
      expect(calls[0].mimeType).toBe('image/png');
      expect(Buffer.isBuffer(calls[0].imageSource)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns file-not-found for missing local path', async () => {
    const handler: VisionHandler = async () => 'should not be called';
    const tool = createAnalyzeImageTool(() => handler);
    const result = await execute(tool, { source: '/tmp/nonexistent-tota-test-image.jpg' });
    expect(result).toMatch(/not found|error/i);
  });

  it('propagates handler errors gracefully', async () => {
    const handler: VisionHandler = async () => { throw new Error('vision API error'); };
    const tool = createAnalyzeImageTool(() => handler);
    const result = await execute(tool, { source: 'https://example.com/img.jpg' });
    expect(result).toMatch(/failed|vision API error/i);
  });

  it('detects JPEG mime type from magic bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tota-vision-'));
    const imgPath = join(dir, 'photo.jpg');
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    writeFileSync(imgPath, jpegHeader);

    const calls: any[] = [];
    const handler: VisionHandler = async (p) => { calls.push(p); return 'JPEG'; };
    const tool = createAnalyzeImageTool(() => handler);
    try {
      await execute(tool, { source: imgPath });
      expect(calls[0].mimeType).toBe('image/jpeg');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
