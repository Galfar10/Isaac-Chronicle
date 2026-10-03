/**
 * Simulated game session. Produces exactly the same log.txt lines as the Lua mod
 * ("[INFO] - Lua Debug: IRTC|1|<seq>|<kind>|<json>"), so the whole pipeline
 * (log tail -> decoder -> state -> API/WebSocket -> web) is exercised without Isaac.
 * Item ids are real game ids; stat values are illustrative (this is a simulation).
 */
import type { ModMessageMap, ModMessageKind, PickupEntry, StatsMsg } from '@irtc/protocol';

export type Step = { delay: number; kind: ModMessageKind; data: unknown } | { delay: number; heartbeat: true };

let seq = 0;
export function resetSeq(): void {
  seq = 0;
}

/** Same format as isaac-mod/irtc/emitter.lua (including chunking above 6000 chars). */
export function encodeLines<K extends ModMessageKind>(kind: K, data: ModMessageMap[K] | unknown, maxChunk = 6000): string[] {
  seq++;
  const msg = `${kind}|${JSON.stringify(data)}`;
  const prefix = `[INFO] - Lua Debug: IRTC|1|${seq}|`;
  if (msg.length <= maxChunk) return [prefix + msg];
  const n = Math.ceil(msg.length / maxChunk);
  return Array.from({ length: n }, (_, i) => `${prefix}+${i + 1}/${n}|${msg.slice(i * maxChunk, (i + 1) * maxChunk)}`);
}

const ROOM_CENTER = { x: 320, y: 280 };

function stats(over: Partial<StatsMsg> = {}): StatsMsg {
  return {
    dmg: 3.5,
    fd: 10,
    rng: 260,
    ss: 1,
    spd: 1,
    luck: 0,
    hp: { red: 6, max: 6, soul: 0, black: 0, bone: 0, eternal: 0, golden: 0, rotten: 0, broken: 0, limit: 12 },
    res: { coins: 0, bombs: 1, keys: 0, gkey: false, gbomb: false },
    forms: [],
    ptype: 0,
    ...over,
  };
}

const pedestal = (k: number, id: number, x: number, y: number, extra: Partial<PickupEntry> = {}): PickupEntry => ({
  k,
  v: 100,
  s: id,
  x,
  y,
  p: 0,
  o: 0,
  ...extra,
});

