import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTextToSpeechTool, createTranscribeAudioTool, transcribeAudioFile } from './voice.js';

function execute(tool: any, args: any): Promise<string> {
  return (tool as any).execute(args);
}

const mockConfig = (overrides: Record<string, any> = {}) => () => ({
  providers: { openai: { apiKey: 'test-openai-key' } },
  voice: { ttsProvider: 'openai', sttProvider: 'openai', defaultVoice: 'alloy', ...overrides },
});

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'tota-voice-test-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ── text_to_speech tool ──────────────────────────────────────────────────────
describe('text_to_speech tool', () => {
  it('returns error when OPENAI_API_KEY is missing (openai provider)', async () => {
    const getConfig = () => ({ providers: { openai: { apiKey: '' } }, voice: { ttsProvider: 'openai' } });
    const tool = createTextToSpeechTool(getConfig);
    const result = await execute(tool, { text: 'Hello world' });
    expect(result).toMatch(/OPENAI_API_KEY not set|tota setup voice/i);
  });

  it('returns error when ELEVENLABS_API_KEY is missing', async () => {
    const getConfig = () => ({
      providers: { openai: { apiKey: '' } },
      voice: { ttsProvider: 'elevenlabs', elevenLabsApiKey: '' },
    });
    const tool = createTextToSpeechTool(getConfig);
    const result = await execute(tool, { text: 'Hello', provider: 'elevenlabs' });
    expect(result).toMatch(/ELEVENLABS_API_KEY not set|tota setup voice/i);
  });

  it('returns error when GOOGLE_TTS_API_KEY is missing', async () => {
    const getConfig = () => ({
      providers: { openai: { apiKey: '' } },
      voice: { ttsProvider: 'google', googleTtsApiKey: '' },
    });
    const tool = createTextToSpeechTool(getConfig);
    const result = await execute(tool, { text: 'Hello', provider: 'google' });
    expect(result).toMatch(/GOOGLE_TTS_API_KEY not set|tota setup voice/i);
  });

  it('calls fetch with OpenAI endpoint and returns save path on success', async () => {
    const mp3Data = Buffer.from('fakemp3data');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mp3Data.buffer,
    }));

    const getConfig = mockConfig();
    const tool = createTextToSpeechTool(getConfig);
    const result = await execute(tool, { text: 'Test TTS' });

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const [url, init] = (vi.mocked(fetch) as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.headers.Authorization).toBe('Bearer test-openai-key');

    expect(result).toMatch(/saved|sent/i);
    expect(result).toContain('.mp3');
  });

  it('invokes sendFile callback when provided and send is not false', async () => {
    const mp3Data = Buffer.from('fakemp3data');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mp3Data.buffer,
    }));

    const sentPaths: string[] = [];
    const sendFile = async (path: string) => { sentPaths.push(path); };

    const getConfig = mockConfig();
    const tool = createTextToSpeechTool(getConfig, sendFile);
    const result = await execute(tool, { text: 'Send me audio', send: true });

    expect(sentPaths).toHaveLength(1);
    expect(result).toMatch(/sent as audio/i);
  });

  it('does NOT invoke sendFile when send=false', async () => {
    const mp3Data = Buffer.from('fakemp3data');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mp3Data.buffer,
    }));

    const sentPaths: string[] = [];
    const sendFile = async (path: string) => { sentPaths.push(path); };
    const getConfig = mockConfig();
    const tool = createTextToSpeechTool(getConfig, sendFile);
    await execute(tool, { text: 'No send', send: false });

    expect(sentPaths).toHaveLength(0);
  });

  it('returns an error message on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'Invalid API key' } }),
    }));

    const getConfig = mockConfig();
    const tool = createTextToSpeechTool(getConfig);
    const result = await execute(tool, { text: 'Will fail' });
    expect(result).toMatch(/error|invalid api key/i);
  });

  it('uses provider override even if config says openai', async () => {
    const getConfig = () => ({
      providers: { openai: { apiKey: 'key' } },
      voice: { ttsProvider: 'openai', elevenLabsApiKey: '' },
    });
    const tool = createTextToSpeechTool(getConfig);
    const result = await execute(tool, { text: 'test', provider: 'elevenlabs' });
    expect(result).toMatch(/ELEVENLABS_API_KEY/i);
  });
});

