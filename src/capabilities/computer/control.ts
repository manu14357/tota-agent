import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { platform } from 'node:os';
import { logger } from '../../utils/logger.js';

// nut.js is an optional peer dependency for desktop mouse/keyboard control.
// We import it dynamically so tota starts fine even if nut.js is not installed.
async function loadNut() {
  try {
    const nut = await import('@nut-tree-fork/nut-js');
    return nut;
  } catch {
    return null;
  }
}

function nutMissingMessage(): string {
  const os = platform();
  const sysReq = os === 'linux'
    ? 'sudo apt install libxtst-dev libpng++-dev && '
    : '';
  return (
    'Desktop control requires @nut-tree-fork/nut-js.\n' +
    `Install it with: ${sysReq}npm install -g @nut-tree-fork/nut-js\n` +
    'Then restart tota.'
  );
}

/** Normalize key combo across platforms: "cmd+c" → "Command+C" on mac, "Control+C" on Linux/Win */
function normalizeKeyCombo(keys: string): string[] {
  const platform_ = platform();
  return keys.split('+').map((k) => {
    const lower = k.toLowerCase().trim();
    if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      return platform_ === 'darwin' ? 'LeftSuper' : 'LeftControl';
    }
    if (lower === 'ctrl' || lower === 'control') return 'LeftControl';
    if (lower === 'alt' || lower === 'option') return 'LeftAlt';
    if (lower === 'shift') return 'LeftShift';
    if (lower === 'enter' || lower === 'return') return 'Return';
    if (lower === 'space') return 'Space';
    if (lower === 'tab') return 'Tab';
    if (lower === 'esc' || lower === 'escape') return 'Escape';
    if (lower === 'backspace') return 'Backspace';
    if (lower === 'delete') return 'Delete';
    if (lower === 'up') return 'Up';
    if (lower === 'down') return 'Down';
    if (lower === 'left') return 'Left';
    if (lower === 'right') return 'Right';
    if (lower === 'home') return 'Home';
    if (lower === 'end') return 'End';
    if (lower === 'pageup') return 'PageUp';
    if (lower === 'pagedown') return 'PageDown';
    // Single chars
    if (k.length === 1) return k.toUpperCase();
    return k;
  });
}

export function createComputerClickTool() {
  return tool({
    description: 'Click the mouse at a specific screen position. Use computer_see first to identify coordinates. Supports left, right, and double-click.',
    inputSchema: zodSchema(z.object({
      x: z.number().describe('X coordinate (pixels from left edge of screen)'),
      y: z.number().describe('Y coordinate (pixels from top edge of screen)'),
      button: z.enum(['left', 'right', 'double']).optional().describe('Mouse button to use (default: left)'),
    })),
    execute: async ({ x, y, button = 'left' }) => {
      const nut = await loadNut();
      if (!nut) return nutMissingMessage();
      try {
        await nut.mouse.setPosition({ x, y });
        if (button === 'double') {
          await nut.mouse.doubleClick(nut.Button.LEFT);
        } else if (button === 'right') {
          await nut.mouse.click(nut.Button.RIGHT);
        } else {
          await nut.mouse.click(nut.Button.LEFT);
        }
        logger.info({ x, y, button }, 'computer_click');
        return `Clicked ${button} at (${x}, ${y}).`;
      } catch (err: any) {
        return `Click failed: ${err.message}`;
      }
    },
  });
}

export function createComputerMoveTool() {
  return tool({
    description: 'Move the mouse cursor to a screen position without clicking.',
    inputSchema: zodSchema(z.object({
      x: z.number().describe('X coordinate in pixels'),
      y: z.number().describe('Y coordinate in pixels'),
    })),
    execute: async ({ x, y }) => {
      const nut = await loadNut();
      if (!nut) return nutMissingMessage();
      try {
        await nut.mouse.setPosition({ x, y });
        logger.info({ x, y }, 'computer_move');
        return `Mouse moved to (${x}, ${y}).`;
      } catch (err: any) {
        return `Move failed: ${err.message}`;
      }
    },
  });
}

export function createComputerTypeTool() {
  return tool({
    description: 'Type text at the current keyboard focus. Click the target field first with computer_click. Use computer_key for special keys like Enter or Tab.',
    inputSchema: zodSchema(z.object({
      text: z.string().describe('Text to type'),
      delay_ms: z.number().int().min(0).max(500).optional().describe('Delay between keypresses in ms (default: 50). Increase for slow apps.'),
    })),
    execute: async ({ text, delay_ms = 50 }) => {
      const nut = await loadNut();
      if (!nut) return nutMissingMessage();
      try {
        nut.keyboard.config.autoDelayMs = delay_ms;
        await nut.keyboard.type(text);
        logger.info({ chars: text.length }, 'computer_type');
        return `Typed ${text.length} characters.`;
      } catch (err: any) {
        return `Type failed: ${err.message}`;
      }
    },
  });
}

