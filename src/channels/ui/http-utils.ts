import type { IncomingMessage, ServerResponse } from 'node:http';
import { realpathSync } from 'node:fs';
import { sep, join } from 'node:path';
import { getTotaHome } from '../../utils/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

export async function readBody(req: IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Too large'), { code: 'ETOOLARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export async function readBodyRaw(req: IncomingMessage, maxBytes = 50 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Too large'), { code: 'ETOOLARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Parse a multipart/form-data body — lightweight, no external deps. */
export function parseMultipart(body: Buffer, boundary: string): Map<string, { filename?: string; data: Buffer; contentType?: string }> {
  const results = new Map<string, { filename?: string; data: Buffer; contentType?: string }>();
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = body.indexOf(delim, start);
    if (idx === -1) break;
    if (start > 0) parts.push(body.subarray(start, idx));
    start = idx + delim.length;
    // skip \r\n after boundary
    if (body[start] === 0x0d) start += 2;
    else if (body[start] === 0x0a) start += 1;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerStr = part.subarray(0, headerEnd).toString('utf-8');
    let data = part.subarray(headerEnd + 4);
    // Remove trailing \r\n
    if (data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, data.length - 2);
    }
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerStr.match(/Content-Type:\s*(.+)/i);
    results.set(name, {
      filename: filenameMatch?.[1],
      data,
      contentType: contentTypeMatch?.[1]?.trim(),
    });
  }
  return results;
}

export function maskKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return '***' + key.slice(-4);
}

// Restrict /api/file to these roots. Any other path returns 403.
const FILE_API_ROOTS = (() => {
  const totaHome = getTotaHome();
  return [
    totaHome,
    join(totaHome, 'memory'),
    join(totaHome, 'skills'),
    join(totaHome, 'tmp'),
    join(totaHome, 'tmp', 'uploads'),
    '/tmp',
    process.cwd(),
  ];
})();

export function isPathAllowed(filePath: string): boolean {
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch {
    return false;
  }
  for (const root of FILE_API_ROOTS) {
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      continue;
    }
    const prefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
    if (real === realRoot || real.startsWith(prefix)) return true;
  }
  return false;
}