// ── transcribe_audio tool ────────────────────────────────────────────────────
describe('transcribe_audio tool', () => {
  it('returns error for file not found', async () => {
    const getConfig = mockConfig();
    const tool = createTranscribeAudioTool(getConfig);
    const result = await execute(tool, { path: '/nonexistent/path/audio.ogg' });
    expect(result).toMatch(/not found/i);
  });

  it('returns error when OPENAI_API_KEY is missing', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('fake-ogg-data'));

    const getConfig = () => ({ providers: { openai: { apiKey: '' } }, voice: { sttProvider: 'openai' } });
    const tool = createTranscribeAudioTool(getConfig);
    const result = await execute(tool, { path: audioPath });
    expect(result).toMatch(/OPENAI_API_KEY not set|tota setup voice/i);
  });

  it('returns error when GROQ_API_KEY is missing (groq provider)', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('fake-ogg-data'));

    const getConfig = () => ({ providers: { openai: { apiKey: '' } }, voice: { sttProvider: 'groq', groqApiKey: '' } });
    const tool = createTranscribeAudioTool(getConfig);
    const result = await execute(tool, { path: audioPath, provider: 'groq' });
    expect(result).toMatch(/GROQ_API_KEY not set|tota setup voice/i);
  });

  it('calls OpenAI Whisper endpoint and returns transcript', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('fake-ogg-data'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Hello from the transcript' }),
    }));

    const getConfig = mockConfig();
    const tool = createTranscribeAudioTool(getConfig);
    const result = await execute(tool, { path: audioPath });

    const [url] = (vi.mocked(fetch) as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(result).toContain('Hello from the transcript');
  });

  it('calls Groq Whisper endpoint when provider=groq', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('fake-ogg-data'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Groq transcript here' }),
    }));

    const getConfig = () => ({
      providers: { openai: { apiKey: 'openai-key' } },
      voice: { sttProvider: 'groq', groqApiKey: 'groq-key' },
    });
    const tool = createTranscribeAudioTool(getConfig);
    const result = await execute(tool, { path: audioPath, provider: 'groq' });

    const [url, init] = (vi.mocked(fetch) as any).mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer groq-key');
    expect(result).toContain('Groq transcript here');
  });

  it('includes provider label in result', async () => {
    const audioPath = join(tempDir, 'test.mp3');
    writeFileSync(audioPath, Buffer.from('fake-mp3-data'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'test' }),
    }));

    const getConfig = mockConfig();
    const tool = createTranscribeAudioTool(getConfig);
    const result = await execute(tool, { path: audioPath });
    expect(result).toMatch(/openai|whisper/i);
  });
});

// ── transcribeAudioFile helper ───────────────────────────────────────────────
describe('transcribeAudioFile helper', () => {
  it('throws when no keys are configured', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('data'));

    await expect(transcribeAudioFile(audioPath, {})).rejects.toThrow(/no stt api key/i);
  });

  it('uses OpenAI by default when openaiKey is set', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('data'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'default-openai-result' }),
    }));

    const result = await transcribeAudioFile(audioPath, { openaiKey: 'test-key' });
    const [url] = (vi.mocked(fetch) as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(result).toBe('default-openai-result');
  });

  it('prefers Groq when sttProvider=groq and groqKey set', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('data'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'groq-result' }),
    }));

    const result = await transcribeAudioFile(audioPath, {
      openaiKey: 'openai-key',
      groqKey: 'groq-key',
      sttProvider: 'groq',
    });

    const [url] = (vi.mocked(fetch) as any).mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(result).toBe('groq-result');
  });

  it('falls back to Groq when no OpenAI key but groqKey exists', async () => {
    const audioPath = join(tempDir, 'test.ogg');
    writeFileSync(audioPath, Buffer.from('data'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'groq-fallback' }),
    }));

    const result = await transcribeAudioFile(audioPath, { groqKey: 'groq-only-key' });
    const [url] = (vi.mocked(fetch) as any).mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(result).toBe('groq-fallback');
  });
});
