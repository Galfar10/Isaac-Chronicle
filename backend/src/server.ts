import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ITEM_KINDS,
  STATE_SCHEMA_VERSION,
  WIRE_PROTOCOL,
  WS_PROTOCOL,
  type ClientMessage,
  type DomainEvent,
  type GameState,
  type ItemKind,
  type ServerMessage,
} from '@irtc/protocol';
import type { Repository } from './db/repository.js';

export const APP_VERSION = '0.1.0';

export interface ServerOptions {
  repo: Repository;
  getState: () => GameState;
  host?: string;
  port?: number;
  /** Built web app (web/dist). Optional: the API works without it. */
  staticDir?: string | null;
  /** Folder that contains gfx/items/{collectibles,trinkets} from the user's extracted resources. */
  gfxDir?: () => string | null;
  /** Extra origins allowed to use the API/WebSocket (e.g. a hosted copy of the web UI). */
  allowedOrigins?: string[];
  /** Minimum interval between WebSocket broadcasts (coalescing). */
  broadcastIntervalMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isOriginAllowed(origin: string | undefined, extra: string[] = []): boolean {
  if (!origin || origin === 'null') return true; // same-origin navigation, file://, curl
  try {
    const u = new URL(origin);
    if (LOCAL_HOSTS.has(u.hostname)) return true;
  } catch {
    return false;
  }
  return extra.includes(origin);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

function parseKind(s: string | undefined): ItemKind | null {
  return s && (ITEM_KINDS as readonly string[]).includes(s) ? (s as ItemKind) : null;
}

function parseRefs(s: string | null): { kind: ItemKind; id: number }[] {
  if (!s) return [];
  return s
    .split(',')
    .slice(0, 500)
    .map((part) => {
      const [k, id] = part.includes(':') ? part.split(':') : ['collectible', part];
      return { kind: parseKind(k), id: Number(id) };
    })
    .filter((r): r is { kind: ItemKind; id: number } => r.kind !== null && Number.isInteger(r.id));
}

export interface CompanionServer {
  http: Server;
  wss: WebSocketServer;
  port: number;
  url: string;
  /** Queues domain events; the state is read at flush time (coalesced). */
  publish(events: DomainEvent[]): void;
  clientCount(): number;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<CompanionServer> {
  const log = opts.logger ?? console;
  const host = opts.host ?? '127.0.0.1';
  const extraOrigins = opts.allowedOrigins ?? [];
  const staticRoot = opts.staticDir && existsSync(opts.staticDir) ? resolve(opts.staticDir) : null;
  const startedAt = Date.now();

  const cors = (req: IncomingMessage, res: ServerResponse): boolean => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, extraOrigins)) {
      sendJson(res, 403, { error: 'origin not allowed' });
      return false;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    return true;
  };

  const serveFile = (res: ServerResponse, file: string, cache: string) => {
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  };

  const handleApi = (req: IncomingMessage, res: ServerResponse, url: URL): void => {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const repo = opts.repo;
    const [a, b, c] = parts;
    switch (a) {
      case 'health':
        return sendJson(res, 200, {
          ok: true,
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          game: opts.getState().connection.game,
          clients: wss.clients.size,
          data: repo.counts(),
        });
      case 'version':
        return sendJson(res, 200, {
          app: APP_VERSION,
          wsProtocol: WS_PROTOCOL,
          wireProtocol: WIRE_PROTOCOL,
          stateSchema: STATE_SCHEMA_VERSION,
          dataVersion: repo.getVersion('data'),
          mod: opts.getState().connection.modVersion,
        });
      case 'state':
        return sendJson(res, 200, opts.getState());
      case 'items': {
        if (b === 'search') {
          const kind = parseKind(url.searchParams.get('kind') ?? undefined);
          const q = (url.searchParams.get('q') ?? '').slice(0, 80);
          return sendJson(res, 200, repo.search(q, kind, Number(url.searchParams.get('limit') ?? 20)));
        }
        if (!b) return sendJson(res, 200, repo.getItems(parseRefs(url.searchParams.get('refs'))));
        // /api/items/:id (collectible) or /api/items/:kind/:id
        const kind = c !== undefined ? parseKind(b) : 'collectible';
        const id = Number(c ?? b);
        if (!kind || !Number.isInteger(id)) return sendJson(res, 400, { error: 'invalid item reference' });
        const item = repo.getItem(kind, id);
        return item ? sendJson(res, 200, item) : sendJson(res, 404, { error: 'unknown item', kind, id });
      }
      case 'synergies': {
        if (b) {
          const kind = c !== undefined ? parseKind(b) : 'collectible';
          const id = Number(c ?? b);
          if (!kind || !Number.isInteger(id)) return sendJson(res, 400, { error: 'invalid item reference' });
          return sendJson(res, 200, repo.synergiesFor(kind, id));
        }
        const refs = parseRefs(url.searchParams.get('items'));
        if (refs.length) return sendJson(res, 200, repo.synergiesAmong(refs));
        return sendJson(res, 200, repo.listSynergies(Number(url.searchParams.get('limit') ?? 100), Number(url.searchParams.get('offset') ?? 0)));
      }
      case 'discoveries': {
        // Only what the player has really discovered (presented-only entries are not knowledge).
        const d = opts.getState().discoveries;
        return sendJson(res, 200, { pills: d.pills, cards: d.cards });
      }
      case 'characters':
        return sendJson(res, 200, repo.characters());
      case 'transformations':
        return sendJson(res, 200, repo.transformations());
      case 'runs':
        if (b) return sendJson(res, 200, { id: b, events: repo.runEvents(b) });
        return sendJson(res, 200, repo.listRuns(Number(url.searchParams.get('limit') ?? 20)));
      default:
        return sendJson(res, 404, { error: 'not found' });
    }
  };

  const handleGfx = (res: ServerResponse, url: URL): void => {
    const m = /^\/gfx\/(collectibles|trinkets)\/([\w.-]+\.png)$/i.exec(url.pathname);
    const root = opts.gfxDir?.();
    if (!m || !root) return sendJson(res, 404, { error: 'no local sprite' });
    const file = join(root, 'gfx', 'items', m[1].toLowerCase(), m[2]);
    if (!existsSync(file)) return sendJson(res, 404, { error: 'sprite not found' });
    serveFile(res, file, 'public, max-age=86400');
  };

  const handleStatic = (res: ServerResponse, url: URL): void => {
    if (!staticRoot) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Isaac Companion API is running. The web UI is not built: run "npm run build:web" or use "npm run dev:web".');
      return;
    }
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
    } catch {
      return sendJson(res, 400, { error: 'bad path' });
    }
    let file = resolve(staticRoot, rel);
    if (file !== staticRoot && !file.startsWith(staticRoot + sep)) return sendJson(res, 403, { error: 'forbidden' });
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticRoot, 'index.html'); // SPA fallback
    const immutable = file.includes(`${sep}assets${sep}`);
    serveFile(res, file, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  };

  const http = createHttpServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'OPTIONS') {
        if (!cors(req, res)) return;
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          // Chrome Private Network Access preflight (hosted page -> 127.0.0.1).
          ...(req.headers['access-control-request-private-network'] ? { 'Access-Control-Allow-Private-Network': 'true' } : {}),
        });
        return res.end();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
      if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
        if (!cors(req, res)) return;
        return handleApi(req, res, url);
      }
      if (url.pathname.startsWith('/gfx/')) {
        if (!cors(req, res)) return;
        return handleGfx(res, url);
      }
      return handleStatic(res, url);
    } catch (err) {
      log.error('[server] request failed:', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    }
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
  });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws' || !isOriginAllowed(req.headers.origin, extraOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  let seq = 0;
  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  wss.on('connection', (ws) => {
    send(ws, {
      v: WS_PROTOCOL,
      type: 'welcome',
      server: { version: APP_VERSION, dataVersion: opts.repo.getVersion('data') },
      state: opts.getState(),
    });
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15000);
    ws.on('close', () => clearInterval(ping));
    ws.on('error', () => clearInterval(ping));
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type === 'ping' && typeof msg.t === 'number') send(ws, { v: WS_PROTOCOL, type: 'pong', t: msg.t });
    });
  });

  // Coalesced broadcasting: at most one message per interval, never identical state twice.
  let pending: DomainEvent[] = [];
  let timer: NodeJS.Timeout | null = null;
  let lastStateJson = '';
  const interval = opts.broadcastIntervalMs ?? 50;
  const flush = () => {
    timer = null;
    const state = opts.getState();
    const stateJson = JSON.stringify(state);
    const events = pending;
    pending = [];
    if (!events.length && stateJson === lastStateJson) return;
    lastStateJson = stateJson;
    if (!wss.clients.size) return;
    const payload = `{"v":${WS_PROTOCOL},"type":"update","seq":${++seq},"events":${JSON.stringify(events)},"state":${stateJson}}`;
    for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(payload);
  };

  await new Promise<void>((resolveListen, reject) => {
    http.once('error', reject);
    http.listen(opts.port ?? 47823, host, () => resolveListen());
  });
  const port = (http.address() as AddressInfo).port;

  return {
    http,
    wss,
    port,
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
    publish(events) {
      pending.push(...events);
      if (!timer) timer = setTimeout(flush, interval);
    },
    clientCount: () => wss.clients.size,
    close: () =>
      new Promise<void>((r) => {
        if (timer) clearTimeout(timer);
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        http.close(() => r());
        http.closeAllConnections?.();
      }),
  };
}
