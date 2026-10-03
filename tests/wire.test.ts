import { describe, expect, it } from 'vitest';
import { WireDecoder } from '@irtc/protocol';
import { encodeLines, resetSeq } from '../scripts/mockScenario';

describe('wire decoder (log.txt lines from the mod)', () => {
  it('ignores unrelated log lines', () => {
    const d = new WireDecoder();
    expect(d.decodeLine('[INFO] - Lua mem usage: 756 KB')).toBeNull();
    expect(d.decodeLine('')).toBeNull();
  });

  it('decodes a DebugString line as written by Isaac', () => {
    const d = new WireDecoder();
    const r = d.decodeLine('[INFO] - Lua Debug: IRTC|1|7|queued|{"id":118,"kind":"c","touched":false}\r');
    expect(r).toEqual({ ok: true, message: { kind: 'queued', seq: 7, data: { id: 118, kind: 'c', touched: false } } });
  });

  it('keeps "|" characters inside the JSON payload', () => {
    const d = new WireDecoder();
    const r = d.decodeLine('IRTC|1|1|err|{"where":"a|b","msg":"x|y"}');
    expect(r && r.ok && r.message.data).toEqual({ where: 'a|b', msg: 'x|y' });
  });

  it('reassembles chunked messages', () => {
    resetSeq();
    const big = { c: Array.from({ length: 900 }, (_, i) => [i + 1, 1]), a: [], t: [], k: [], p: [] };
    const lines = encodeLines('inv', big, 1000);
    expect(lines.length).toBeGreaterThan(3);
    const d = new WireDecoder();
    const results = lines.map((l) => d.decodeLine(l));
    expect(results.slice(0, -1).every((r) => r === null)).toBe(true);
    const last = results.at(-1);
    expect(last && last.ok && last.message.kind).toBe('inv');
    expect(last && last.ok && (last.message.data as unknown as typeof big).c.length).toBe(900);
  });

  it('rejects invalid JSON, unknown kinds and malformed payloads without throwing', () => {
    const d = new WireDecoder();
    expect(d.decodeLine('IRTC|1|1|stats|{bad json')).toMatchObject({ ok: false, reason: 'invalid JSON' });
    expect(d.decodeLine('IRTC|1|2|nope|{}')).toMatchObject({ ok: false });
    expect(d.decodeLine('IRTC|1|3|pos|{"x":"a","y":1}')).toMatchObject({ ok: false });
    expect(d.decodeLine('IRTC|1|4')).toMatchObject({ ok: false, reason: 'truncated line' });
  });

  it('flags an incompatible wire protocol', () => {
    const d = new WireDecoder();
    expect(d.decodeLine('IRTC|9|1|hb|{"paused":false}')).toMatchObject({ ok: false });
    expect(d.protocolMismatch).toBe(9);
  });
});
