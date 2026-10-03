import { MOD_MESSAGE_KINDS, WIRE_PROTOCOL, type ModMessage, type ModMessageKind } from './modMessages.js';

const MARKER = 'IRTC|';
const MAX_PENDING_CHUNKS = 32;

export type DecodeResult =
  | { ok: true; message: ModMessage }
  | { ok: false; reason: string; line: string }
  | null; // line is not ours, or an incomplete chunk

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Minimal structural validation: rejects malformed data instead of corrupting state. */
export function validateModPayload(kind: ModMessageKind, d: unknown): string | null {
  if (!isObj(d)) return 'payload is not an object';
  switch (kind) {
    case 'hello':
      return typeof d.mod === 'string' && isNum(d.proto) ? null : 'hello: missing mod/proto';
    case 'run':
    case 'level':
    case 'room':
    case 'end':
    case 'exit':
      return isNum(d.f) ? null : `${kind}: missing frame`;
    case 'map':
      return Array.isArray(d.rooms) && d.rooms.every((r) => Array.isArray(r) && r.length >= 7 && r.every(isNum))
        ? null
        : 'map: invalid rooms';
    case 'pickups':
      return Array.isArray(d.items) &&
        d.items.every((i) => isObj(i) && isNum(i.k) && isNum(i.v) && isNum(i.s) && isNum(i.x) && isNum(i.y))
        ? null
        : 'pickups: invalid items';
    case 'pos':
      return isNum(d.x) && isNum(d.y) ? null : 'pos: invalid coordinates';
    case 'stats':
      return isNum(d.dmg) && isNum(d.fd) && isObj(d.hp) && isObj(d.res) ? null : 'stats: invalid';
    case 'inv':
      return Array.isArray(d.c) && Array.isArray(d.a) && Array.isArray(d.t) ? null : 'inv: invalid';
    case 'queued':
      return isNum(d.id) && (d.kind === 'c' || d.kind === 't') ? null : 'queued: invalid';
    case 'hb':
      return typeof d.paused === 'boolean' ? null : 'hb: invalid';
    case 'clear':
      return typeof d.clear === 'boolean' ? null : 'clear: invalid';
    case 'use':
      return (d.t === 'p' || d.t === 'c') && isNum(d.id) && typeof d.held === 'boolean' ? null : 'use: invalid';
    case 'err':
      return typeof d.msg === 'string' ? null : 'err: invalid';
  }
  return 'unknown kind';
}

function parseBody(seq: number, body: string, line: string): DecodeResult {
  const sep = body.indexOf('|');
  if (sep < 0) return { ok: false, reason: 'missing kind separator', line };
  const kind = body.slice(0, sep) as ModMessageKind;
  if (!MOD_MESSAGE_KINDS.includes(kind)) return { ok: false, reason: `unknown kind "${kind}"`, line };
  let data: unknown;
  try {
    data = JSON.parse(body.slice(sep + 1));
  } catch {
    return { ok: false, reason: 'invalid JSON', line };
  }
  const err = validateModPayload(kind, data);
  if (err) return { ok: false, reason: err, line };
  return { ok: true, message: { kind, seq, data } as ModMessage };
}

/**
 * Decodes log.txt lines produced by the mod. Stateful because long messages are chunked.
 * Unrelated log lines return null.
 */
export class WireDecoder {
  private pending = new Map<number, { total: number; parts: string[]; received: number }>();
  public protocolMismatch: number | null = null;

  decodeLine(rawLine: string): DecodeResult {
    const at = rawLine.indexOf(MARKER);
    if (at < 0) return null;
    const line = rawLine.slice(at).replace(/\r$/, '');
    // IRTC|<proto>|<seq>|<kind or +i/n>|<rest>
    const parts = line.split('|');
    if (parts.length < 5) return { ok: false, reason: 'truncated line', line };
    const proto = Number(parts[1]);
    const seq = Number(parts[2]);
    if (!Number.isInteger(proto) || !Number.isInteger(seq)) return { ok: false, reason: 'bad header', line };
    if (proto !== WIRE_PROTOCOL) {
      this.protocolMismatch = proto;
      return { ok: false, reason: `unsupported wire protocol ${proto}`, line };
    }
    const headerLen = parts[0].length + parts[1].length + parts[2].length + 3;
    const rest = line.slice(headerLen);
    if (rest.startsWith('+')) return this.addChunk(seq, rest, line);
    return parseBody(seq, rest, line);
  }

  private addChunk(seq: number, rest: string, line: string): DecodeResult {
    const m = /^\+(\d+)\/(\d+)\|/.exec(rest);
    if (!m) return { ok: false, reason: 'bad chunk header', line };
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (index < 1 || index > total || total > 1000) return { ok: false, reason: 'bad chunk index', line };
    let entry = this.pending.get(seq);
    if (!entry || entry.total !== total) {
      entry = { total, parts: new Array(total).fill(undefined), received: 0 };
      this.pending.set(seq, entry);
      if (this.pending.size > MAX_PENDING_CHUNKS) {
        const oldest = this.pending.keys().next().value as number;
        this.pending.delete(oldest);
      }
    }
    if (entry.parts[index - 1] === undefined) entry.received++;
    entry.parts[index - 1] = rest.slice(m[0].length);
    if (entry.received < total) return null;
    this.pending.delete(seq);
    return parseBody(seq, entry.parts.join(''), line);
  }

  reset(): void {
    this.pending.clear();
    this.protocolMismatch = null;
  }
}
