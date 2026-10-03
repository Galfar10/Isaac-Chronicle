import type { GameState, ItemKind, RoomItem, RunInfo, Stats, ConnectionInfo, FloorInfo, RoomInfo } from './state.js';

/** WebSocket protocol version between companion server and web clients. */
export const WS_PROTOCOL = 1;

/** Domain events. They describe *what happened*; the full state describes *what is*. */
export type DomainEvent =
  | { event: 'connection_changed'; data: ConnectionInfo }
  | { event: 'run_started'; data: RunInfo }
  | { event: 'run_ended'; data: { runId: string; status: RunInfo['status'] } }
  | { event: 'floor_changed'; data: FloorInfo }
  | { event: 'room_changed'; data: RoomInfo & { floor: string | null } }
  /** Sanitized: an unidentified item carries no id/quality/name. */
  | { event: 'item_spawned'; data: RoomItem & { onRoomEnter: boolean } }
  /** The player got close enough: identity is now part of the item. */
  | { event: 'item_revealed'; data: RoomItem }
  /** The player walked away: the item is unidentified again. */
  | { event: 'item_concealed'; data: { key: number; kind: ItemKind } }
  | { event: 'item_removed'; data: { key: number; kind: ItemKind; id: number | null } }
  /** A pill/card was used. first=true the very first time ever (persistent). */
  | { event: 'discovery'; data: { kind: 'pill' | 'card'; id: number; first: boolean } }
  | { event: 'item_picked'; data: { id: number; kind: ItemKind } }
  | { event: 'nearest_changed'; data: { key: number | null; id: number | null; kind: ItemKind | null; distance: number | null } }
  | { event: 'stats_changed'; data: { stats: Stats; deltas: Partial<Stats> } }
  | { event: 'inventory_changed'; data: { added: number[]; removed: number[] } }
  | { event: 'transformation'; data: { form: number } }
  | { event: 'mod_error'; data: { where: string; message: string } };

export type DomainEventName = DomainEvent['event'];

/** Server -> client messages. */
export type ServerMessage =
  | { v: typeof WS_PROTOCOL; type: 'welcome'; server: { version: string; dataVersion: string | null }; state: GameState }
  | { v: typeof WS_PROTOCOL; type: 'update'; seq: number; events: DomainEvent[]; state: GameState }
  | { v: typeof WS_PROTOCOL; type: 'pong'; t: number };

/** Client -> server messages. */
export type ClientMessage =
  | { type: 'ping'; t: number }
  | { type: 'hello'; client: string; wsProtocol: number };
