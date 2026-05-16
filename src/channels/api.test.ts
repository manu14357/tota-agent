import { describe, expect, it, afterEach } from 'vitest';
import { APIChannel } from './api.js';

async function startChannel(port = 0, apiKey = '') {
  const ch = new APIChannel(port, apiKey);
  await ch.start();
  return { ch, port: ch.getPort() };
}

async function post(port: number, path: string, body: any, headers: Record<string, string> = {}) {
  return fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function get(port: number, path: string, headers: Record<string, string> = {}) {
  return fetch(`http://localhost:${port}${path}`, { headers });
}

describe('APIChannel', () => {
  const channels: APIChannel[] = [];

  afterEach(async () => {
    for (const ch of channels) {
      await ch.stop().catch(() => {});
    }
    channels.length = 0;
  });

  it('starts and reports ready', async () => {
    const { ch } = await startChannel();
    channels.push(ch);
    expect(ch.isReady()).toBe(true);
  });

  it('GET /status returns ok', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);
    const resp = await get(port, '/status');
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.status).toBe('ok');
  });

  it('returns 404 for unknown routes', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);
    const resp = await get(port, '/notexist');
    expect(resp.status).toBe(404);
  });

  it('POST /message returns 400 when content missing', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);
    const resp = await post(port, '/message', { foo: 'bar' });
    expect(resp.status).toBe(400);
  });

  it('POST /message emits ChannelMessage and resolves with send()', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);

    ch.onMessage(async (msg) => {
      // Simulate agent responding
      await ch.send('pong response', msg.channelId);
    });

    const resp = await post(port, '/message', { content: 'ping' });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.response).toBe('pong response');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('emitted message has correct channelType = api', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);

    const received: any[] = [];
    ch.onMessage(async (msg) => {
      received.push(msg);
      await ch.send('ack', msg.channelId);
    });

    await post(port, '/message', { content: 'hello' });
    expect(received[0].channelType).toBe('api');
    expect(received[0].content).toBe('hello');
  });

  it('returns 401 when apiKey required but not provided', async () => {
    const { ch, port } = await startChannel(0, 'secret-key');
    channels.push(ch);
    const resp = await post(port, '/message', { content: 'test' });
    expect(resp.status).toBe(401);
  });

  it('accepts Bearer token auth', async () => {
    const { ch, port } = await startChannel(0, 'my-token');
    channels.push(ch);
    ch.onMessage(async (msg) => { await ch.send('ok', msg.channelId); });

    const resp = await post(port, '/message', { content: 'hi' }, {
      'Authorization': 'Bearer my-token',
    });
    expect(resp.status).toBe(200);
  });

  it('accepts X-Api-Key header auth', async () => {
    const { ch, port } = await startChannel(0, 'my-token');
    channels.push(ch);
    ch.onMessage(async (msg) => { await ch.send('ok', msg.channelId); });

    const resp = await post(port, '/message', { content: 'hi' }, {
      'X-Api-Key': 'my-token',
    });
    expect(resp.status).toBe(200);
  });

  it('rejects wrong token with 401', async () => {
    const { ch, port } = await startChannel(0, 'my-token');
    channels.push(ch);
    const resp = await post(port, '/message', { content: 'hi' }, {
      'Authorization': 'Bearer wrong-token',
    });
    expect(resp.status).toBe(401);
  });

  it('allows all requests when no apiKey configured', async () => {
    const { ch, port } = await startChannel(0, '');
    channels.push(ch);
    ch.onMessage(async (msg) => { await ch.send('free', msg.channelId); });

    const resp = await post(port, '/message', { content: 'open' });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.response).toBe('free');
  });

  it('stream() collects chunks and resolves request', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);

    ch.onMessage(async (msg) => {
      async function* gen() { yield 'hello '; yield 'world'; }
      await ch.stream(gen(), msg.channelId);
    });

    const resp = await post(port, '/message', { content: 'stream test' });
    const body = await resp.json() as any;
    expect(body.response).toBe('hello world');
  });

  it('sendFile sends file path as text response', async () => {
    const { ch, port } = await startChannel();
    channels.push(ch);

    ch.onMessage(async (msg) => {
      await ch.sendFile('/tmp/report.pdf', msg.channelId);
    });

    const resp = await post(port, '/message', { content: 'file?' });
    const body = await resp.json() as any;
    expect(body.response).toContain('/tmp/report.pdf');
  });
});
