import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../../utils/logger.js';

export const TMP_VOICE_DIR = join(homedir(), '.tota', 'tmp', 'voice');

// ── MIME type map ────────────────────────────────────────────────────────────
const AUDIO_MIMES: Record<string, string> = {
  mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/m4a',
  wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
  mpeg: 'audio/mpeg', mpga: 'audio/mpeg', flac: 'audio/flac',
};

// ── Config helpers ───────────────────────────────────────────────────────────
function voiceCfg(getConfig: () => any) {
  const c = getConfig();
  return {
    ttsProvider: (c?.voice?.ttsProvider ?? 'openai') as string,
    sttProvider: (c?.voice?.sttProvider ?? 'openai') as string,
    openaiKey: c?.providers?.openai?.apiKey || process.env.OPENAI_API_KEY || '',
    elevenLabsKey: c?.voice?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '',
    elevenLabsVoiceId: c?.voice?.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    googleTtsKey: c?.voice?.googleTtsApiKey || process.env.GOOGLE_TTS_API_KEY || '',
    groqKey: c?.voice?.groqApiKey || process.env.GROQ_API_KEY || '',
    defaultVoice: c?.voice?.defaultVoice || 'alloy',
  };
}

// ── TTS Providers ────────────────────────────────────────────────────────────

async function ttsOpenAI(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const v = validVoices.includes(voice) ? voice : 'alloy';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', input: text.slice(0, 4096), voice: v }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`OpenAI TTS error ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function ttsElevenLabs(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`ElevenLabs TTS error ${res.status}: ${err?.detail?.message ?? err?.detail ?? res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function ttsGoogle(text: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: text.slice(0, 5000) },
      voice: { languageCode: 'en-US', name: 'en-US-Journey-F' },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Google TTS error ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  const data = await res.json() as { audioContent: string };
  return Buffer.from(data.audioContent, 'base64');
}

// ── STT Providers ────────────────────────────────────────────────────────────

