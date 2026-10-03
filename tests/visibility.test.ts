import { describe, expect, it } from 'vitest';
import type { ModMessage, ModMessageKind, ModMessageMap, MapRoomTuple } from '@irtc/protocol';
import { GameStateStore } from '../bridge/src/store';

let seq = 0;
const m = <K extends ModMessageKind>(kind: K, data: ModMessageMap[K]) => ({ kind, seq: ++seq, data }) as ModMessage;
const ROOMS: MapRoomTuple[] = [
  [58, 1, 1, 1, 1, 5, 1],
  [45, 4, 1, 1, 1, 5, 0],
];
const level = (stage: number, curses: number) => m('level', { stage, stype: 0, name: `Floor ${stage}`, curses, f: 1 });
const stats = { dmg: 3.5, fd: 10, rng: 260, ss: 1, spd: 1, luck: 0, hp: { red: 6, max: 6, soul: 2 }, res: { coins: 1, bombs: 1, keys: 1 }, forms: [] };

function store(curses = 0) {
  const s = new GameStateStore();
  s.apply(m('run', { cont: false, seed: 'S', ptype: 0, f: 0 }));
  s.apply(level(1, curses));
  s.apply(m('map', { rooms: ROOMS }));
  s.apply(m('stats', stats));
  return s;
}

describe('map visibility follows the game', () => {
  it('normal floor: map shown', () => {
    const s = store();
    expect(s.state.mapHidden).toBeNull();
    expect(s.state.map).toHaveLength(2);
  });

  it('Curse of the Lost: the map is not sent at all', () => {
    const s = store(4);
    expect(s.state.mapHidden).toBe('curse_lost');
    expect(s.state.map).toBeNull();
    s.apply(m('map', { rooms: ROOMS })); // new rooms explored: still hidden
    expect(s.state.map).toBeNull();
  });

  it('curse removed mid-floor (e.g. Black Candle): the map comes back', () => {
    const s = store(4);
    s.apply(level(1, 0));
    expect(s.state.mapHidden).toBeNull();
    expect(s.state.map).toHaveLength(2);
  });

  it('Amnesia hides the map for the rest of the floor, even when triggered by another item', () => {
    const s = store();
    s.apply(m('use', { t: 'p', id: 25, color: 0, held: false, flags: 2432 }));
    expect(s.state.mapHidden).toBe('amnesia');
    expect(s.state.map).toBeNull();
    s.apply(m('map', { rooms: ROOMS }));
    expect(s.state.map).toBeNull();
    s.apply(level(2, 0)); // next floor: the map is back
    s.apply(m('map', { rooms: ROOMS }));
    expect(s.state.mapHidden).toBeNull();
    expect(s.state.map).toHaveLength(2);
  });
});

describe('health visibility follows the game', () => {
  it('Curse of the Unknown hides health (zeros + flag); resources stay visible', () => {
    const s = store(8);
    expect(s.state.player?.healthHidden).toBe(true);
    expect(s.state.player?.health).toMatchObject({ red: 0, max: 0, soul: 0 });
    expect(s.state.player?.resources.coins).toBe(1);
    s.apply(level(2, 0));
    expect(s.state.player?.healthHidden).toBe(false);
    expect(s.state.player?.health).toMatchObject({ red: 6, max: 6, soul: 2 });
  });
});
