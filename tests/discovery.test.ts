import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ITEM_CONCEAL_DISTANCE,
  ITEM_REVEAL_DISTANCE,
  TILE_SIZE,
  type DomainEvent,
  type GameState,
  type ModMessage,
  type ModMessageKind,
  type ModMessageMap,
  type PickupEntry,
  type ServerMessage,
} from '@irtc/protocol';
import { GameStateStore, type StoreOptions } from '../bridge/src/store';
import { startCompanion } from '../companion/src/companion';
import type { CompanionConfig } from '../companion/src/config';
import { encodeLines, resetSeq } from '../scripts/mockScenario';

let seq = 0;
const m = <K extends ModMessageKind>(kind: K, data: ModMessageMap[K]) => ({ kind, seq: ++seq, data }) as ModMessage;
const T = TILE_SIZE;
const ITEM = { x: 320, y: 280 };
/** Player position at `tiles` tiles below the item. */
const at = (tiles: number) => ({ x: ITEM.x, y: ITEM.y + tiles * T });
const pedestal = (k: number, id: number, x = ITEM.x, y = ITEM.y, extra: Partial<PickupEntry> = {}): PickupEntry => ({ k, v: 100, s: id, x, y, p: 0, o: 0, q: 4, ...extra });
const pill = (k: number, color: number, extra: Partial<PickupEntry> = {}): PickupEntry => ({ k, v: 70, s: color, x: ITEM.x, y: ITEM.y, p: 0, o: 0, ...extra });
const card = (k: number, id: number): PickupEntry => ({ k, v: 300, s: id, x: ITEM.x, y: ITEM.y, p: 0, o: 0 });
const inv = (k: number[] = [], p: [number, number][] = []) => ({ c: [], a: [], t: [], k, p });

