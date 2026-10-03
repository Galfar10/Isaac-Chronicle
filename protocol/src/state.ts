/**
 * Public game state served to web clients (HTTP /api/state and WebSocket).
 * Extensible: new optional fields can be added without breaking clients;
 * breaking changes must bump STATE_SCHEMA_VERSION.
 */

export const STATE_SCHEMA_VERSION = 1;

export type GameLink = 'connected' | 'idle' | 'waiting' | 'disconnected';

export interface ConnectionInfo {
  /**
   * connected: heartbeat received in the last few seconds.
   * idle: Isaac process running but no recent heartbeat (main menu / mod disabled).
   * waiting: companion is running, nothing detected yet.
   * disconnected: heartbeat lost.
   */
  game: GameLink;
  lastPacketAt: number | null;
  modVersion: string | null;
  modProtocol: number | null;
  protocolOk: boolean;
  repentogon: boolean;
  paused: boolean;
  logPath: string | null;
  isaacRunning: boolean | null;
  error: string | null;
}

export type RunStatus = 'playing' | 'won' | 'dead' | 'exited';

export interface CharacterInfo {
  type: number | null;
  name: string | null;
  tainted: boolean;
}

export interface FloorInfo {
  stage: number | null;
  stageType: number | null;
  absoluteStage: number | null;
  name: string | null;
  curses: number;
  alt: boolean;
}

export interface RunInfo {
  id: string;
  startedAt: number;
  continued: boolean;
  seed: string | null;
  difficulty: number | null;
  challenge: number | null;
  greed: boolean;
  character: CharacterInfo;
  floor: FloorInfo | null;
  /** Game frame count (30 per second). */
  frame: number;
  /** Seconds of game time (frame / 30). */
  time: number;
  status: RunStatus;
}

export interface Stats {
  damage: number;
  /** Shots per second as shown by the HUD: 30 / (MaxFireDelay + 1). */
  tears: number;
  fireDelay: number;
  /** HUD range: TearRange / 40. */
  range: number;
  rangeRaw: number;
  shotSpeed: number;
  speed: number;
  luck: number;
}

export interface Health {
  red: number;
  max: number;
  soul: number;
  /** Number of black heart slots (popcount of GetBlackHearts bitmask). */
  black: number;
  bone: number;
  eternal: number;
  golden: number;
  rotten: number;
  broken: number;
  limit: number;
}

export interface Resources {
  coins: number;
  bombs: number;
  keys: number;
  goldenKey: boolean;
  goldenBomb: boolean;
}

export interface PlayerInfo {
  /** All zeros while healthHidden (Curse of the Unknown hides it in the HUD). */
  health: Health;
  healthHidden: boolean;
  resources: Resources;
  /** PlayerForm ids currently active. */
  transformations: number[];
  position: { x: number; y: number } | null;
}

export type ItemKind = 'collectible' | 'trinket' | 'card' | 'pill';

export interface InventoryCollectible {
  id: number;
  count: number;
  /** Order of acquisition within the run (lower = earlier). */
  order: number;
  name?: string;
}

export interface Inventory {
  collectibles: InventoryCollectible[];
  actives: { slot: number; id: number; charge: number }[];
  trinkets: number[];
  /** Cards in the pocket: revealed on pickup (id null only if the game gave no id). */
  cards: { id: number | null }[];
  /** Pills in the pocket: effect null until that color is known (taken this run / identified by the game). */
  pills: { color: number; effect: number | null }[];
}

/**
 * Why a room item is not identified:
 *  far        — the player is not close enough (pedestal reveal by proximity);
 *  blind      — the game itself hides it (Curse of the Blind / "?" pedestal);
 *  not_picked — card on the floor (revealed when picked up) or pill not taken yet
 *               (pills are only revealed once taken, like in the game).
 */
export type UnknownReason = 'far' | 'blind' | 'not_picked';