export function scenario(): Step[] {
  const steps: Step[] = [];
  let frame = 0;
  const add = (delay: number, kind: ModMessageKind, data: object) => {
    frame += Math.round((delay / 1000) * 30);
    steps.push({ delay, kind, data: 'f' in data || ['run', 'level', 'room', 'end', 'exit'].includes(kind) ? { ...data, f: frame } : data });
  };
  const move = (from: { x: number; y: number }, to: { x: number; y: number }, n = 6) => {
    for (let i = 1; i <= n; i++) {
      add(200, 'pos', { x: Math.round(from.x + ((to.x - from.x) * i) / n), y: Math.round(from.y + ((to.y - from.y) * i) / n) });
    }
  };
  const mapRooms = (current: number, visited: number[], seen: number[]) => ({
    rooms: [
      ...visited.map((g) => [g, g === 45 ? 4 : g === 32 ? 2 : 1, 1, 1, 1, 1, g === current ? 1 : 0]),
      ...seen.filter((g) => !visited.includes(g)).map((g) => [g, g === 71 ? 5 : 1, g === 70 ? 6 : 1, 0, 0, 1, 0]),
    ],
  });

  add(300, 'hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true, maxc: 732 });
  add(400, 'run', { cont: false, seed: 'MOCK 1234', diff: 0, chal: 0, greed: false, ptype: 0, pname: 'Isaac' });
  add(50, 'level', { stage: 1, stype: 0, abs: 1, name: 'Basement I', curses: 0, alt: false });
  add(50, 'room', { idx: 58, grid: 58, list: 0, type: 1, shape: 1, variant: 0, visits: 1, clear: true });
  add(50, 'map', mapRooms(58, [58], [45, 57, 59, 71]));
  add(50, 'stats', stats());
  add(50, 'inv', { c: [], a: [], t: [], k: [], p: [], names: {} });
  add(50, 'pickups', { items: [], other: {} });
  add(50, 'pos', { x: 320, y: 360 });

  // Treasure room: Brimstone (118)
  add(2500, 'room', { idx: 45, grid: 45, list: 1, type: 4, shape: 1, variant: 1, visits: 1, clear: true });
  add(50, 'map', mapRooms(45, [58, 45], [57, 59, 71, 32]));
  add(50, 'pickups', { items: [pedestal(9001, 118, ROOM_CENTER.x, ROOM_CENTER.y)], other: {} });
  add(50, 'pos', { x: 320, y: 420 });
  move({ x: 320, y: 420 }, { x: 320, y: 300 }, 6);
  add(1500, 'queued', { id: 118, kind: 'c', touched: false });
  add(300, 'pickups', { items: [], other: {} });
  add(900, 'inv', { c: [[118, 1]], a: [], t: [], k: [], p: [], names: {} });
  add(100, 'stats', stats({ fd: 30.03, forms: [] }));

  // Item room with two options: Mom's Knife (114) and Cricket's Head (4)
  add(2500, 'room', { idx: 57, grid: 57, list: 2, type: 1, shape: 1, variant: 22, visits: 1, clear: false });
  add(50, 'map', mapRooms(57, [58, 45, 57], [59, 71, 32, 56]));
  add(50, 'pickups', {
    items: [pedestal(9002, 114, 200, 200, { o: 1 }), pedestal(9003, 4, 440, 200, { o: 1 })],
    other: { '20': 2 },
  });
  add(50, 'pos', { x: 320, y: 420 });
  move({ x: 320, y: 420 }, { x: 230, y: 240 }, 6);
  add(1200, 'pos', { x: 300, y: 230 });
  move({ x: 300, y: 230 }, { x: 420, y: 220 }, 5);
  add(1200, 'pos', { x: 330, y: 230 });
  move({ x: 330, y: 230 }, { x: 210, y: 210 }, 5);
  add(800, 'queued', { id: 114, kind: 'c', touched: false });
  add(300, 'pickups', { items: [], other: { '20': 2 } });
  add(700, 'inv', { c: [[114, 1], [118, 1]], a: [], t: [], k: [], p: [], names: {} });
  add(100, 'stats', stats({ fd: 30.03, res: { coins: 2, bombs: 1, keys: 0 } }));
  add(100, 'clear', { clear: true });

  // Next floor, shop: Magic Mushroom (12) for 15 coins + a card + a trinket
  add(2500, 'level', { stage: 2, stype: 0, abs: 2, name: 'Basement II', curses: 64, alt: false });
  add(50, 'room', { idx: 84, grid: 84, list: 0, type: 1, shape: 1, variant: 0, visits: 1, clear: true });
  add(50, 'map', mapRooms(84, [84], [71, 83, 85, 97]));
  add(50, 'pickups', { items: [], other: {} });
  add(1800, 'room', { idx: 71, grid: 71, list: 3, type: 2, shape: 1, variant: 3, visits: 1, clear: true });
  add(50, 'map', mapRooms(71, [84, 71], [83, 85, 97, 70]));
  add(50, 'pickups', {
    items: [
      pedestal(9004, 12, 240, 240, { p: 15 }),
      { k: 9005, v: 300, s: 1, x: 400, y: 240, p: 5, o: 0 },
      { k: 9006, v: 350, s: 1, x: 320, y: 330, p: 0, o: 0 },
      pedestal(9007, -1, 320, 180, { s: -1 }),
    ],
    other: {},
  });
  add(50, 'pos', { x: 320, y: 420 });
  move({ x: 320, y: 420 }, { x: 320, y: 345 }, 4);
  add(900, 'queued', { id: 1, kind: 't', touched: false });
  add(400, 'pickups', {
    items: [pedestal(9004, 12, 240, 240, { p: 15 }), { k: 9005, v: 300, s: 1, x: 400, y: 240, p: 5, o: 0 }, pedestal(9007, -1, 320, 180, { s: -1 })],
    other: {},
  });
  add(500, 'inv', { c: [[114, 1], [118, 1]], a: [], t: [1], k: [], p: [], names: {} });
  move({ x: 320, y: 345 }, { x: 250, y: 255 }, 4);
  add(1200, 'stats', stats({ fd: 30.03, res: { coins: 17, bombs: 1, keys: 1 } }));
  add(600, 'queued', { id: 12, kind: 'c', touched: false });
  add(300, 'pickups', { items: [{ k: 9005, v: 300, s: 1, x: 400, y: 240, p: 5, o: 0 }, pedestal(9007, -1, 320, 180, { s: -1 })], other: {} });
  add(600, 'inv', { c: [[12, 1], [114, 1], [118, 1]], a: [], t: [1], k: [], p: [], names: {} });
  add(100, 'stats', stats({ dmg: 6.25, fd: 30.03, rng: 290, spd: 1.3, hp: { red: 8, max: 8, limit: 12 }, res: { coins: 2, bombs: 1, keys: 1 }, forms: [] }));

  // A pill (color 3) and a card (The Fool, id 1): unknown until used for the first time.
  const inv = (k: number[], p: [number, number][]) => ({ c: [[12, 1], [114, 1], [118, 1]], a: [], t: [1], k, p, names: {} });
  add(2500, 'room', { idx: 72, grid: 72, list: 4, type: 1, shape: 1, variant: 5, visits: 1, clear: true });
  add(50, 'map', mapRooms(72, [84, 71, 72], [83, 85, 97, 70, 73]));
  add(50, 'pickups', {
    items: [
      { k: 9010, v: 70, s: 3, x: 300, y: 250, p: 0, o: 0 },
      { k: 9011, v: 300, s: 1, x: 380, y: 250, p: 0, o: 0 },
    ],
    other: {},
  });
  add(50, 'pos', { x: 320, y: 420 });
  move({ x: 320, y: 420 }, { x: 300, y: 262 }, 5);
  add(800, 'pickups', { items: [{ k: 9011, v: 300, s: 1, x: 380, y: 250, p: 0, o: 0 }], other: {} });
  add(100, 'inv', inv([], [[3, -1]]));
  move({ x: 300, y: 262 }, { x: 378, y: 262 }, 4);
  add(800, 'pickups', { items: [], other: {} });
  add(100, 'inv', inv([1], [[3, -1]]));
  add(1500, 'use', { t: 'c', id: 1, held: true, flags: 0 });
  add(100, 'inv', inv([], [[3, -1]]));
  add(1500, 'use', { t: 'p', id: 2, color: 3, held: true, flags: 0 });
  add(100, 'inv', inv([], []));

  // Death
  add(5000, 'end', { over: true });
  add(3000, 'exit', { save: false });
  return steps;
}
