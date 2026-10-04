import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMessage } from '@irtc/protocol';
import { GameStateStore } from '../bridge/src/store';
import { isOriginAllowed, startServer, type CompanionServer } from '../backend/src/server';
import { testDb } from './helpers';

let server: CompanionServer;
let store: GameStateStore;
let base: string;

beforeAll(async () => {
  const { repo } = testDb();
  store = new GameStateStore();
  server = await startServer({ repo, getState: () => store.state, port: 0, staticDir: null, broadcastIntervalMs: 5, logger: { info() {}, warn() {}, error() {} } });
  base = server.url;
});
afterAll(() => server.close());

const get = async (path: string, headers: Record<string, string> = {}) => {
  const r = await fetch(base + path, { headers });
  return { status: r.status, body: await r.json() };
};

function nextMessage(ws: WebSocket, pred: (m: ServerMessage) => boolean = () => true): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ws message')), 3000);
    const on = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      if (!pred(msg)) return;
      clearTimeout(t);
      ws.removeEventListener('message', on);
      resolve(msg);
    };
    ws.addEventListener('message', on);
  });
}

describe('HTTP API', () => {
  it('GET /api/health and /api/version', async () => {
    const h = await get('/api/health');
    expect(h.status).toBe(200);
    expect(h.body).toMatchObject({ ok: true, game: 'waiting', data: { items: 5, synergies: 2 } });
    const v = await get('/api/version');
    expect(v.body).toMatchObject({ app: '0.4.0', wsProtocol: 1, wireProtocol: 1, dataVersion: 'test-1' });
  });

  it('GET /api/items/:id and /api/items/:kind/:id', async () => {
    expect((await get('/api/items/118')).body.name).toBe('Brimstone');
    expect((await get('/api/items/trinket/1')).body.name).toBe('Swallowed Penny');
    expect((await get('/api/items/424242')).status).toBe(404);
    expect((await get('/api/items/nope/1')).status).toBe(400);
  });

  it('GET /api/items/search', async () => {
    const r = await get('/api/items/search?q=knife');
    expect(r.body.map((i: { id: number }) => i.id)).toEqual([114]);
  });

  it('GET /api/synergies variants', async () => {
    expect((await get('/api/synergies')).body).toHaveLength(2);
    expect((await get('/api/synergies?items=collectible:118,collectible:114')).body).toHaveLength(1);
    expect((await get('/api/synergies/collectible/12')).body[0].description).toBe('Damage multipliers do not stack.');
  });

  it('GET /api/state returns the full extensible state', async () => {
    const s = await get('/api/state');
    expect(s.body).toMatchObject({ schemaVersion: 1, connection: { game: 'waiting' }, run: null, roomItems: [], history: [] });
  });

  it('rejects foreign origins, allows localhost', async () => {
    expect((await get('/api/state', { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await get('/api/state', { Origin: 'http://localhost:5173' })).status).toBe(200);
    expect(isOriginAllowed('https://companion.example', ['https://companion.example'])).toBe(true);
  });
});

describe('WebSocket', () => {
  it('sends a welcome snapshot, then coalesced updates with events', async () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const welcome = await nextMessage(ws);
    expect(welcome.type).toBe('welcome');
    const update = nextMessage(ws, (m) => m.type === 'update');
    const events = store.apply({ kind: 'run', seq: 1, data: { cont: false, seed: 'X', f: 0, ptype: 0 } });
    server.publish(events);
    const u = await update;
    expect(u.type === 'update' && u.events.map((e) => e.event)).toContain('run_started');
    expect(u.type === 'update' && u.state.run?.seed).toBe('X');
    ws.send(JSON.stringify({ type: 'ping', t: 42 }));
    const pong = await nextMessage(ws, (m) => m.type === 'pong');
    expect(pong).toEqual({ v: 1, type: 'pong', t: 42 });
    ws.close();
  });

  it('does not re-send identical state without events', async () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    await nextMessage(ws);
    server.publish([]); // state unchanged since last flush
    server.publish([]);
    await expect(nextMessage(ws, (m) => m.type === 'update')).rejects.toThrow('timeout');
    ws.close();
  });
});
