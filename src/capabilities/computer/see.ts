import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFileSync, unlinkSync } from 'node:fs';
import { captureScreenshot } from './screenshot.js';
import type { VisionHandler } from '../vision/analyze-image.js';
import { logger } from '../../utils/logger.js';

export function createComputerSeeTool(getVisionHandler: () => VisionHandler | null) {
  return tool({
    description: 'Take a screenshot of the screen and immediately analyze it using vision AI. Use this to understand what is currently on screen before deciding what to click or type. Returns a text description of the screen contents and answers your question if provided.',
    inputSchema: zodSchema(z.object({
      question: z.string().optional().describe('What to look for or ask about the screen (default: describe everything visible on screen)'),
      region: z.object({
        x: z.number().int(),
        y: z.number().int(),
        width: z.number().int(),
        height: z.number().int(),
      }).optional().describe('Analyze only a region of the screen instead of the full display'),
    })),
    execute: async ({ question, region }) => {
      const handler = getVisionHandler();
      if (!handler) {
        return 'Vision analysis is not available. Configure a vision-capable provider (GPT-4o, Claude 3+, etc.).';
      }

      let screenshotPath: string | null = null;
      try {
        screenshotPath = await captureScreenshot(region);
        const buf = readFileSync(screenshotPath);
        const prompt = question || 'Describe everything visible on the screen in detail. Include any text, UI elements, windows, buttons, and their positions.';

        logger.info({ question, hasRegion: !!region }, 'computer_see: analyzing screen');
        const result = await handler({
          imageSource: buf,
          mimeType: 'image/png',
          isUrl: false,
          question: prompt,
        });

        return result;
      } catch (err: any) {
        logger.warn({ err: err.message }, 'computer_see failed');
        return `Error: ${err.message}`;
      } finally {
        // Clean up temp screenshot
        if (screenshotPath) {
          try { unlinkSync(screenshotPath); } catch {}
        }
      }
    },
  });
}
