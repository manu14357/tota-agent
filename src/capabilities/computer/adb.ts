import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { logger } from '../../utils/logger.js';
import type { VisionHandler } from '../vision/analyze-image.js';

const MAX_OUTPUT = 8000;

function adb(cmd: string, deviceId?: string): string {
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  const full = `adb ${deviceFlag} ${cmd}`.trim();
  try {
    logger.info({ cmd: full }, 'adb command');
    const out = execSync(full, { encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 });
    const trimmed = out.trim();
    return trimmed.length > MAX_OUTPUT ? trimmed.slice(0, MAX_OUTPUT) + '\n...(truncated)' : trimmed;
  } catch (err: any) {
    const stderr = err.stderr?.trim();
    const stdout = err.stdout?.trim();
    let msg = `adb exited with code ${err.status ?? 'unknown'}`;
    if (stdout) msg += `\n${stdout}`;
    if (stderr) msg += `\n${stderr}`;
    return msg;
  }
}

function adbAvailable(): boolean {
  try { execSync('adb version', { stdio: 'pipe' }); return true; } catch { return false; }
}

const ADB_MISSING = 'adb is not installed or not in PATH. Install Android SDK platform-tools and ensure "adb" is accessible.';

const deviceIdSchema = z.string().optional().describe('Device serial (from adb_devices). Omit to use the only connected device.');

export function createAdbDevicesTool() {
  return tool({
    description: 'List connected Android devices via adb.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb('devices -l');
    },
  });
}

export function createAdbScreenshotTool(sendFileHandler?: (filePath: string) => Promise<void>) {
  return tool({
    description: 'Take a screenshot of an Android device screen.',
    inputSchema: zodSchema(z.object({
      device: deviceIdSchema,
      send_to_user: z.boolean().optional().describe('Send the screenshot to the user (default: false)'),
    })),
    execute: async ({ device, send_to_user }) => {
      if (!adbAvailable()) return ADB_MISSING;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const remotePath = `/sdcard/tota-screen-${id}.png`;
      const localPath = join(tmpdir(), `adb-screen-${id}.png`);

      adb(`shell screencap -p ${remotePath}`, device);
      adb(`pull ${remotePath} "${localPath}"`, device);
      adb(`shell rm ${remotePath}`, device);

      if (!existsSync(localPath)) {
        return 'Screenshot failed: file not pulled from device.';
      }

      if (send_to_user && sendFileHandler) {
        await sendFileHandler(localPath);
        return `Android screenshot captured and sent. Local path: ${localPath}`;
      }
      return `Android screenshot saved to: ${localPath}\nUse adb_see or analyze_image to inspect it.`;
    },
  });
}

