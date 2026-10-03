import { describe, expect, it } from 'vitest';
import type { DomainEvent, ModMessage, ModMessageKind, ModMessageMap } from '@irtc/protocol';
import { GameStateStore, toStats } from '../bridge/src/store';

let seq = 0;
const m = <K extends ModMessageKind>(kind: K, data: ModMessageMap[K]) => ({ kind, seq: ++seq, data }) as ModMessage;
const names = (events: DomainEvent[]) => events.map((e) => e.event);

const baseStats = {
  dmg: 3.5,
  fd: 10,
  rng: 260,
  ss: 1,
  spd: 1,
  luck: 0,
  hp: { red: 6, max: 6, soul: 2, black: 1 },
  res: { coins: 3, bombs: 1, keys: 0 },
  forms: [],
};

function startedStore(now = { t: 1000 }) {
  const s = new GameStateStore({ now: () => now.t });
  s.apply(m('hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true }));
  s.apply(m('run', { cont: false, seed: 'ABCD 1234', diff: 0, chal: 0, greed: false, ptype: 0, pname: 'Isaac', f: 0 }));
  s.apply(m('level', { stage: 1, stype: 0, name: 'Basement I', curses: 0, f: 30 }));
  s.apply(m('room', { idx: 58, grid: 58, list: 0, type: 1, shape: 1, visits: 1, clear: true, f: 30 }));
  return s;
}

describe('GameStateStore', () => {
  it('converts raw stats like the HUD does', () => {
    const st = toStats({ ...baseStats, fd: 10, rng: 260 });
    expect(st.tears).toBeCloseTo(2.73, 2);
    expect(st.range).toBe(6.5);
    expect(st.damage).toBe(3.5);
  });

  it('starts a run and records history', () => {
    const s = startedStore();
    expect(s.state.connection.game).toBe('connected');
    expect(s.state.connection.modVersion).toBe('0.1.0');
    expect(s.state.run?.seed).toBe('ABCD 1234');
    expect(s.state.run?.character).toEqual({ type: 0, name: 'Isaac', tainted: false });
    expect(s.state.run?.floor?.name).toBe('Basement I');
    expect(s.state.history.map((h) => h.type)).toEqual(['run_started', 'floor_changed', 'room_changed']);
  });

  it('detects items before pickup and tracks the nearest one', () => {
    const s = startedStore();
    s.apply(m('pos', { x: 320, y: 400 }));
    const ev = s.apply(
      m('pickups', {
        items: [
          { k: 1, v: 100, s: 118, x: 320, y: 300, p: 0, o: 0, q: 4 },
          { k: 2, v: 100, s: 114, x: 320, y: 100, p: 0, o: 0, q: 4 },
        ],
        other: {},
      }),
    );
    expect(names(ev)).toEqual(['item_spawned', 'item_spawned', 'nearest_changed']);
    // Both are farther than ITEM_REVEAL_DISTANCE: detected, but not identified.
    expect(s.state.roomItems.map((i) => [i.id, i.distance, i.unknown])).toEqual([
      [null, 2.5, 'far'],
      [null, 7.5, 'far'],
    ]);
    expect(s.state.nearestKey).toBe(1);
    expect(s.state.history.filter((h) => h.type === 'item_found')).toEqual([]);

    // Player walks to Mom's Knife: the popup switches and only that one is identified.
    const ev2 = s.apply(m('pos', { x: 320, y: 130 }));
    expect(ev2).toContainEqual({ event: 'nearest_changed', data: { key: 2, id: 114, kind: 'collectible', distance: 0.8 } });
    expect(s.state.history.filter((h) => h.type === 'item_found').map((h) => h.itemId)).toEqual([114]);
    // Same list again: no new events (no duplicate data).
    const ev3 = s.apply(
      m('pickups', {
        items: [
          { k: 1, v: 100, s: 118, x: 320, y: 300, p: 0, o: 0, q: 4 },
          { k: 2, v: 100, s: 114, x: 320, y: 100, p: 0, o: 0, q: 4 },
        ],
        other: {},
      }),
    );
    expect(names(ev3).filter((n) => n !== 'connection_changed')).toEqual([]);
  });

  it('handles pickup: removes from room, adds to inventory and history', () => {
    const s = startedStore();
    s.apply(m('pos', { x: 320, y: 400 }));
    s.apply(m('pickups', { items: [{ k: 1, v: 100, s: 118, x: 320, y: 300, p: 0, o: 0 }], other: {} }));
    const ev = s.apply(m('queued', { id: 118, kind: 'c', touched: false }));
    expect(names(ev)).toEqual(['item_removed', 'item_picked', 'nearest_changed']);
    expect(s.state.roomItems).toEqual([]);
    expect(s.state.lastPicked).toMatchObject({ id: 118, kind: 'collectible' });
    const ev2 = s.apply(m('inv', { c: [[118, 1]], a: [], t: [], k: [], p: [] }));
    expect(ev2).toContainEqual({ event: 'inventory_changed', data: { added: [118], removed: [] } });
    expect(s.state.inventory.collectibles).toEqual([{ id: 118, count: 1, order: 1 }]);
    expect(s.state.history.at(-1)).toMatchObject({ type: 'item_picked', itemId: 118, floor: 'Basement I' });
  });

  it('clears room items on room change', () => {
    const s = startedStore();
    s.apply(m('pickups', { items: [{ k: 1, v: 350, s: 5, x: 1, y: 1, p: 0, o: 0 }], other: {} }));
    const ev = s.apply(m('room', { idx: 45, grid: 45, list: 1, type: 4, shape: 1, visits: 1, clear: true, f: 90 }));
    expect(names(ev)).toContain('room_changed');
    expect(names(ev)).toContain('item_removed');
    expect(s.state.roomItems).toEqual([]);
    expect(s.state.room?.type).toBe(4);
  });

  it('hides blind items and keeps their identity secret', () => {
    const s = startedStore();
    s.apply(m('pickups', { items: [{ k: 1, v: 100, s: -1, x: 1, y: 1, p: 0, o: 0 }], other: {} }));
    expect(s.state.roomItems[0].id).toBeNull();
    expect(s.state.history.some((h) => h.type === 'item_found')).toBe(false);
  });

  it('emits stat deltas only for real changes', () => {
    const s = startedStore();
    const first = s.apply(m('stats', baseStats));
    expect(first.find((e) => e.event === 'stats_changed')).toBeTruthy();
    const same = s.apply(m('stats', baseStats));
    expect(same.find((e) => e.event === 'stats_changed')).toBeUndefined();
    const up = s.apply(m('stats', { ...baseStats, dmg: 5.19 }));
    const e = up.find((x) => x.event === 'stats_changed');
    expect(e && e.event === 'stats_changed' && e.data.deltas).toEqual({ damage: 1.69 });
    expect(s.state.player?.health).toMatchObject({ red: 6, max: 6, soul: 2, black: 1 });
  });

  it('marks run end and exit', () => {
    const s = startedStore();
    expect(names(s.apply(m('end', { over: true, f: 900 })))).toContain('run_ended');
    expect(s.state.run?.status).toBe('dead');
    expect(s.state.run?.time).toBe(30);
    s.apply(m('exit', { save: false, f: 950 }));
    expect(s.state.run?.status).toBe('dead');
  });

  it('keeps state on a mid-run resync of the same run', () => {
    const s = startedStore();
    s.apply(m('inv', { c: [[118, 1]], a: [], t: [], k: [], p: [] }));
    const id = s.state.run?.id;
    s.apply(m('run', { cont: true, resync: true, seed: 'ABCD 1234', ptype: 0, f: 400 }));
    expect(s.state.run?.id).toBe(id);
    expect(s.state.inventory.collectibles).toHaveLength(1);
  });

  it('reports heartbeat loss', () => {
    const now = { t: 1000 };
    const s = startedStore(now);
    now.t += 10_000;
    expect(names(s.tick())).toEqual(['connection_changed']);
    expect(s.state.connection.game).toBe('disconnected');
    s.setIsaacRunning(true);
    expect(s.state.connection.game).toBe('idle');
  });
});