/** Pills/cards the player has picked up at least once (persistent across runs and restarts). */
export interface Discoveries {
  /** PillEffect ids. */
  pills: number[];
  /** Card ids. */
  cards: number[];
}

export interface RoomInfo {
  index: number | null;
  gridIndex: number | null;
  listIndex: number | null;
  type: number | null;
  shape: number | null;
  variant: number | null;
  visits: number;
  clear: boolean;
}

/**
 * An entity in the room, as exposed to clients. Identity fields (id, quality, name,
 * pillColor, pillEffect) are ONLY present when the item is identified; the server
 * strips them otherwise, so nothing leaks through the WebSocket.
 */
export interface RoomItem {
  /** Stable per-entity key (InitSeed). */
  key: number;
  kind: ItemKind;
  /** Item / trinket / card id, or pill effect for pills. null when not identified. */
  id: number | null;
  variant: number;
  x: number;
  y: number;
  price: number;
  optionsIndex: number;
  /** The player is (or was recently) within the reveal distance. */
  revealed: boolean;
  /** null when identified. */
  unknown: UnknownReason | null;
  quality?: number;
  /** Name reported by the game (modded items only). */
  name?: string;
  /** Pill color (visible in game) once the player is close. */
  pillColor?: number;
  pillEffect?: number | null;
  /** Distance to the player in tiles (40px), null if unknown. */
  distance: number | null;
}

export interface MapRoom {
  gridIndex: number;
  type: number;
  shape: number;
  visited: boolean;
  clear: boolean;
  displayFlags: number;
  current: boolean;
}

export type HistoryType =
  | 'run_started'
  | 'run_continued'
  | 'floor_changed'
  | 'room_changed'
  | 'item_found'
  | 'item_picked'
  | 'stats_changed'
  | 'transformation'
  | 'discovered'
  | 'consumable_used'
  | 'run_won'
  | 'run_lost'
  | 'run_exited';

export interface HistoryEntry {
  seq: number;
  type: HistoryType;
  /** Run time in seconds. */
  time: number;
  wallTime: number;
  floor: string | null;
  roomIndex: number | null;
  itemId?: number;
  itemKind?: ItemKind;
  roomType?: number;
  stats?: Partial<Stats>;
  deltas?: Partial<Stats>;
  text?: string;
}

export interface PickedInfo {
  id: number;
  kind: ItemKind;
  at: number;
  /** 'used' when a pill was revealed by taking it (default: picked up). */
  how?: 'picked' | 'used';
}

export interface GameState {
  schemaVersion: number;
  connection: ConnectionInfo;
  run: RunInfo | null;
  player: PlayerInfo | null;
  stats: Stats | null;
  inventory: Inventory;
  room: RoomInfo | null;
  roomItems: RoomItem[];
  otherPickups: Record<string, number>;
  nearestKey: number | null;
  lastPicked: PickedInfo | null;
  map: MapRoom[] | null;
  /**
   * The game hides the map (Curse of the Lost, or an Amnesia pill for the rest of the floor):
   * the map is then not sent at all.
   */
  mapHidden: 'curse_lost' | 'amnesia' | null;
  history: HistoryEntry[];
  discoveries: Discoveries;
  updatedAt: number;
}

export function emptyInventory(): Inventory {
  return { collectibles: [], actives: [], trinkets: [], cards: [], pills: [] };
}

export function createInitialState(now = Date.now()): GameState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    connection: {
      game: 'waiting',
      lastPacketAt: null,
      modVersion: null,
      modProtocol: null,
      protocolOk: true,
      repentogon: false,
      paused: false,
      logPath: null,
      isaacRunning: null,
      error: null,
    },
    run: null,
    player: null,
    stats: null,
    inventory: emptyInventory(),
    room: null,
    roomItems: [],
    otherPickups: {},
    nearestKey: null,
    lastPicked: null,
    map: null,
    mapHidden: null,
    history: [],
    discoveries: { pills: [], cards: [] },
    updatedAt: now,
  };
}