export function createAdbSeeTool(getVisionHandler: () => VisionHandler | null) {
  return tool({
    description: 'Take a screenshot of an Android device and analyze it with vision AI. Use this to understand what is on the Android screen.',
    inputSchema: zodSchema(z.object({
      question: z.string().optional().describe('What to look for on the Android screen (default: describe everything visible)'),
      device: deviceIdSchema,
    })),
    execute: async ({ question, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      const handler = getVisionHandler();
      if (!handler) return 'Vision analysis is not available. Configure a vision-capable provider.';

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const remotePath = `/sdcard/tota-screen-${id}.png`;
      const localPath = join(tmpdir(), `adb-screen-${id}.png`);

      adb(`shell screencap -p ${remotePath}`, device);
      adb(`pull ${remotePath} "${localPath}"`, device);
      adb(`shell rm ${remotePath}`, device);

      if (!existsSync(localPath)) {
        return 'Screenshot failed: file not pulled from device.';
      }

      try {
        const { readFileSync } = await import('node:fs');
        const buf = readFileSync(localPath);
        const prompt = question || 'Describe everything visible on the Android screen in detail. Include any text, icons, buttons, and their layout.';
        const result = await handler({ imageSource: buf, mimeType: 'image/png', isUrl: false, question: prompt });
        return result;
      } finally {
        try { unlinkSync(localPath); } catch {}
      }
    },
  });
}

export function createAdbTapTool() {
  return tool({
    description: 'Tap a coordinate on an Android device screen.',
    inputSchema: zodSchema(z.object({
      x: z.number().int().describe('X coordinate in pixels'),
      y: z.number().int().describe('Y coordinate in pixels'),
      device: deviceIdSchema,
    })),
    execute: async ({ x, y, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb(`shell input tap ${x} ${y}`, device);
    },
  });
}

export function createAdbSwipeTool() {
  return tool({
    description: 'Swipe on an Android device screen. Useful for scrolling or navigating.',
    inputSchema: zodSchema(z.object({
      from_x: z.number().int().describe('Start X'),
      from_y: z.number().int().describe('Start Y'),
      to_x: z.number().int().describe('End X'),
      to_y: z.number().int().describe('End Y'),
      duration_ms: z.number().int().min(50).max(5000).optional().describe('Swipe duration in ms (default: 300)'),
      device: deviceIdSchema,
    })),
    execute: async ({ from_x, from_y, to_x, to_y, duration_ms = 300, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb(`shell input swipe ${from_x} ${from_y} ${to_x} ${to_y} ${duration_ms}`, device);
    },
  });
}

export function createAdbTypeTool() {
  return tool({
    description: 'Type text into the focused field on an Android device. Tap the input field first with adb_tap.',
    inputSchema: zodSchema(z.object({
      text: z.string().describe('Text to type. Spaces will be escaped automatically.'),
      device: deviceIdSchema,
    })),
    execute: async ({ text, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      // Escape spaces for adb shell input text
      const escaped = text.replace(/ /g, '%s');
      return adb(`shell input text "${escaped}"`, device);
    },
  });
}

export function createAdbKeyTool() {
  return tool({
    description: 'Send an Android key event. Common keycodes: 3=HOME, 4=BACK, 24=VOLUME_UP, 25=VOLUME_DOWN, 26=POWER, 66=ENTER, 67=DEL, 82=MENU.',
    inputSchema: zodSchema(z.object({
      keycode: z.union([z.number().int(), z.string()]).describe('Android keycode number or name (e.g., 4 or "KEYCODE_BACK")'),
      device: deviceIdSchema,
    })),
    execute: async ({ keycode, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb(`shell input keyevent ${keycode}`, device);
    },
  });
}

export function createAdbShellTool() {
  return tool({
    description: 'Run an adb shell command on an Android device. Use for system inspection, app management, or advanced automation.',
    inputSchema: zodSchema(z.object({
      command: z.string().describe('Shell command to run on the Android device (e.g., "pm list packages", "am start -n com.example/.MainActivity")'),
      device: deviceIdSchema,
    })),
    execute: async ({ command, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb(`shell ${command}`, device);
    },
  });
}

export function createAdbPullTool() {
  return tool({
    description: 'Pull a file from an Android device to the local machine.',
    inputSchema: zodSchema(z.object({
      remote: z.string().describe('Path on the Android device (e.g., /sdcard/file.txt)'),
      local: z.string().describe('Local path to save the file'),
      device: deviceIdSchema,
    })),
    execute: async ({ remote, local, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb(`pull "${remote}" "${local}"`, device);
    },
  });
}

export function createAdbPushTool() {
  return tool({
    description: 'Push a file from the local machine to an Android device.',
    inputSchema: zodSchema(z.object({
      local: z.string().describe('Local file path to push'),
      remote: z.string().describe('Destination path on the Android device (e.g., /sdcard/file.txt)'),
      device: deviceIdSchema,
    })),
    execute: async ({ local, remote, device }) => {
      if (!adbAvailable()) return ADB_MISSING;
      return adb(`push "${local}" "${remote}"`, device);
    },
  });
}