export function createComputerKeyTool() {
  return tool({
    description: 'Press a key or key combination. Examples: "enter", "escape", "tab", "cmd+c", "ctrl+z", "cmd+shift+3", "up", "delete".',
    inputSchema: zodSchema(z.object({
      keys: z.string().describe('Key or combo to press. Use "+" to combine (e.g. "cmd+c", "ctrl+shift+t"). Platform-agnostic: use "cmd" for Command/Win key.'),
    })),
    execute: async ({ keys }) => {
      const nut = await loadNut();
      if (!nut) return nutMissingMessage();
      try {
        const keyNames = normalizeKeyCombo(keys);
        const nutKeys = keyNames.map((k) => {
          const found = (nut.Key as any)[k];
          if (found === undefined) throw new Error(`Unknown key: "${k}" (from "${keys}")`);
          return found;
        });
        if (nutKeys.length === 1) {
          await nut.keyboard.pressKey(nutKeys[0]);
          await nut.keyboard.releaseKey(nutKeys[0]);
        } else {
          await nut.keyboard.pressKey(...nutKeys);
          await nut.keyboard.releaseKey(...nutKeys);
        }
        logger.info({ keys }, 'computer_key');
        return `Key pressed: ${keys}`;
      } catch (err: any) {
        return `Key press failed: ${err.message}`;
      }
    },
  });
}

export function createComputerScrollTool() {
  return tool({
    description: 'Scroll the mouse wheel at a screen position.',
    inputSchema: zodSchema(z.object({
      x: z.number().describe('X coordinate to scroll at'),
      y: z.number().describe('Y coordinate to scroll at'),
      direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
      amount: z.number().int().min(1).max(20).optional().describe('Number of scroll steps (default: 3)'),
    })),
    execute: async ({ x, y, direction, amount = 3 }) => {
      const nut = await loadNut();
      if (!nut) return nutMissingMessage();
      try {
        await nut.mouse.setPosition({ x, y });
        for (let i = 0; i < amount; i++) {
          if (direction === 'up') await nut.mouse.scrollUp(1);
          else if (direction === 'down') await nut.mouse.scrollDown(1);
          else if (direction === 'left') await nut.mouse.scrollLeft(1);
          else if (direction === 'right') await nut.mouse.scrollRight(1);
        }
        logger.info({ x, y, direction, amount }, 'computer_scroll');
        return `Scrolled ${direction} ${amount} steps at (${x}, ${y}).`;
      } catch (err: any) {
        return `Scroll failed: ${err.message}`;
      }
    },
  });
}

export function createComputerDragTool() {
  return tool({
    description: 'Click and drag from one screen position to another. Useful for moving windows, sliders, or selecting text.',
    inputSchema: zodSchema(z.object({
      from_x: z.number().describe('Start X coordinate'),
      from_y: z.number().describe('Start Y coordinate'),
      to_x: z.number().describe('End X coordinate'),
      to_y: z.number().describe('End Y coordinate'),
    })),
    execute: async ({ from_x, from_y, to_x, to_y }) => {
      const nut = await loadNut();
      if (!nut) return nutMissingMessage();
      try {
        await nut.mouse.setPosition({ x: from_x, y: from_y });
        await nut.mouse.pressButton(nut.Button.LEFT);
        await nut.mouse.move(nut.straightTo({ x: to_x, y: to_y }));
        await nut.mouse.releaseButton(nut.Button.LEFT);
        logger.info({ from_x, from_y, to_x, to_y }, 'computer_drag');
        return `Dragged from (${from_x}, ${from_y}) to (${to_x}, ${to_y}).`;
      } catch (err: any) {
        return `Drag failed: ${err.message}`;
      }
    },
  });
}

export function createComputerScreenSizeTool() {
  return tool({
    description: 'Get the width and height of the primary display in pixels. Use this before clicking to understand coordinate bounds.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const nut = await loadNut();
      if (!nut) {
        // Fallback: use system commands
        const os = platform();
        try {
          if (os === 'darwin') {
            const { execSync } = await import('node:child_process');
            const out = execSync(`system_profiler SPDisplaysDataType | grep Resolution | head -1`, { encoding: 'utf-8' });
            return `Display info: ${out.trim()}`;
          }
          if (os === 'linux') {
            const { execSync } = await import('node:child_process');
            const out = execSync(`DISPLAY=:0 xrandr | grep ' connected' | head -1`, { encoding: 'utf-8' });
            return `Display info: ${out.trim()}`;
          }
        } catch {}
        return nutMissingMessage();
      }
      try {
        const screen = nut.screen;
        const width = await screen.width();
        const height = await screen.height();
        logger.info({ width, height }, 'computer_screen_size');
        return `Primary display: ${width}x${height} pixels`;
      } catch (err: any) {
        return `Failed to get screen size: ${err.message}`;
      }
    },
  });
}
