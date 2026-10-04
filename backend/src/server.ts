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
import { LAN_COOKIE, isLoopback, isPrivateAddress, keyMatches, lanAddresses, readCookie } from './lan.js';

export const APP_VERSION = '0.4.0';

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
  /** Mobile mode: access key required for every LAN request. Without it, mobile mode is unavailable. */
  lanKey?: string | null;
  /** Start with mobile mode on. */
  lanEnabled?: boolean;
  /** Called after mobile mode is switched from the web UI (to persist the choice). */
  onLanChange?: (enabled: boolean) => void;
  /** Overrides the detected LAN addresses (tests). */
  lanAddresses?: () => string[];
}

export interface LanStatus {
  available: boolean;
  enabled: boolean;
  /** Addresses actually listening. */
  addresses: string[];
  /** Ready-to-open links (with the access key). Only ever sent to the PC itself. */
  urls: string[];
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
  lanStatus(): LanStatus;
  setLan(enabled: boolean): Promise<LanStatus>;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<CompanionServer> {
  const log = opts.logger ?? console;
  const host = opts.host ?? '127.0.0.1';
  const extraOrigins = opts.allowedOrigins ?? [];
  const staticRoot = opts.staticDir && existsSync(opts.staticDir) ? resolve(opts.staticDir) : null;
  const startedAt = Date.now();
  const lanKey = opts.lanKey ?? null;
  let lanEnabled = false;
  const lanServers = new Map<string, Server>();
  const remoteClients = new Set<WebSocket>();
  let port = 0;

  /** LAN pages only talk to the address they were loaded from. */
  const sameHost = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  const lanAuthorized = (req: IncomingMessage): boolean =>
    lanEnabled &&
    lanKey !== null &&
    isPrivateAddress(req.socket.remoteAddress) &&
    keyMatches(readCookie(req.headers.cookie, LAN_COOKIE), lanKey) &&
    sameHost(req);

  /**
   * 'local': request from this PC. 'lan': authorized phone/tablet. 'done': response already sent
   * (denied, or the ?key= link was exchanged for a cookie).
   */
  const gate = (req: IncomingMessage, res: ServerResponse, url: URL): 'local' | 'lan' | 'done' => {
    if (isLoopback(req.socket.remoteAddress)) return 'local';
    if (lanAuthorized(req)) return 'lan';
    if (lanEnabled && lanKey && isPrivateAddress(req.socket.remoteAddress) && req.method === 'GET' && keyMatches(url.searchParams.get('key'), lanKey)) {
      url.searchParams.delete('key');
      res.writeHead(302, {
        'Set-Cookie': `${LAN_COOKIE}=${lanKey}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`,
        Location: url.pathname + url.search,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      });
      res.end();
      return 'done';
    }
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Isaac Chronicle</title><body style="font-family:sans-serif;background:#120d0a;color:#e9dcbc;padding:24px;line-height:1.5">' +
        '<h1>Isaac Chronicle</h1>' +
        '<p>Acceso denegado. En el PC abre la web del Companion, pulsa <b>📱 Móvil</b> y escanea el código QR.</p>' +
        '<p>Access denied. On the PC open the Companion web page, press <b>📱 Mobile</b> and scan the QR code.</p>',
    );
    return 'done';
  };

  const lanStatus = (): LanStatus => {
    const addresses = [...lanServers.keys()];
    return {
      available: lanKey !== null,
      enabled: lanEnabled,
      addresses,
      urls: lanEnabled && lanKey ? addresses.map((ip) => `http://${ip}:${port}/?key=${lanKey}`) : [],
    };
  };

