/**
 * Messages written by the Lua mod into log.txt (wire protocol 1).
 * Keys are intentionally short: they are written to disk by the game.
 * See isaac-mod/irtc/collect.lua for the producer side.
 */

export const WIRE_PROTOCOL = 1;

export interface HelloMsg {
  mod: string;
  proto: number;
  rgon: boolean;
  rep: boolean;
  maxc?: number;
}

export interface RunMsg {
  cont: boolean;
  resync?: boolean;
  seed?: string;
  diff?: number;
  chal?: number;
  greed?: boolean;
  ptype?: number;
  pname?: string;
  f: number;
}

export interface LevelMsg {
  stage?: number;
  stype?: number;
  abs?: number;
  name?: string;
  curses?: number;
  alt?: boolean;
  f: number;
}

export interface RoomMsg {
  idx?: number;
  grid?: number;
  list?: number;
  type?: number;
  shape?: number;
  variant?: number;
  visits?: number;
  clear?: boolean;
  f: number;
}

/** [gridIndex, roomType, shape, visited(0/1), clear(0/1), displayFlags, isCurrent(0/1)] */
export type MapRoomTuple = [number, number, number, number, number, number, number];

export interface MapMsg {
  rooms: MapRoomTuple[];
}

export interface PickupEntry {
  /** InitSeed: stable per-entity key. */
  k: number;
  /** Pickup variant (100 collectible, 350 trinket, 300 card, 70 pill). */
  v: number;
  /** SubType (item id / trinket id / card id / pill color). -1 = hidden (blind). */
  s: number;
  x: number;
  y: number;
  /** Price (0 = free, >0 coins, <0 special/heart deals). */
  p: number;
  /** OptionsPickupIndex (>0: only one of the group can be taken). */
  o: number;
  /** Quality from ItemConfig (collectibles only). */
  q?: number;
  /** Name from ItemConfig (only modded collectibles). */
  n?: string;
  /** Identified pill effect. */
  fx?: number;
}

export interface PickupsMsg {
  items: PickupEntry[];
  other: Record<string, number>;
}

export interface PosMsg {
  x: number;
  y: number;
}

export interface StatsMsg {
  dmg: number;
  fd: number;
  rng: number;
  ss: number;
  spd: number;
  luck: number;
  hp: {
    red?: number;
    max?: number;
    soul?: number;
    black?: number;
    bone?: number;
    eternal?: number;
    golden?: number;
    rotten?: number;
    broken?: number;
    limit?: number;
  };
  res: {
    coins?: number;
    bombs?: number;
    keys?: number;
    gkey?: boolean;
    gbomb?: boolean;
  };
  forms: number[];
  ptype?: number;
}

export interface InventoryMsg {
  /** [collectibleId, count] */
  c: [number, number][];
  /** [slot, collectibleId, charge] */
  a: [number, number, number][];
  t: number[];
  k: number[];
  /** [pillColor, effect or -1 if unidentified] */
  p: [number, number][];
  names?: Record<string, string>;
}

export interface QueuedMsg {
  id: number;
  kind: 'c' | 't';
  touched: boolean;
}

export interface HeartbeatMsg {
  inRun: boolean;
  paused: boolean;
  f: number;
}

export interface EndMsg {
  over: boolean;
  f: number;
}

export interface ExitMsg {
  save: boolean;
  f: number;
}

export interface ClearMsg {
  clear: boolean;
}

/**
 * A pill or card was used (MC_USE_PILL / MC_USE_CARD).
 * `held` is the evidence that the player really used the one in their pocket:
 *  - card: the card id equals the card held in slot 0 on the previous update;
 *  - pill: a pill was held and the game's color->effect mapping for that color equals `id`.
 * Uses triggered by other items (Echo Chamber, random effects...) arrive with held=false.
 */
export interface UseMsg {
  t: 'p' | 'c';
  /** PillEffect id or Card id. */
  id: number;
  /** Pill color held when used (pills only). */
  color?: number;
  held: boolean;
  flags: number;
}

export interface ErrMsg {
  where: string;
  msg: string;
}

export interface ModMessageMap {
  hello: HelloMsg;
  run: RunMsg;
  level: LevelMsg;
  room: RoomMsg;
  map: MapMsg;
  pickups: PickupsMsg;
  pos: PosMsg;
  stats: StatsMsg;
  inv: InventoryMsg;
  queued: QueuedMsg;
  hb: HeartbeatMsg;
  end: EndMsg;
  exit: ExitMsg;
  clear: ClearMsg;
  use: UseMsg;
  err: ErrMsg;
}

export type ModMessageKind = keyof ModMessageMap;

export type ModMessage = {
  [K in ModMessageKind]: { kind: K; seq: number; data: ModMessageMap[K] };
}[ModMessageKind];

export const MOD_MESSAGE_KINDS: readonly ModMessageKind[] = [
  'hello', 'run', 'level', 'room', 'map', 'pickups', 'pos', 'stats', 'inv', 'queued', 'hb', 'end', 'exit', 'clear', 'use', 'err',
];
