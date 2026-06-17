import type { WAMessage } from '@whiskeysockets/baileys';

const MAX_TEXT_LENGTH = 4096;

export function extractText(msg: WAMessage): string {
  const m = msg.message!;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    ''
  );
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `+${digits}`;
}

export function chunkText(text: string): string[] {
  if (text.length <= MAX_TEXT_LENGTH) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + MAX_TEXT_LENGTH));
    i += MAX_TEXT_LENGTH;
  }
  return chunks;
}

export function guessMime(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.csv': 'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}
