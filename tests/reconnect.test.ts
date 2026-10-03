import { describe, expect, it } from 'vitest';
import { GameStateStore } from '../bridge/src/store';
import { startServer } from '../backend/src/server';
import { ConnectionManager, type SocketStatus } from '../web/src/lib/connection';
import { testDb } from './helpers';

const quiet = { info() {}, warn() {}, error() {} };
const waitFor = async (cond: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('web client reconnection', () => {
  it('reconnects automatically after the companion restarts', async () => {
    const { repo } = testDb();
    const store = new GameStateStore();
    let server = await startServer({ repo, getState: () => store.state, port: 0, logger: quiet });
    const port = server.port;
    const statuses: SocketStatus[] = [];
    let welcomes = 0;
    const conn = new ConnectionManager({
      url: `ws://127.0.0.1:${port}/ws`,
      minDelayMs: 50,
      maxDelayMs: 200,
      onMessage: (m) => {
        if (m.type === 'welcome') welcomes++;
      },
      onStatus: (s) => statuses.push(s),
    });
    conn.start();
    await waitFor(() => welcomes === 1);
    expect(conn.status).toBe('open');

    await server.close(); // companion closed / crashed
    await waitFor(() => conn.status !== 'open');
    expect(statuses).toContain('closed');

    server = await startServer({ repo, getState: () => store.state, port, logger: quiet });
    await waitFor(() => welcomes === 2);
    expect(conn.status).toBe('open');
    expect(conn.attempt).toBe(0);
    conn.stop();
    await server.close();
  });

  it('ignores invalid messages without breaking', async () => {
    const { WebSocketServer } = await import('ws');
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => wss.once('listening', r));
    const port = (wss.address() as { port: number }).port;
    wss.on('connection', (ws) => {
      ws.send('not json');
      ws.send(JSON.stringify({ v: 99, type: 'welcome' }));
      ws.send(JSON.stringify({ v: 1, type: 'pong', t: 1 }));
    });
    const got: string[] = [];
    const conn = new ConnectionManager({ url: `ws://127.0.0.1:${port}/`, onMessage: (m) => got.push(m.type) });
    conn.start();
    await waitFor(() => got.length === 1);
    expect(got).toEqual(['pong']);
    conn.stop();
    wss.close();
  });
});
