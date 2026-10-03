import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameStateStore } from '../bridge/src/store';
import { startServer, type CompanionServer } from '../backend/src/server';
import { isLoopback, isPrivateAddress, keyMatches, lanAddresses, readCookie } from '../backend/src/lan';
import { testDb } from './helpers';

const KEY = 'test-key-0123456789abcdef';
const quiet = { info() {}, warn() {}, error() {} };

function raw(host: string, port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request({ host, port, method, path, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function wsOpens(url: string, headers: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on('open', () => (ws.close(), resolve(true)));
    ws.on('error', () => resolve(false));
    ws.on('unexpected-response', () => resolve(false));
  });
}

describe('mobile mode helpers', () => {
  it('classifies addresses', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('192.168.1.5')).toBe(false);
    for (const a of ['192.168.1.5', '10.0.0.2', '172.16.4.4', '172.31.0.1', '::ffff:192.168.0.9', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(a)).toBe(true);
    }
    for (const a of ['8.8.8.8', '172.32.0.1', '100.64.0.1', '2001:db8::1', undefined]) expect(isPrivateAddress(a)).toBe(false);
  });

  it('compares keys and reads cookies', () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches('nope', KEY)).toBe(false);
    expect(keyMatches(null, KEY)).toBe(false);
    expect(readCookie('a=1; irtc_key=abc; b=2', 'irtc_key')).toBe('abc');
    expect(readCookie('a=1', 'irtc_key')).toBeNull();
  });
});

describe('mobile mode server', () => {
  let server: CompanionServer;
  let saved: boolean[] = [];
  // A real private address of this machine: connecting to it from here is a non-loopback (LAN) request.
  const ip = lanAddresses()[0];

  beforeAll(async () => {
    const { repo } = testDb();
    const store = new GameStateStore();
    saved = [];
    server = await startServer({
      repo,
      getState: () => store.state,
      port: 0,
      staticDir: null,
      logger: quiet,
      lanKey: KEY,
      onLanChange: (on) => saved.push(on),
      lanAddresses: () => (ip ? [ip] : []),
    });
  });
  afterAll(() => server.close());

  it('is off by default and the status is only for the PC', async () => {
    expect(server.lanStatus()).toEqual({ available: true, enabled: false, addresses: [], urls: [] });
    const r = await raw('127.0.0.1', server.port, 'GET', '/api/lan');
    expect(JSON.parse(r.body)).toMatchObject({ enabled: false });
  });

  it('only accepts the switch from a local page with JSON', async () => {
    const body = JSON.stringify({ enabled: true });
    const evil = await raw('127.0.0.1', server.port, 'POST', '/api/lan', { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body);
    expect(evil.status).toBe(403);
    const hosted = await raw('127.0.0.1', server.port, 'POST', '/api/lan', { 'Content-Type': 'application/json', Origin: 'https://galfar10.github.io' }, body);
    expect(hosted.status).toBe(403);
    const form = await raw('127.0.0.1', server.port, 'POST', '/api/lan', { 'Content-Type': 'text/plain' }, body);
    expect(form.status).toBe(403);
    const bad = await raw('127.0.0.1', server.port, 'POST', '/api/lan', { 'Content-Type': 'application/json' }, '{"enabled":"yes"}');
    expect(bad.status).toBe(400);
    expect(server.lanStatus().enabled).toBe(false);
    expect(saved).toEqual([]);
  });

  it.skipIf(!ip)('turns on, guards every LAN request with the key and turns off', async () => {
    const on = await raw('127.0.0.1', server.port, 'POST', '/api/lan', { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${server.port}` }, JSON.stringify({ enabled: true }));
    expect(on.status).toBe(200);
    const status = JSON.parse(on.body);
    expect(status.enabled).toBe(true);
    expect(status.urls).toEqual([`http://${ip}:${server.port}/?key=${KEY}`]);
    expect(saved).toEqual([true]);

    // No key: denied (API, page and WebSocket).
    expect((await raw(ip, server.port, 'GET', '/api/state')).status).toBe(403);
    expect((await raw(ip, server.port, 'GET', '/')).status).toBe(403);
    expect((await raw(ip, server.port, 'GET', '/?key=wrong')).status).toBe(403);
    expect(await wsOpens(`ws://${ip}:${server.port}/ws`, {})).toBe(false);

    // The QR link swaps the key for a cookie and drops it from the address bar.
    const link = await raw(ip, server.port, 'GET', `/?key=${KEY}&lang=en`);
    expect(link.status).toBe(302);
    expect(link.headers.location).toBe('/?lang=en');
    expect(String(link.headers['set-cookie'])).toMatch(/irtc_key=.+HttpOnly; SameSite=Strict/);

    const cookie = { Cookie: `irtc_key=${KEY}` };
    expect((await raw(ip, server.port, 'GET', '/api/state', cookie)).status).toBe(200);
    // Same-origin page only; the access links are never served over the LAN.
    expect((await raw(ip, server.port, 'GET', '/api/state', { ...cookie, Origin: 'http://evil.example' })).status).toBe(403);
    expect((await raw(ip, server.port, 'GET', '/api/lan', cookie)).status).toBe(403);
    const lanPost = await raw(ip, server.port, 'POST', '/api/lan', { ...cookie, 'Content-Type': 'application/json' }, JSON.stringify({ enabled: false }));
    expect(lanPost.status).toBe(403);

    expect(await wsOpens(`ws://${ip}:${server.port}/ws`, { ...cookie, Origin: `http://${ip}:${server.port}` })).toBe(true);
    expect(await wsOpens(`ws://${ip}:${server.port}/ws`, { ...cookie, Origin: 'http://evil.example' })).toBe(false);

    const off = await server.setLan(false);
    expect(off).toMatchObject({ enabled: false, addresses: [], urls: [] });
    await expect(raw(ip, server.port, 'GET', '/api/state', cookie)).rejects.toThrow();
    // The PC keeps working.
    expect((await raw('127.0.0.1', server.port, 'GET', '/api/state')).status).toBe(200);
  });

  it('without a key mobile mode cannot be turned on', async () => {
    const { repo } = testDb();
    const store = new GameStateStore();
    const s = await startServer({ repo, getState: () => store.state, port: 0, staticDir: null, logger: quiet, lanAddresses: () => (ip ? [ip] : []) });
    try {
      const r = await raw('127.0.0.1', s.port, 'POST', '/api/lan', { 'Content-Type': 'application/json' }, JSON.stringify({ enabled: true }));
      expect(r.status).toBe(409);
      expect(s.lanStatus().enabled).toBe(false);
    } finally {
      await s.close();
    }
  });
});