const IDENTITY_KEYS = new Set(['id', 'itemId', 'pillEffect', 'subType', 'trueSub', 'fx', 's']);
/** Walks a payload and lists every identity-like field equal to `value` (and any "quality" field). */
function leaks(payload: unknown, value: number): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if ((IDENTITY_KEYS.has(k) && x === value) || k === 'quality') found.push(`${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
    }
  };
  walk(payload, '$');
  return found;
}

function newStore(opts: StoreOptions = {}) {
  const s = new GameStateStore(opts);
  s.apply(m('hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true }));
  s.apply(m('run', { cont: false, seed: 'SEED', ptype: 0, f: 0 }));
  s.apply(m('room', { idx: 10, list: 1, type: 4, shape: 1, visits: 1, clear: true, f: 10 }));
  return s;
}

describe('pedestals: revealed only by proximity', () => {
  it('far item is detected but NOT identified, and item_spawned leaks nothing', () => {
    const s = newStore();
    s.apply(m('pos', at(6)));
    const ev = s.apply(m('pickups', { items: [pedestal(1, 118)], other: {} }));
    const spawn = ev.find((e) => e.event === 'item_spawned')!;
    expect(spawn.event === 'item_spawned' && spawn.data).toMatchObject({ key: 1, kind: 'collectible', id: null, revealed: false, unknown: 'far' });
    // No identity anywhere in what clients receive.
    expect(leaks(ev, 118)).toEqual([]);
    expect(leaks(s.state, 118)).toEqual([]);
    expect(s.state.history.some((h) => h.type === 'item_found')).toBe(false);
  });

  it('close item is revealed with full identity', () => {
    const s = newStore();
    s.apply(m('pos', at(6)));
    s.apply(m('pickups', { items: [pedestal(1, 118)], other: {} }));
    const ev = s.apply(m('pos', at(ITEM_REVEAL_DISTANCE - 0.2)));
    expect(ev).toContainEqual({ event: 'item_revealed', data: expect.objectContaining({ key: 1, id: 118, quality: 4, revealed: true, unknown: null }) });
    expect(s.state.roomItems[0]).toMatchObject({ id: 118, quality: 4 });
    expect(s.state.history.filter((h) => h.type === 'item_found').map((h) => h.itemId)).toEqual([118]);
  });

  it('the boundary is distance <= revealDistance and is configurable', () => {
    const s = newStore({ revealDistance: 1, concealDistance: 1.5 });
    s.apply(m('pos', at(1.2)));
    s.apply(m('pickups', { items: [pedestal(1, 118)], other: {} }));
    expect(s.state.roomItems[0].id).toBeNull();
    s.apply(m('pos', at(1)));
    expect(s.state.roomItems[0].id).toBe(118);
  });

  it('walking away: stays identified inside the hysteresis band, hides again beyond it', () => {
    const s = newStore();
    s.apply(m('pos', at(1)));
    s.apply(m('pickups', { items: [pedestal(1, 118)], other: {} }));
    expect(s.state.roomItems[0].id).toBe(118);
    const middle = (ITEM_REVEAL_DISTANCE + ITEM_CONCEAL_DISTANCE) / 2;
    expect(s.apply(m('pos', at(middle))).some((e) => e.event === 'item_concealed')).toBe(false);
    expect(s.state.roomItems[0].id).toBe(118);
    const ev = s.apply(m('pos', at(ITEM_CONCEAL_DISTANCE + 1)));
    expect(ev).toContainEqual({ event: 'item_concealed', data: { key: 1, kind: 'collectible' } });
    expect(s.state.roomItems[0]).toMatchObject({ id: null, unknown: 'far' });
    expect(s.state.roomItems[0].quality).toBeUndefined();
  });

  it('two items in the room: only the one within reach is identified', () => {
    const s = newStore();
    s.apply(m('pos', { x: 100, y: 200 }));
    s.apply(m('pickups', { items: [pedestal(1, 118, 120, 200), pedestal(2, 114, 520, 200)], other: {} }));
    const byKey = Object.fromEntries(s.state.roomItems.map((i) => [i.key, i]));
    expect(byKey[1]).toMatchObject({ id: 118, unknown: null });
    expect(byKey[2]).toMatchObject({ id: null, unknown: 'far' });
    expect(leaks(s.state.roomItems[1], 114)).toEqual([]);
  });

  it('no stale position from the previous room can reveal items', () => {
    const s = newStore();
    s.apply(m('pos', ITEM)); // standing exactly where the next room's item will be
    s.apply(m('room', { idx: 11, list: 2, type: 1, shape: 1, visits: 1, clear: true, f: 20 }));
    const ev = s.apply(m('pickups', { items: [pedestal(5, 118)], other: {} }));
    expect(ev.some((e) => e.event === 'item_revealed')).toBe(false);
    expect(s.state.roomItems[0].id).toBeNull();
  });

  it('Curse of the Blind stays hidden even when standing on it', () => {
    const s = newStore();
    s.apply(m('pos', ITEM));
    s.apply(m('pickups', { items: [pedestal(1, -1)], other: {} }));
    expect(s.state.roomItems[0]).toMatchObject({ id: null, unknown: 'blind', revealed: true });
  });
});

describe('pills: unknown on the floor, revealed when picked up', () => {
  it('pill on the floor stays unknown, even standing on it and even if the game knows its effect', () => {
    const s = newStore({ discoveries: { pills: [14], cards: [] } });
    s.apply(m('pos', ITEM));
    s.apply(m('pickups', { items: [pill(1, 3, { fx: 14 })], other: {} }));
    expect(s.state.roomItems[0]).toMatchObject({ kind: 'pill', id: null, unknown: 'not_picked', pillColor: 3, pillEffect: null });
    expect(leaks(s.state, 14).filter((p) => !p.startsWith('$.discoveries'))).toEqual([]);
  });

  it('picking up an unknown pill does NOT reveal it (like the game)', () => {
    const saved: unknown[] = [];
    const s = newStore({ onDiscovery: (...a) => saved.push(a) });
    s.apply(m('inv', inv([], [])));
    const ev = s.apply(m('inv', inv([], [[3, -1]])));
    expect(s.state.inventory.pills).toEqual([{ color: 3, effect: null }]);
    expect(ev.some((e) => e.event === 'discovery' || e.event === 'item_picked')).toBe(false);
    expect(saved).toEqual([]);
  });

  it('taking it reveals it, shows it on the central card and persists the discovery', () => {
    const saved: [string, number][] = [];
    const s = newStore({ onDiscovery: (kind, id) => saved.push([kind, id]) });
    s.apply(m('inv', inv([], [[3, -1], [3, -1], [5, -1]])));
    const ev = s.apply(m('use', { t: 'p', id: 14, color: 3, held: true, flags: 0 }));
    expect(ev).toContainEqual({ event: 'discovery', data: { kind: 'pill', id: 14, first: true } });
    expect(saved).toEqual([['pill', 14]]);
    expect(s.state.lastPicked).toMatchObject({ id: 14, kind: 'pill', how: 'used' });
    expect(s.state.history.at(-1)).toMatchObject({ type: 'discovered', itemKind: 'pill', itemId: 14 });
    // The other pill of the same color is now known this run; a different color is not.
    expect(s.state.inventory.pills).toEqual([
      { color: 3, effect: 14 },
      { color: 3, effect: 14 },
      { color: 5, effect: null },
    ]);
  });

  it('a color the game has already identified (e.g. PHD) is shown, without counting as a discovery', () => {
    const saved: unknown[] = [];
    const s = newStore({ onDiscovery: (...a) => saved.push(a) });
    s.apply(m('inv', inv([], [[9, 14]])));
    expect(s.state.inventory.pills).toEqual([{ color: 9, effect: 14 }]);
    expect(saved).toEqual([]);
  });

  it('an effect discovered in a previous run is unknown again in a new run until taken (colors reshuffle)', () => {
    const s = newStore({ discoveries: { pills: [14], cards: [] } });
    s.apply(m('inv', inv([], [[9, -1]])));
    expect(s.state.inventory.pills).toEqual([{ color: 9, effect: null }]);
    const ev = s.apply(m('use', { t: 'p', id: 14, color: 9, held: true, flags: 0 }));
    expect(ev).toContainEqual({ event: 'discovery', data: { kind: 'pill', id: 14, first: false } });
    expect(s.state.lastPicked).toMatchObject({ id: 14, kind: 'pill', how: 'used' });
  });

  it('effects triggered by other items are not evidence', () => {
    const s = newStore();
    s.apply(m('inv', inv([], [[3, -1]])));
    s.apply(m('use', { t: 'p', id: 20, color: 0, held: false, flags: 0 }));
    expect(s.state.discoveries.pills).toEqual([]);
    expect(s.state.inventory.pills).toEqual([{ color: 3, effect: null }]);
  });
});

describe('cards: unknown on the floor, revealed when picked up', () => {
  it('card on the floor stays unknown even when close and even if discovered before', () => {
    const s = newStore({ discoveries: { pills: [], cards: [1] } });
    s.apply(m('pos', at(6)));
    s.apply(m('pickups', { items: [card(1, 1)], other: {} }));
    expect(s.state.roomItems[0]).toMatchObject({ kind: 'card', id: null, unknown: 'far' });
    s.apply(m('pos', ITEM));
    expect(s.state.roomItems[0]).toMatchObject({ kind: 'card', id: null, unknown: 'not_picked' });
    expect(leaks(s.state.roomItems, 1)).toEqual([]);
  });

  it('picking it up reveals it and records the discovery', () => {
    const saved: [string, number][] = [];
    const s = newStore({ onDiscovery: (kind, id) => saved.push([kind, id]) });
    s.apply(m('pos', ITEM));
    s.apply(m('pickups', { items: [card(1, 1)], other: {} }));
    s.apply(m('pickups', { items: [], other: {} }));
    const ev = s.apply(m('inv', inv([1])));
    expect(s.state.inventory.cards).toEqual([{ id: 1 }]);
    expect(ev).toContainEqual({ event: 'discovery', data: { kind: 'card', id: 1, first: true } });
    expect(saved).toEqual([['card', 1]]);
  });

  it('a card discovered before is shown on pickup without a new discovery', () => {
    const saved: unknown[] = [];
    const s = newStore({ discoveries: { pills: [], cards: [1] }, onDiscovery: (...a) => saved.push(a) });
    s.apply(m('inv', inv([1])));
    expect(s.state.inventory.cards).toEqual([{ id: 1 }]);
    expect(saved).toEqual([]);
  });
});

describe('picked cards/pills become the "obtained" item (central card)', () => {
  it('a picked card and a picked pill are announced as obtained, with identity', () => {
    const s = newStore();
    s.apply(m('inv', inv([], [])));
    const ev = s.apply(m('inv', inv([16], [])));
    expect(ev).toContainEqual({ event: 'item_picked', data: { id: 16, kind: 'card' } });
    expect(s.state.lastPicked).toMatchObject({ id: 16, kind: 'card' });
    const ev2 = s.apply(m('inv', inv([16], [[4, 2]])));
    expect(ev2).toContainEqual({ event: 'item_picked', data: { id: 2, kind: 'pill' } });
    expect(s.state.lastPicked).toMatchObject({ id: 2, kind: 'pill' });
  });

  it('using or dropping is not a pickup; a second copy is', () => {
    const s = newStore({ discoveries: { pills: [], cards: [16] } });
    s.apply(m('inv', inv([16])));
    expect(s.state.lastPicked).toBeNull(); // first snapshot of the run is not a pickup
    expect(s.apply(m('inv', inv([]))).some((e) => e.event === 'item_picked')).toBe(false);
    const ev = s.apply(m('inv', inv([16])));
    expect(ev).toContainEqual({ event: 'item_picked', data: { id: 16, kind: 'card' } });
    expect(s.state.history.at(-1)).toMatchObject({ type: 'item_picked', itemKind: 'card', itemId: 16 });
  });
});

describe('a card/pill the player dropped stays identified on the floor', () => {
  function holding(k: number[], p: [number, number][] = [], now = { t: 1000 }) {
    const s = newStore({ now: () => now.t });
    s.apply(m('pos', ITEM));
    s.apply(m('inv', inv(k, p)));
    return s;
  }

  it('dropped card (inventory first, then the floor entity) is shown', () => {
    const s = holding([16]);
    s.apply(m('inv', inv([])));
    const ev = s.apply(m('pickups', { items: [card(50, 16)], other: {} }));
    expect(s.state.roomItems[0]).toMatchObject({ key: 50, kind: 'card', id: 16, unknown: null });
    expect(ev.find((e) => e.event === 'item_spawned')).toMatchObject({ data: { id: 16 } });
  });

  it('dropped card (floor entity first, then the inventory) is shown', () => {
    const s = holding([16]);
    s.apply(m('pickups', { items: [card(50, 16)], other: {} }));
    expect(s.state.roomItems[0].id).toBeNull();
    const ev = s.apply(m('inv', inv([])));
    expect(ev).toContainEqual({ event: 'item_revealed', data: expect.objectContaining({ key: 50, id: 16 }) });
    expect(s.state.roomItems[0].id).toBe(16);
  });

  it('dropped pill shows its effect (even far away, it is yours)', () => {
    const s = holding([], [[3, 14]]);
    s.apply(m('inv', inv([], [])));
    s.apply(m('pos', at(8)));
    s.apply(m('pickups', { items: [pill(60, 3)], other: {} }));
    expect(s.state.roomItems[0]).toMatchObject({ kind: 'pill', id: 14, pillEffect: 14, unknown: null });
  });

  it('using a card is not dropping it; another copy on the floor stays unknown', () => {
    const s = holding([16]);
    s.apply(m('use', { t: 'c', id: 16, held: true, flags: 4 }));
    s.apply(m('inv', inv([])));
    s.apply(m('pickups', { items: [card(70, 16)], other: {} }));
    expect(s.state.roomItems[0]).toMatchObject({ id: null, unknown: 'not_picked' });
  });

  it('a floor card appearing long after a drop is not linked', () => {
    const now = { t: 1000 };
    const s = holding([16], [], now);
    s.apply(m('inv', inv([])));
    now.t += 10_000;
    s.apply(m('pickups', { items: [card(80, 16)], other: {} }));
    expect(s.state.roomItems[0].id).toBeNull();
  });

  it('it stays identified when coming back to the room', () => {
    const s = holding([16]);
    s.apply(m('inv', inv([])));
    s.apply(m('pickups', { items: [card(50, 16)], other: {} }));
    s.apply(m('room', { idx: 11, list: 2, type: 1, shape: 1, visits: 1, clear: true, f: 20 }));
    s.apply(m('room', { idx: 10, list: 1, type: 4, shape: 1, visits: 2, clear: true, f: 40 }));
    s.apply(m('pickups', { items: [card(50, 16)], other: {} }));
    expect(s.state.roomItems[0].id).toBe(16);
  });
});

describe('discoveries persist', () => {
  const quiet = { info() {}, warn() {}, error() {} };
  function config(dir: string, logPath: string): CompanionConfig {
    const root = join(__dirname, '..');
    return {
      port: 0,
      host: '127.0.0.1',
      logPath,
      gameDir: join(dir, 'no-game'),
      dataDir: join(dir, 'data'),
      webDir: null,
      migrationsDir: join(root, 'database', 'migrations'),
      seedDir: join(dir, 'no-seed'),
      allowedOrigins: [],
      openBrowser: false,
      processCheck: false,
      updateData: false,
    };
  }
  const write = (logPath: string, kind: ModMessageKind, data: unknown) => {
    for (const l of encodeLines(kind, data)) appendFileSync(logPath, l + '\n');
  };
  const welcome = (url: string) =>
    new Promise<GameState>((resolve, reject) => {
      const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
      const t = setTimeout(() => reject(new Error('no welcome')), 3000);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        if (msg.type === 'welcome') {
          clearTimeout(t);
          ws.close();
          resolve(msg.state);
        }
      };
    });
  const waitFor = async (cond: () => boolean) => {
    const end = Date.now() + 4000;
    while (!cond()) {
      if (Date.now() > end) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 30));
    }
  };

  it('survive closing the web, restarting the Companion and starting a new run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-disc-'));
    const logPath = join(dir, 'log.txt');
    writeFileSync(logPath, '');
    resetSeq();

    let companion = await startCompanion(config(dir, logPath), quiet);
    write(logPath, 'hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true });
    write(logPath, 'run', { cont: false, seed: 'AAAA', ptype: 0, f: 0 });
    write(logPath, 'inv', inv([1], [[3, -1]])); // picked up The Fool and an unknown pill
    write(logPath, 'use', { t: 'p', id: 14, color: 3, held: true, flags: 0 }); // took the pill (effect 14)
    await waitFor(() => companion.bridge.state.discoveries.cards.length === 1 && companion.bridge.state.discoveries.pills.length === 1);

    // Web closed and reopened: a fresh client gets the discoveries in its first snapshot.
    expect((await welcome(companion.server.url)).discoveries).toEqual({ pills: [14], cards: [1] });
    expect((await welcome(companion.server.url)).discoveries).toEqual({ pills: [14], cards: [1] });
    await companion.stop();

    // Isaac restarted (new log) + Companion restarted + new run.
    writeFileSync(logPath, '');
    resetSeq();
    companion = await startCompanion(config(dir, logPath), quiet);
    try {
      expect(companion.bridge.state.discoveries).toEqual({ pills: [14], cards: [1] });
      write(logPath, 'hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true });
      write(logPath, 'run', { cont: false, seed: 'BBBB', ptype: 0, f: 0 });
      write(logPath, 'inv', inv([1]));
      await waitFor(() => companion.bridge.state.inventory.cards.length === 1);
      expect(companion.bridge.state.inventory.cards).toEqual([{ id: 1 }]);
      const api = await (await fetch(companion.server.url + '/api/discoveries')).json();
      expect(api).toEqual({ pills: [14], cards: [1] });
      expect(companion.repo.listDiscoveries()).toEqual([
        expect.objectContaining({ kind: 'card', id: 1, discovered: true }),
        expect.objectContaining({ kind: 'pill', id: 14, discovered: true }),
      ]);
    } finally {
      await companion.stop();
    }
  });
});

describe('no leaks through the WebSocket', () => {
  it('a far item never appears in any message sent to clients', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-leak-'));
    const logPath = join(dir, 'log.txt');
    writeFileSync(logPath, '');
    resetSeq();
    const root = join(__dirname, '..');
    const companion = await startCompanion(
      {
        port: 0, host: '127.0.0.1', logPath, gameDir: join(dir, 'x'), dataDir: join(dir, 'data'), webDir: null,
        migrationsDir: join(root, 'database', 'migrations'), seedDir: join(dir, 'no-seed'), allowedOrigins: [],
        openBrowser: false, processCheck: false, updateData: false,
      },
      { info() {}, warn() {}, error() {} },
    );
    try {
      const raw: string[] = [];
      const ws = new WebSocket(companion.server.url.replace('http', 'ws') + '/ws');
      ws.onmessage = (ev) => raw.push(String(ev.data));
      await new Promise((r) => (ws.onopen = r));
      const lines = [
        ...encodeLines('hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true }),
        ...encodeLines('run', { cont: false, seed: 'LEAK', ptype: 0, f: 0 }),
        ...encodeLines('room', { idx: 3, list: 3, type: 4, shape: 1, visits: 1, clear: true, f: 5 }),
        ...encodeLines('pos', { x: 320, y: 600 }),
        ...encodeLines('pickups', { items: [pedestal(42, 331, 320, 200, { q: 4 })], other: {} }),
      ];
      for (const l of lines) appendFileSync(logPath, l + '\n');
      const end = Date.now() + 3000;
      while (Date.now() < end && !raw.some((r) => r.includes('item_spawned'))) await new Promise((r) => setTimeout(r, 30));
      ws.close();
      const messages = raw.map((r) => JSON.parse(r));
      expect(raw.join('\n')).toContain('item_spawned');
      expect(leaks(messages, 331)).toEqual([]); // Godhead's id never left the server
      const events = messages.flatMap((r: { events?: DomainEvent[] }) => r.events ?? []);
      expect(events.filter((e) => e.event === 'item_revealed')).toEqual([]);
      const rest = await (await fetch(companion.server.url + '/api/state')).json();
      expect(leaks(rest, 331)).toEqual([]);
    } finally {
      await companion.stop();
    }
  });
});
