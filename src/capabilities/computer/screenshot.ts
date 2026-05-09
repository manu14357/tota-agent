import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { logger } from '../../utils/logger.js';

const SCREENSHOT_DIR = join(tmpdir(), 'tota-screenshots');

export function ensureScreenshotDir(): void {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

/** Returns the path of a saved screenshot, or throws on failure. */
export async function captureScreenshot(region?: { x: number; y: number; width: number; height: number }): Promise<string> {
  ensureScreenshotDir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outPath = join(SCREENSHOT_DIR, `screen-${id}.png`);
  const os = platform();

  try {
    if (os === 'darwin') {
      const regionFlag = region
        ? `-R${region.x},${region.y},${region.width},${region.height}`
        : '';
      execSync(`screencapture -x ${regionFlag} "${outPath}"`, { timeout: 10000 });
    } else if (os === 'linux') {
      // Try scrot first, fall back to import (ImageMagick), then gnome-screenshot
      const hasScrot = (() => { try { execSync('which scrot', { stdio: 'pipe' }); return true; } catch { return false; } })();
      const hasImport = (() => { try { execSync('which import', { stdio: 'pipe' }); return true; } catch { return false; } })();
      const hasGnome = (() => { try { execSync('which gnome-screenshot', { stdio: 'pipe' }); return true; } catch { return false; } })();

      if (hasScrot) {
        const regionFlag = region ? `-a ${region.x},${region.y},${region.width},${region.height}` : '';
        execSync(`DISPLAY=:0 scrot ${regionFlag} "${outPath}"`, { timeout: 10000 });
      } else if (hasImport) {
        const regionFlag = region ? `-crop ${region.width}x${region.height}+${region.x}+${region.y}` : '';
        execSync(`DISPLAY=:0 import ${regionFlag} -window root "${outPath}"`, { timeout: 10000 });
      } else if (hasGnome) {
        execSync(`DISPLAY=:0 gnome-screenshot -f "${outPath}"`, { timeout: 10000 });
      } else {
        throw new Error('No screenshot tool found. Install scrot (apt install scrot) or ImageMagick (apt install imagemagick).');
      }
    } else if (os === 'win32') {
      const regionArgs = region
        ? `[System.Drawing.Rectangle]::new(${region.x},${region.y},${region.width},${region.height})`
        : '[System.Windows.Forms.Screen]::PrimaryScreen.Bounds';
      const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
$r=${regionArgs};
$bmp=New-Object System.Drawing.Bitmap($r.Width,$r.Height);
$g=[System.Drawing.Graphics]::FromImage($bmp);
$g.CopyFromScreen($r.Location,[System.Drawing.Point]::Empty,$r.Size);
$bmp.Save('${outPath.replace(/\\/g, '\\\\')}');
$g.Dispose();$bmp.Dispose()`;
      execSync(`powershell -Command "${script.replace(/\n/g, ' ')}"`, { timeout: 15000 });
    } else {
      throw new Error(`Unsupported platform: ${os}`);
    }

    if (!existsSync(outPath)) {
      throw new Error('Screenshot command ran but no file was created.');
    }
    logger.info({ path: outPath }, 'Screenshot captured');
    return outPath;
  } catch (err: any) {
    throw new Error(`Screenshot failed: ${err.message}`);
  }
}

export function createComputerScreenshotTool(sendFileHandler?: (filePath: string) => Promise<void>) {
  return tool({
    description: 'Take a screenshot of the primary display (or a region) and save it to a temp file. Returns the file path so you can analyze it with analyze_image or computer_see. Optionally sends the screenshot to the user if a file handler is available.',
    inputSchema: zodSchema(z.object({
      region: z.object({
        x: z.number().int().describe('Left edge in pixels'),
        y: z.number().int().describe('Top edge in pixels'),
        width: z.number().int().describe('Width in pixels'),
        height: z.number().int().describe('Height in pixels'),
      }).optional().describe('Capture a specific screen region instead of the full display'),
      send_to_user: z.boolean().optional().describe('Send the screenshot to the user (default: false)'),
    })),
    execute: async ({ region, send_to_user }) => {
      try {
        const path = await captureScreenshot(region);
        if (send_to_user && sendFileHandler) {
          await sendFileHandler(path);
          return `Screenshot captured and sent to user. Path: ${path}`;
        }
        return `Screenshot saved to: ${path}\nUse analyze_image or computer_see to inspect it.`;
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  });
}
