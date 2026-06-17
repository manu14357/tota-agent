import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import type { TelegramPendingRequest } from '../../utils/config.js';

/** Download a file from a URL to a local path using Node.js built-in http/https */
export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let splitAt = maxLen;
    if (remaining.length > maxLen) {
      const lastNewline = remaining.lastIndexOf('\n', maxLen);
      if (lastNewline > maxLen * 0.5) {
        splitAt = lastNewline + 1;
      }
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<\/?(b|i|s|u|code|pre|a|blockquote|strong|em)[^>]*>/gi, '')
    .replace(/<pre><code[^>]*>/gi, '')
    .replace(/<\/code><\/pre>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function getCommandName(text: string): string {
  return text.trim().split(/\s+/)[0]?.toLowerCase() || '';
}

export function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function formatRequestLabel(request: TelegramPendingRequest): string {
  const username = request.username ? ` (@${request.username})` : '';
  const firstName = request.firstName ? ` ${request.firstName}` : '';
  return `${request.userId}${username}${firstName}`;
}

export function isImageFile(ext: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
}

export function isAudioFile(ext: string): boolean {
  return ['.mp3', '.ogg', '.wav', '.flac', '.m4a'].includes(ext);
}

export function isVideoFile(ext: string): boolean {
  return ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
}
