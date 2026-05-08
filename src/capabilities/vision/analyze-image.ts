import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { logger } from '../../utils/logger.js';

export type VisionHandler = (params: {
  imageSource: string | Buffer;
  mimeType: string;
  isUrl: boolean;
  question: string;
}) => Promise<string>;

/** Detect MIME type from file extension or buffer magic bytes. */
function detectMimeType(source: string, buf?: Buffer): string {
  if (buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
    if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  }
  const lower = source.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export function createAnalyzeImageTool(getVisionHandler: () => VisionHandler | null) {
  return tool({
    description: 'Analyze an image and describe its contents, or answer a specific question about it. Accepts an image URL or an absolute local file path. Requires a vision-capable model (GPT-4o, Claude 3+, etc.).',
    inputSchema: zodSchema(z.object({
      source: z.string().describe('Image URL (https://...) or absolute file path (/path/to/image.jpg)'),
      question: z.string().optional().describe('Specific question to answer about the image (default: describe the image)'),
    })),
    execute: async ({ source, question }) => {
      const handler = getVisionHandler();
      if (!handler) {
        return 'Vision analysis is not available: no vision-capable provider handler is registered.';
      }

      const prompt = question || 'Describe this image in detail.';
      const isUrl = source.startsWith('http://') || source.startsWith('https://');

      try {
        if (isUrl) {
          logger.info({ source, isUrl: true }, 'Analyzing image from URL');
          return await handler({ imageSource: source, mimeType: 'image/jpeg', isUrl: true, question: prompt });
        }

        // Local file
        if (!existsSync(source)) {
          return `Error: File not found: ${source}`;
        }
        const buf = readFileSync(source);
        const mimeType = detectMimeType(source, buf);
        logger.info({ source, mimeType }, 'Analyzing local image');
        return await handler({ imageSource: buf, mimeType, isUrl: false, question: prompt });
      } catch (err: any) {
        logger.warn({ source, err: err.message }, 'Image analysis failed');
        return `Image analysis failed: ${err.message}`;
      }
    },
  });
}
