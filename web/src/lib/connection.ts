import { PROJECT, WS_PROTOCOL, type ServerMessage } from '@irtc/protocol';

export type SocketStatus = 'connecting' | 'open' | 'closed';

export interface ConnectionOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStatus?: (status: SocketStatus, info: { attempt: number; nextRetryMs: number | null; error: string | null }) => void;
  /** Injected for tests (Node has a global WebSocket since v22). */
  WebSocketImpl?: typeof WebSocket;
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Close and reconnect if nothing is received for this long. */
  staleAfterMs?: number;
  pingEveryMs?: number;
}

/**
 * WebSocket client with automatic reconnection (exponential backoff + jitter),
 * keep-alive pings and dead-connection detection. Framework agnostic.
 */
export class ConnectionManager {
  status: SocketStatus = 'closed';
  lastMessageAt: number | null = null;
  attempt = 0;
  private ws: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;

  constructor(private readonly opts: ConnectionOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    this.setStatus('closed', null, null);
  }

  private setStatus(status: SocketStatus, nextRetryMs: number | null, error: string | null): void {
    this.status = status;
    this.opts.onStatus?.(status, { attempt: this.attempt, nextRetryMs, error });
  }

  private connect(): void {
    if (this.stopped) return;
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    this.setStatus('connecting', null, null);
    let ws: WebSocket;
    try {
      ws = new Impl(this.opts.url);
    } catch (err) {
      this.scheduleReconnect((err as Error).message);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.setStatus('open', null, null);
      ws.send(JSON.stringify({ type: 'hello', client: 'web', wsProtocol: WS_PROTOCOL }));
      this.startPing();
    };
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return; // invalid data is ignored, never fatal
      }
      if (!msg || typeof msg !== 'object' || msg.v !== WS_PROTOCOL) return;
      this.opts.onMessage(msg);
    };
    ws.onerror = () => {
      /* onclose follows and handles the retry */
    };
    ws.onclose = (ev) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect(ev.code === 1000 ? null : `code ${ev.code}`);
    };
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const every = this.opts.pingEveryMs ?? 10_000;
    const stale = this.opts.staleAfterMs ?? 30_000;
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) return;
      if (this.lastMessageAt && Date.now() - this.lastMessageAt > stale) {
        ws.close(); // dead connection (sleeping laptop, killed server...)
        return;
      }
      ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
    }, every);
  }

  private scheduleReconnect(error: string | null): void {
    if (this.stopped) return;
    this.attempt++;
    const min = this.opts.minDelayMs ?? 500;
    const max = this.opts.maxDelayMs ?? 8000;
    const base = Math.min(max, min * 2 ** Math.min(this.attempt - 1, 10));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.setStatus('closed', delay, error);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
}

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/;

/** True when the page is served by a hosted copy (GitHub Pages) instead of the Companion itself. */
export function isHostedPage(): boolean {
  // Mobile mode serves the page from the PC's LAN address over http: that is the Companion too.
  return location.protocol === 'https:' || location.origin === PROJECT.pagesOrigin;
}

/** True on the PC that runs the Companion (the only place where mobile mode is managed). */
export function isThisPc(): boolean {
  return LOCAL_HOST.test(location.hostname) && !isHostedPage();
}

/**
 * Companion base URL.
 *  - served by the Companion (or the Vite dev proxy): same origin;
 *  - hosted copy (GitHub Pages): the local Companion, http://127.0.0.1:47823;
 *  - ?server=http://127.0.0.1:<port> overrides the port.
 */
export function serverBase(): string {
  const param = new URLSearchParams(location.search).get('server');
  if (param && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(param)) return param.replace(/\/$/, '');
  if (isHostedPage()) return `http://127.0.0.1:${PROJECT.companionPort}`;
  return '';
}

export function wsUrl(base: string): string {
  if (base) return base.replace(/^http/, 'ws') + '/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