  const cors = (req: IncomingMessage, res: ServerResponse, via: 'local' | 'lan' = 'local'): boolean => {
    const origin = req.headers.origin;
    if (via === 'lan' ? !sameHost(req) : !isOriginAllowed(origin, extraOrigins)) {
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

  const handleApi = (req: IncomingMessage, res: ServerResponse, url: URL, via: 'local' | 'lan'): void => {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const repo = opts.repo;
    const [a, b, c] = parts;
    switch (a) {
      case 'lan':
        // The access links are only shown on the PC itself.
        return via === 'local' ? sendJson(res, 200, lanStatus()) : sendJson(res, 403, { error: 'forbidden' });
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

  /** POST /api/lan {"enabled": boolean}: only from a page served by this PC (not the hosted copy, not the LAN). */
  const handleLanPost = (req: IncomingMessage, res: ServerResponse, via: 'local' | 'lan'): void => {
    const origin = req.headers.origin;
    let localOrigin = !origin;
    try {
      localOrigin ||= LOCAL_HOSTS.has(new URL(origin!).hostname);
    } catch {
      localOrigin = false;
    }
    if (via !== 'local' || !localOrigin || !String(req.headers['content-type'] ?? '').includes('application/json')) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 1024) req.destroy();
    });
    req.on('end', () => {
      let enabled: unknown;
      try {
        enabled = (JSON.parse(body) as { enabled?: unknown }).enabled;
      } catch {
        enabled = undefined;
      }
      if (typeof enabled !== 'boolean') return sendJson(res, 400, { error: 'expected {"enabled": boolean}' });
      if (enabled && !lanKey) return sendJson(res, 409, { error: 'mobile mode unavailable' });
      void setLan(enabled).then((status) => {
        opts.onLanChange?.(enabled as boolean);
        sendJson(res, 200, status);
      });
    });
  };

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const via = gate(req, res, url);
      if (via === 'done') return;
      if (req.method === 'POST' && url.pathname === '/api/lan') return handleLanPost(req, res, via);
      if (req.method === 'OPTIONS') {
        if (!cors(req, res, via)) return;
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          // Chrome Private Network Access preflight (hosted page -> 127.0.0.1).
          ...(req.headers['access-control-request-private-network'] ? { 'Access-Control-Allow-Private-Network': 'true' } : {}),
        });
        res.end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
      if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
        if (!cors(req, res, via)) return;
        return handleApi(req, res, url, via);
      }
      if (url.pathname.startsWith('/gfx/')) {
        if (!cors(req, res, via)) return;
        return handleGfx(res, url);
      }
      return handleStatic(res, url);
    } catch (err) {
      log.error('[server] request failed:', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    }
  };
  const http = createHttpServer(onRequest);

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
  });

  const onUpgrade = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const local = isLoopback(req.socket.remoteAddress);
    const allowed = local ? isOriginAllowed(req.headers.origin, extraOrigins) : lanAuthorized(req);
    if (url.pathname !== '/ws' || !allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!local) {
        remoteClients.add(ws);
        ws.on('close', () => remoteClients.delete(ws));
      }
      wss.emit('connection', ws, req);
    });
  };
  http.on('upgrade', onUpgrade);

  const closeServer = (s: Server) => {
    s.close();
    s.closeAllConnections?.();
  };

  /** Mobile mode on/off: extra listeners on the PC's private LAN addresses (same port). */
  const setLan = async (on: boolean): Promise<LanStatus> => {
    lanEnabled = on && lanKey !== null;
    const wanted = new Set(lanEnabled ? (opts.lanAddresses ?? lanAddresses)() : []);
    for (const [ip, s] of lanServers) {
      if (wanted.has(ip)) continue;
      lanServers.delete(ip);
      closeServer(s);
    }
    if (!lanEnabled) for (const ws of remoteClients) ws.terminate();
    for (const ip of wanted) {
      if (lanServers.has(ip)) continue;
      const s = createHttpServer(onRequest);
      s.on('upgrade', onUpgrade);
      try {
        await new Promise<void>((ok, fail) => {
          s.once('error', fail);
          s.listen(port, ip, () => {
            s.off('error', fail);
            ok();
          });
        });
        s.on('error', (err) => log.warn(`[server] mobile mode (${ip}):`, err.message));
        lanServers.set(ip, s);
        log.info(`[server] mobile mode: listening on http://${ip}:${port}`);
      } catch (err) {
        log.warn(`[server] mobile mode: cannot listen on ${ip}:${port}: ${(err as Error).message}`);
      }
    }
    return lanStatus();
  };

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
  port = (http.address() as AddressInfo).port;
  if (opts.lanEnabled) await setLan(true);

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
    lanStatus,
    setLan,
    close: () =>
      new Promise<void>((r) => {
        if (timer) clearTimeout(timer);
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        for (const s of lanServers.values()) closeServer(s);
        lanServers.clear();
        http.close(() => r());
        http.closeAllConnections?.();
      }),
  };
}