async function sttOpenAI(audioPath: string, apiKey: string, language?: string): Promise<string> {
  const audioData = readFileSync(audioPath);
  const ext = audioPath.split('.').pop()?.toLowerCase() ?? 'ogg';
  const mimeType = AUDIO_MIMES[ext] ?? 'audio/ogg';
  const form = new FormData();
  form.append('file', new Blob([audioData], { type: mimeType }), basename(audioPath));
  form.append('model', 'whisper-1');
  if (language) form.append('language', language);
  form.append('response_format', 'json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`OpenAI Whisper error ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  return ((await res.json()) as { text: string }).text;
}

async function sttGroq(audioPath: string, apiKey: string, language?: string): Promise<string> {
  const audioData = readFileSync(audioPath);
  const ext = audioPath.split('.').pop()?.toLowerCase() ?? 'ogg';
  const mimeType = AUDIO_MIMES[ext] ?? 'audio/ogg';
  const form = new FormData();
  form.append('file', new Blob([audioData], { type: mimeType }), basename(audioPath));
  form.append('model', 'whisper-large-v3');
  if (language) form.append('language', language);
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Groq Whisper error ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  return ((await res.json()) as { text: string }).text;
}

// ── Exported helper for Telegram auto-transcription ─────────────────────────
/** Transcribe audio using the best available provider (Groq preferred > OpenAI fallback). */
export async function transcribeAudioFile(
  audioPath: string,
  config: { openaiKey?: string; groqKey?: string; sttProvider?: string },
): Promise<string> {
  const sttProvider = config.sttProvider ?? 'openai';

  if (sttProvider === 'groq' && config.groqKey) {
    return sttGroq(audioPath, config.groqKey);
  }
  if (config.openaiKey) {
    return sttOpenAI(audioPath, config.openaiKey);
  }
  if (config.groqKey) {
    return sttGroq(audioPath, config.groqKey);
  }
  throw new Error('No STT API key configured. Set OPENAI_API_KEY or GROQ_API_KEY in ~/.tota/.env');
}

// ── Tool: text_to_speech ─────────────────────────────────────────────────────
export function createTextToSpeechTool(getConfig: () => any, sendFile?: (path: string) => Promise<void>) {
  return tool({
    description: [
      'Convert text to speech (MP3 audio). Supports multiple providers:',
      '• openai — OpenAI TTS (voices: alloy, echo, fable, onyx, nova, shimmer). Requires OPENAI_API_KEY.',
      '• elevenlabs — ElevenLabs ultra-realistic voices. Requires ELEVENLABS_API_KEY.',
      '• google — Google Cloud Text-to-Speech. Requires GOOGLE_TTS_API_KEY.',
      'Provider is selected from config/env. Optionally sends audio via Telegram.',
    ].join('\n'),
    inputSchema: zodSchema(z.object({
      text: z.string().describe('Text to speak (max ~5000 chars)'),
      voice: z.string().optional().describe('Voice name. OpenAI: alloy|echo|fable|onyx|nova|shimmer. ElevenLabs: voice ID. Omit to use default.'),
      provider: z.enum(['openai', 'elevenlabs', 'google']).optional().describe('Override the configured TTS provider for this call.'),
      send: z.boolean().optional().describe('Send the MP3 file to the user (default: true when sendFile handler exists)'),
    })),
    execute: async ({ text, voice, provider, send }) => {
      try {
        const cfg = voiceCfg(getConfig);
        const useProvider = provider ?? cfg.ttsProvider;

        mkdirSync(TMP_VOICE_DIR, { recursive: true });
        const filename = `tts-${Date.now()}.mp3`;
        const outputPath = join(TMP_VOICE_DIR, filename);

        let buffer: Buffer;
        let providerLabel: string;

        if (useProvider === 'elevenlabs') {
          if (!cfg.elevenLabsKey) return 'ElevenLabs TTS: ELEVENLABS_API_KEY not set. Run `tota setup voice` to configure.';
          const vid = voice ?? cfg.elevenLabsVoiceId;
          buffer = await ttsElevenLabs(text, vid, cfg.elevenLabsKey);
          providerLabel = `ElevenLabs (voice: ${vid})`;
        } else if (useProvider === 'google') {
          if (!cfg.googleTtsKey) return 'Google TTS: GOOGLE_TTS_API_KEY not set. Run `tota setup voice` to configure.';
          buffer = await ttsGoogle(text, cfg.googleTtsKey);
          providerLabel = 'Google TTS (en-US-Journey-F)';
        } else {
          if (!cfg.openaiKey) return 'OpenAI TTS: OPENAI_API_KEY not set. Run `tota setup voice` to configure.';
          const v = voice ?? cfg.defaultVoice ?? 'alloy';
          buffer = await ttsOpenAI(text, v, cfg.openaiKey);
          providerLabel = `OpenAI TTS (voice: ${v})`;
        }

        writeFileSync(outputPath, buffer);
        logger.info({ path: outputPath, provider: useProvider, chars: text.length }, 'TTS audio generated');

        if (send !== false && sendFile) {
          await sendFile(outputPath);
          return `Speech generated via ${providerLabel} (${Math.round(buffer.length / 1024)}KB) and sent as audio.`;
        }
        return `Speech saved: ${outputPath}\nProvider: ${providerLabel} | Size: ${Math.round(buffer.length / 1024)}KB`;
      } catch (err: any) {
        return `Error generating speech: ${err.message}`;
      }
    },
  });
}

// ── Tool: transcribe_audio ───────────────────────────────────────────────────
export function createTranscribeAudioTool(getConfig: () => any) {
  return tool({
    description: [
      'Transcribe an audio file to text. Supports multiple providers:',
      '• openai — OpenAI Whisper (whisper-1). Requires OPENAI_API_KEY.',
      '• groq — Groq Whisper (whisper-large-v3, faster & cheaper). Requires GROQ_API_KEY.',
      'Supported formats: MP3, MP4, MPEG, M4A, WAV, WEBM, OGG, FLAC.',
    ].join('\n'),
    inputSchema: zodSchema(z.object({
      path: z.string().describe('Absolute path to the audio file'),
      language: z.string().optional().describe('ISO 639-1 language code (e.g. "en", "es"). Omit for auto-detect.'),
      provider: z.enum(['openai', 'groq']).optional().describe('Override the configured STT provider for this call.'),
    })),
    execute: async ({ path: audioPath, language, provider }) => {
      try {
        if (!existsSync(audioPath)) return `Error: File not found: ${audioPath}`;

        const cfg = voiceCfg(getConfig);
        const useProvider = provider ?? cfg.sttProvider;

        let transcript: string;
        let providerLabel: string;

        if (useProvider === 'groq') {
          if (!cfg.groqKey) return 'Groq STT: GROQ_API_KEY not set. Run `tota setup voice` to configure.';
          transcript = await sttGroq(audioPath, cfg.groqKey, language);
          providerLabel = 'Groq (whisper-large-v3)';
        } else {
          if (!cfg.openaiKey) return 'OpenAI Whisper: OPENAI_API_KEY not set. Run `tota setup voice` to configure.';
          transcript = await sttOpenAI(audioPath, cfg.openaiKey, language);
          providerLabel = 'OpenAI (whisper-1)';
        }

        logger.info({ path: audioPath, provider: useProvider, chars: transcript.length }, 'Audio transcribed');
        return `Transcript [${providerLabel}]:\n${transcript}`;
      } catch (err: any) {
        return `Error transcribing audio: ${err.message}`;
      }
    },
  });
}
