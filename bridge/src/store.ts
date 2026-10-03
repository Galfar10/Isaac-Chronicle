import {
  createInitialState,
  emptyInventory,
  isTainted,
  CURSE_OF_THE_LOST,
  CURSE_OF_THE_UNKNOWN,
  FRAMES_PER_SECOND,
  ITEM_CONCEAL_DISTANCE,
  PILL_AMNESIA,
  ITEM_REVEAL_DISTANCE,
  PILL_GIANT_FLAG,
  PickupVariant,
  TILE_SIZE,
  WIRE_PROTOCOL,
  type DomainEvent,
  type GameState,
  type Health,
  type HistoryEntry,
  type HistoryType,
  type InventoryMsg,
  type ItemKind,
  type ModMessage,
  type PickupEntry,
  type RoomItem,
  type RunMsg,
  type Stats,
  type StatsMsg,
  type UnknownReason,
  type UseMsg,
} from '@irtc/protocol';
import { randomUUID } from 'node:crypto';

export interface StoreOptions {
  now?: () => number;
  /** Lets the persistence layer reuse a run id (e.g. continued run / companion restarted mid-run). */
  resolveRunId?: (run: RunMsg) => { id: string; history?: HistoryEntry[] } | null;
  historyLimit?: number;
  /** Heartbeat timeout before the game is considered disconnected. */
  heartbeatTimeoutMs?: number;
  /** Tiles. Default ITEM_REVEAL_DISTANCE. */
  revealDistance?: number;
  /** Tiles. Default ITEM_CONCEAL_DISTANCE (never below revealDistance). */
  concealDistance?: number;
  /** Persistent discoveries loaded from the database. */
  discoveries?: { pills: Iterable<number>; cards: Iterable<number> };
  /** First real use of a pill effect / card: persist it. */
  onDiscovery?: (kind: 'pill' | 'card', id: number, runId: string | null) => void;
  /** Seen (picked up / identified by the game) but not yet discovered. */
  onPresented?: (kind: 'pill' | 'card', id: number) => void;
}

const MAIN_STATS: (keyof Stats)[] = ['damage', 'tears', 'range', 'shotSpeed', 'speed', 'luck'];
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function variantToKind(variant: number): ItemKind | null {
  switch (variant) {
    case PickupVariant.COLLECTIBLE:
      return 'collectible';
    case PickupVariant.TRINKET:
      return 'trinket';
    case PickupVariant.TAROTCARD:
      return 'card';
    case PickupVariant.PILL:
      return 'pill';
    default:
      return null;
  }
}

/** Converts raw player fields into the values shown by the in-game HUD. */
export function toStats(s: StatsMsg): Stats {
  return {
    damage: round(s.dmg),
    tears: round(30 / (s.fd + 1)),
    fireDelay: round(s.fd),
    range: round(s.rng / TILE_SIZE),
    rangeRaw: round(s.rng, 1),
    shotSpeed: round(s.ss),
    speed: round(s.spd),
    luck: round(s.luck),
  };
}

/**
 * Reducer: applies mod messages to the public GameState and produces domain events.
 * Pure logic (no I/O) so it can be unit tested and replayed from a log file.
 */
export class GameStateStore {
  state: GameState;
  private readonly now: () => number;
  private readonly opts: StoreOptions;
  private historySeq = 0;
  private foundKeys = new Set<string>();
  private orderCounter = 0;
  private acquisition = new Map<number, number>();
  private pickupsSinceRoom = 0;
  private hadPacket = false;
  /** Room entities with their REAL identity. Never serialized; clients get publicItem(). */
  private tracked = new Map<number, TrackedItem>();
  private discovered: { pills: Set<number>; cards: Set<number> };
  /** Pill color -> effect learned from a real use during this run (colors reshuffle every run). */
  private runPillColors = new Map<number, number>();
  private rawInv: InventoryMsg | null = null;
  private presented = new Set<string>();
  /** Floor entities (keys) that the player dropped from the pocket: already known, so shown. */
  private knownFloor = new Set<number>();
  /** Real map / health as reported by the mod; exposed only when the game shows them. */
  private rawMap: GameState['map'] = null;
  private rawHealth: Health | null = null;
  /** An Amnesia pill was taken on this floor. */
  private amnesia = false;
  /** Pocket items that left without a use, waiting for their floor entity to appear. */
  private pendingDrops: { kind: 'card' | 'pill'; sub: number; at: number }[] = [];
  /** Recent real uses, so a pocket item that disappears because it was used is not taken as a drop. */
  private recentUses: { kind: 'card' | 'pill'; sub: number; at: number }[] = [];

  constructor(opts: StoreOptions = {}) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
    this.state = createInitialState(this.now());
    this.discovered = { pills: new Set(opts.discoveries?.pills ?? []), cards: new Set(opts.discoveries?.cards ?? []) };
    this.state.discoveries = {
      pills: [...this.discovered.pills].sort((a, b) => a - b),
      cards: [...this.discovered.cards].sort((a, b) => a - b),
    };
  }

  setLogPath(path: string | null): void {
    this.state.connection.logPath = path;
  }

  setIsaacRunning(running: boolean | null): DomainEvent[] {
    if (this.state.connection.isaacRunning === running) return [];
    this.state.connection.isaacRunning = running;
    return this.refreshLink();
  }

  setError(error: string | null): DomainEvent[] {
    if (this.state.connection.error === error) return [];
    this.state.connection.error = error;
    return [{ event: 'connection_changed', data: { ...this.state.connection } }];
  }

  /** Periodic liveness check. */
  tick(): DomainEvent[] {
    return this.refreshLink();
  }

  private refreshLink(): DomainEvent[] {
    const c = this.state.connection;
    const timeout = this.opts.heartbeatTimeoutMs ?? 6000;
    let link = c.game;
    const fresh = c.lastPacketAt !== null && this.now() - c.lastPacketAt <= timeout;
    if (fresh) link = 'connected';
    else if (c.isaacRunning) link = 'idle';
    else link = this.hadPacket ? 'disconnected' : 'waiting';
    if (link === c.game) return [];
    c.game = link;
    this.touch();
    return [{ event: 'connection_changed', data: { ...c } }];
  }

  private touch(): void {
    this.state.updatedAt = this.now();
  }

  private floorLabel(): string | null {
    const f = this.state.run?.floor;
    if (!f) return null;
    return f.name || (f.stage !== null ? `Stage ${f.stage}` : null);
  }

  private addHistory(type: HistoryType, extra: Partial<HistoryEntry> = {}): void {
    const entry: HistoryEntry = {
      seq: ++this.historySeq,
      type,
      time: this.state.run?.time ?? 0,
      wallTime: this.now(),
      floor: this.floorLabel(),
      roomIndex: this.state.room?.index ?? null,
      ...extra,
    };
    this.state.history.push(entry);
    const limit = this.opts.historyLimit ?? 1000;
    if (this.state.history.length > limit) this.state.history.splice(0, this.state.history.length - limit);
  }

  private setFrame(f: number | undefined): void {
    if (this.state.run && typeof f === 'number') {
      this.state.run.frame = f;
      this.state.run.time = Math.floor(f / FRAMES_PER_SECOND);
    }
  }

  apply(msg: ModMessage): DomainEvent[] {
    const events: DomainEvent[] = [];
    const c = this.state.connection;
    c.lastPacketAt = this.now();
    this.hadPacket = true;
    events.push(...this.refreshLink());

    switch (msg.kind) {
      case 'hello': {
        c.modVersion = msg.data.mod;
        c.modProtocol = msg.data.proto;
        c.protocolOk = msg.data.proto === WIRE_PROTOCOL;
        c.repentogon = msg.data.rgon;
        events.push({ event: 'connection_changed', data: { ...c } });
        break;
      }
      case 'run':
        events.push(...this.onRun(msg.data));
        break;
      case 'level': {
        const d = msg.data;
        if (!this.state.run) break;
        const prev = this.state.run.floor;
        const floor = {
          stage: d.stage ?? null,
          stageType: d.stype ?? null,
          absoluteStage: d.abs ?? null,
          name: d.name || null,
          curses: d.curses ?? 0,
          alt: d.alt ?? false,
        };
        this.state.run.floor = floor;
        this.setFrame(d.f);
        const changed = !prev || prev.stage !== floor.stage || prev.stageType !== floor.stageType;
        if (changed) {
          this.amnesia = false; // Amnesia only lasts for the floor where it was taken
          events.push({ event: 'floor_changed', data: floor });
          this.addHistory('floor_changed', { text: floor.name ?? undefined });
        }
        this.applyVisibility();
        break;
      }
      case 'room': {
        const d = msg.data;
        const prev = this.state.room;
        this.state.room = {
          index: d.idx ?? null,
          gridIndex: d.grid ?? null,
          listIndex: d.list ?? null,
          type: d.type ?? null,
          shape: d.shape ?? null,
          variant: d.variant ?? null,
          visits: d.visits ?? 0,
          clear: d.clear ?? false,
        };
        this.setFrame(d.f);
        const sameRoom = prev && prev.listIndex === this.state.room.listIndex && prev.index === this.state.room.index;
        if (!sameRoom) {
          for (const item of this.state.roomItems) {
            events.push({ event: 'item_removed', data: { key: item.key, kind: item.kind, id: item.id } });
          }
          this.tracked.clear();
          this.state.roomItems = [];
          this.state.otherPickups = {};
          this.pickupsSinceRoom = 0;
          // The previous room's coordinates are meaningless here: unknown until a fresh "pos",
          // so nothing can be revealed by a stale position.
          if (this.state.player) this.state.player.position = null;
          if (this.state.nearestKey !== null) {
            this.state.nearestKey = null;
            events.push({ event: 'nearest_changed', data: { key: null, id: null, kind: null, distance: null } });
          }
          events.push({ event: 'room_changed', data: { ...this.state.room, floor: this.floorLabel() } });
          if (this.state.run) this.addHistory('room_changed', { roomType: this.state.room.type ?? undefined });
        }
        break;
      }
      case 'clear':
        if (this.state.room) this.state.room.clear = msg.data.clear;
        break;
      case 'map':
        this.rawMap = msg.data.rooms.map(([gridIndex, type, shape, visited, clear, displayFlags, current]) => ({
          gridIndex,
          type,
          shape,
          visited: visited === 1,
          clear: clear === 1,
          displayFlags,
          current: current === 1,
        }));
        this.applyVisibility();
        break;
      case 'pickups':
        events.push(...this.onPickups(msg.data.items));
        this.state.otherPickups = msg.data.other ?? {};
        break;
      case 'pos': {
        this.ensurePlayer().position = { x: msg.data.x, y: msg.data.y };
        events.push(...this.updateDistances());
        break;
      }
      case 'stats':
        events.push(...this.onStats(msg.data));
        break;
      case 'inv':
        events.push(...this.onInventory(msg.data));
        break;
      case 'queued': {
        const kind: ItemKind = msg.data.kind === 't' ? 'trinket' : 'collectible';
        const id = msg.data.id;
        this.state.lastPicked = { id, kind, at: this.now() };
        // Remove the matching room item right away so the popup switches instantly.
        const key = this.closestKey((t) => t.kind === kind && t.trueSub === id);
        if (key !== null) {
          this.tracked.delete(key);
          events.push({ event: 'item_removed', data: { key, kind, id } });
        }
        events.push({ event: 'item_picked', data: { id, kind } });
        this.addHistory('item_picked', { itemId: id, itemKind: kind });
        events.push(...this.updateDistances());
        break;
      }
      case 'hb':
        c.paused = msg.data.paused;
        if (msg.data.inRun) this.setFrame(msg.data.f);
        break;
      case 'end': {
        if (!this.state.run) break;
        this.setFrame(msg.data.f);
        this.state.run.status = msg.data.over ? 'dead' : 'won';
        this.addHistory(msg.data.over ? 'run_lost' : 'run_won');
        events.push({ event: 'run_ended', data: { runId: this.state.run.id, status: this.state.run.status } });
        break;
      }
      case 'exit': {
        if (!this.state.run) break;
        this.setFrame(msg.data.f);
        if (this.state.run.status === 'playing') {
          this.state.run.status = 'exited';
          this.addHistory('run_exited', { text: msg.data.save ? 'saved' : undefined });
          events.push({ event: 'run_ended', data: { runId: this.state.run.id, status: 'exited' } });
        }
        this.tracked.clear();
        this.state.roomItems = [];
        this.state.nearestKey = null;
        break;
      }
      case 'use':
        events.push(...this.onUse(msg.data));
        break;
      case 'err':
        events.push({ event: 'mod_error', data: { where: msg.data.where, message: msg.data.msg } });
        break;
    }
    this.touch();
    return events;
  }

  private onRun(d: RunMsg): DomainEvent[] {
    const current = this.state.run;
    // A resync (mod reloaded mid-run) for the same run keeps everything.
    if (d.resync && current && current.seed === (d.seed ?? null) && current.status === 'playing') {
      this.setFrame(d.f);
      return [];
    }
    const resolved = this.opts.resolveRunId?.(d) ?? null;
    const run = {
      id: resolved?.id ?? randomUUID(),
      startedAt: this.now(),
      continued: d.cont,
      seed: d.seed ?? null,
      difficulty: d.diff ?? null,
      challenge: d.chal ?? null,
      greed: d.greed ?? false,
      character: { type: d.ptype ?? null, name: d.pname ?? null, tainted: isTainted(d.ptype) },
      floor: null,
      frame: d.f,
      time: Math.floor(d.f / FRAMES_PER_SECOND),
      status: 'playing' as const,
    };
    this.state.run = run;
    this.state.player = null;
    this.state.stats = null;
    this.state.inventory = emptyInventory();
    this.state.room = null;
    this.state.roomItems = [];
    this.state.otherPickups = {};
    this.state.nearestKey = null;
    this.state.lastPicked = null;
    this.state.map = null;
    this.state.mapHidden = null;
    this.rawMap = null;
    this.rawHealth = null;
    this.amnesia = false;
    this.state.history = resolved?.history ? [...resolved.history] : [];
    this.historySeq = this.state.history.reduce((m, h) => Math.max(m, h.seq), 0);
    this.foundKeys.clear();
    this.acquisition.clear();
    this.orderCounter = 0;
    this.tracked.clear();
    this.runPillColors.clear();
    this.rawInv = null;
    this.presented.clear();
    this.knownFloor.clear();
    this.pendingDrops = [];
    this.recentUses = [];
    this.addHistory(d.cont ? 'run_continued' : 'run_started', { text: d.pname ?? undefined });
    return [{ event: 'run_started', data: { ...run } }];
  }

  private ensurePlayer() {
    if (!this.state.player) {
      this.state.player = {
        health: { ...NO_HEALTH },
        healthHidden: false,
        resources: { coins: 0, bombs: 0, keys: 0, goldenKey: false, goldenBomb: false },
        transformations: [],
        position: null,
      };
    }
    return this.state.player;
  }

  /**
   * Respects what the game hides in its HUD:
   *  - map: Curse of the Lost, or an Amnesia pill taken on this floor;
   *  - health: Curse of the Unknown.
   * Hidden data is kept internally and never sent to clients.
   */
  private applyVisibility(): void {
    const curses = this.state.run?.floor?.curses ?? 0;
    const hidden = (curses & CURSE_OF_THE_LOST) !== 0 ? 'curse_lost' : this.amnesia ? 'amnesia' : null;
    this.state.mapHidden = hidden;
    this.state.map = hidden ? null : this.rawMap;
    const p = this.state.player;
    if (p) {
      p.healthHidden = (curses & CURSE_OF_THE_UNKNOWN) !== 0;
      p.health = p.healthHidden || !this.rawHealth ? { ...NO_HEALTH } : { ...this.rawHealth };
    }
  }

  // ------------------------------------------------------------ discovery rules

  private pillEffectForColor(color: number, fx: number | undefined): number | null {
    if (fx !== undefined && fx >= 0) return fx; // the game itself has identified this color
    return this.runPillColors.get(color & ~PILL_GIANT_FLAG) ?? null; // seen used earlier this run
  }

  /** Identity of a tracked item as the player is allowed to know it right now. */
  private identity(t: TrackedItem): { id: number | null; unknown: UnknownReason | null } {
    if (t.trueSub < 0) return { id: null, unknown: 'blind' };
    // Pills and cards on the floor are never identified until picked up — except the very
    // entity the player dropped from their pocket (already known).
    if (t.kind === 'card' || t.kind === 'pill') {
      if (this.knownFloor.has(t.key)) {
        const id = t.kind === 'card' ? t.trueSub : this.pillEffectForColor(t.trueSub, t.fx);
        if (id !== null) return { id, unknown: null };
      }
      return { id: null, unknown: t.revealed ? 'not_picked' : 'far' };
    }
    if (!t.revealed) return { id: null, unknown: 'far' };
    return { id: t.trueSub, unknown: null };
  }

  /** Sanitized view: identity fields only when identified (nothing leaks to clients). */
  private publicItem(t: TrackedItem): RoomItem {
    const { id, unknown } = this.identity(t);
    const known = unknown === null;
    return {
      key: t.key,
      kind: t.kind,
      id,
      variant: t.variant,
      x: t.x,
      y: t.y,
      price: t.price,
      optionsIndex: t.optionsIndex,
      revealed: t.revealed,
      unknown,
      ...(known && t.quality !== undefined ? { quality: t.quality } : {}),
      ...(known && t.name !== undefined ? { name: t.name } : {}),
      ...(t.kind === 'pill' && (t.revealed || known) && t.trueSub >= 0 ? { pillColor: t.trueSub, pillEffect: known ? id : null } : {}),
      distance: t.distance,
    };
  }

  private rebuildRoomItems(): void {
    this.state.roomItems = [...this.tracked.values()].map((t) => this.publicItem(t));
  }

  private notePresented(kind: 'pill' | 'card', id: number): void {
    const set = kind === 'pill' ? this.discovered.pills : this.discovered.cards;
    const key = `${kind}:${id}`;
    if (set.has(id) || this.presented.has(key)) return;
    this.presented.add(key);
    this.opts.onPresented?.(kind, id);
  }

  private onPickups(entries: PickupEntry[]): DomainEvent[] {
    const events: DomainEvent[] = [];
    const onRoomEnter = this.pickupsSinceRoom === 0;
    this.pickupsSinceRoom++;
    const prev = new Map(this.tracked);
    const next = new Map<number, TrackedItem>();
    const spawned: TrackedItem[] = [];
    for (const p of entries) {
      const kind = variantToKind(p.v);
      if (!kind) continue;
      const old = prev.get(p.k);
      if (old && old.trueSub === p.s && old.kind === kind) {
        Object.assign(old, { x: p.x, y: p.y, price: p.p ?? 0, optionsIndex: p.o ?? 0, fx: p.fx });
        next.set(p.k, old);
        prev.delete(p.k);
        continue;
      }
      if (old) {
        // Same entity, different content (reroll / cycling pedestal).
        events.push({ event: 'item_removed', data: { key: old.key, kind: old.kind, id: this.identity(old).id } });
        prev.delete(p.k);
      }
      const t: TrackedItem = {
        key: p.k,
        kind,
        variant: p.v,
        trueSub: p.s,
        x: p.x,
        y: p.y,
        price: p.p ?? 0,
        optionsIndex: p.o ?? 0,
        quality: p.q,
        name: p.n,
        fx: p.fx,
        revealed: false,
        distance: null,
        spawnedAt: this.now(),
      };
      next.set(p.k, t);
      spawned.push(t);
      // The card/pill the player just dropped?
      if (kind === 'card' || kind === 'pill') {
        const i = this.pendingDrops.findIndex((d) => d.kind === kind && sameSub(kind, d.sub, p.s) && this.now() - d.at <= DROP_LINK_MS);
        if (i >= 0) {
          this.pendingDrops.splice(i, 1);
          this.knownFloor.add(p.k);
        }
      }
    }
    for (const gone of prev.values()) {
      events.push({ event: 'item_removed', data: { key: gone.key, kind: gone.kind, id: this.identity(gone).id } });
    }
    this.tracked = next;
    // Distances first, so a new item spawned right next to the player is announced already
    // revealed — but never with identity when it is far away.
    const distanceEvents = this.updateDistances(spawned);
    for (const t of spawned) events.push({ event: 'item_spawned', data: { ...this.publicItem(t), onRoomEnter } });
    events.push(...distanceEvents);
    return events;
  }

  private closestKey(pred: (t: TrackedItem) => boolean): number | null {
    let best: TrackedItem | null = null;
    for (const t of this.tracked.values()) {
      if (!pred(t)) continue;
      if (!best || (t.distance ?? Infinity) < (best.distance ?? Infinity)) best = t;
    }
    return best?.key ?? null;
  }

  /**
   * Recomputes distances (tiles), proximity reveal/conceal and the nearest item.
   * `silent` items (just spawned) get no item_revealed event: their item_spawned carries the state.
   */
  private updateDistances(silent: TrackedItem[] = []): DomainEvent[] {
    const events: DomainEvent[] = [];
    const pos = this.state.player?.position;
    const reveal = this.opts.revealDistance ?? ITEM_REVEAL_DISTANCE;
    const conceal = Math.max(reveal, this.opts.concealDistance ?? ITEM_CONCEAL_DISTANCE);
    for (const t of this.tracked.values()) {
      t.distance = pos ? round(Math.hypot(t.x - pos.x, t.y - pos.y) / TILE_SIZE, 1) : null;
      // Rounded distance is only for display; the decision uses the exact one.
      const exact = pos ? Math.hypot(t.x - pos.x, t.y - pos.y) / TILE_SIZE : Infinity;
      if (!t.revealed && exact <= reveal) {
        t.revealed = true;
        if (!silent.includes(t)) events.push({ event: 'item_revealed', data: this.publicItem(t) });
        this.onRevealed(t);
      } else if (t.revealed && exact > conceal) {
        t.revealed = false;
        events.push({ event: 'item_concealed', data: { key: t.key, kind: t.kind } });
      }
    }
    this.rebuildRoomItems();
    // Nearest: prefer collectibles/trinkets over consumables, then distance.
    const rank = (i: TrackedItem) => (i.kind === 'collectible' ? 0 : i.kind === 'trinket' ? 1 : 2);
    let nearest: TrackedItem | null = null;
    for (const t of this.tracked.values()) {
      if (!nearest) {
        nearest = t;
        continue;
      }
      const a = t.distance ?? Infinity;
      const b = nearest.distance ?? Infinity;
      if (a < b || (a === b && rank(t) < rank(nearest))) nearest = t;
    }
    const key = nearest?.key ?? null;
    if (key === this.state.nearestKey) return events;
    this.state.nearestKey = key;
    const pub = nearest ? this.publicItem(nearest) : null;
    events.push({
      event: 'nearest_changed',
      data: { key, id: pub?.id ?? null, kind: pub?.kind ?? null, distance: pub?.distance ?? null },
    });
    return events;
  }

  /** First identification in this room: history + "presented" bookkeeping. */
  private onRevealed(t: TrackedItem): void {
    if (t.trueSub < 0) return;
    if (t.kind === 'collectible' || t.kind === 'trinket') {
      const fk = `${this.state.room?.listIndex ?? '?'}:${t.kind}:${t.trueSub}`;
      if (!this.foundKeys.has(fk)) {
        this.foundKeys.add(fk);
        this.addHistory('item_found', { itemId: t.trueSub, itemKind: t.kind });
      }
    } else if (t.kind === 'card') {
      this.notePresented('card', t.trueSub);
    } else {
      const fx = this.pillEffectForColor(t.trueSub, t.fx);
      if (fx !== null) this.notePresented('pill', fx);
    }
  }

  /** Records a pill effect / card as discovered (persistent). Returns the discovery event. */
  private discover(kind: 'pill' | 'card', id: number): DomainEvent | null {
    const set = kind === 'pill' ? this.discovered.pills : this.discovered.cards;
    if (set.has(id)) return null;
    set.add(id);
    this.state.discoveries = {
      pills: [...this.discovered.pills].sort((a, b) => a - b),
      cards: [...this.discovered.cards].sort((a, b) => a - b),
    };
    this.opts.onDiscovery?.(kind, id, this.state.run?.id ?? null);
    this.addHistory('discovered', { itemId: id, itemKind: kind });
    return { event: 'discovery', data: { kind, id, first: true } };
  }

  private onUse(d: UseMsg): DomainEvent[] {
    const kind = d.t === 'p' ? 'pill' : 'card';
    // Amnesia hides the map for the rest of the floor, whatever triggered it (Echo Chamber...).
    if (kind === 'pill' && d.id === PILL_AMNESIA) {
      this.amnesia = true;
      this.applyVisibility();
    }
    // Only a use of the pill/card the player was holding counts (not effects from other items).
    if (!d.held) return [];
    if (kind === 'pill' && typeof d.color === 'number' && d.color > 0) this.runPillColors.set(d.color & ~PILL_GIANT_FLAG, d.id);
    this.recentUses.push({ kind, sub: kind === 'card' ? d.id : (d.color ?? -1), at: this.now() });
    const events: DomainEvent[] = [];
    const first = this.discover(kind, d.id);
    if (first) events.push(first);
    else {
      this.addHistory('consumable_used', { itemId: d.id, itemKind: kind });
      events.push({ event: 'discovery', data: { kind, id: d.id, first: false } });
    }
    if (kind === 'pill') {
      // Taking a pill is what reveals it: show it on the central card.
      this.state.lastPicked = { id: d.id, kind: 'pill', at: this.now(), how: 'used' };
      // Same color elsewhere (pocket / dropped on the floor) is now known for this run.
      const before = new Map(this.state.roomItems.map((i) => [i.key, i.id]));
      this.rebuildRoomItems();
      for (const item of this.state.roomItems) {
        if (item.id !== null && before.get(item.key) === null) events.push({ event: 'item_revealed', data: item });
      }
      this.rebuildInventory();
    }
    return events;
  }

  private onStats(d: StatsMsg): DomainEvent[] {
    const events: DomainEvent[] = [];
    const player = this.ensurePlayer();
    const h = d.hp;
    this.rawHealth = {
      red: h.red ?? 0,
      max: h.max ?? 0,
      soul: h.soul ?? 0,
      black: h.black ?? 0,
      bone: h.bone ?? 0,
      eternal: h.eternal ?? 0,
      golden: h.golden ?? 0,
      rotten: h.rotten ?? 0,
      broken: h.broken ?? 0,
      limit: h.limit ?? 0,
    };
    this.applyVisibility();
    const r = d.res;
    player.resources = {
      coins: r.coins ?? 0,
      bombs: r.bombs ?? 0,
      keys: r.keys ?? 0,
      goldenKey: r.gkey ?? false,
      goldenBomb: r.gbomb ?? false,
    };
    const newForms = (d.forms ?? []).filter((f) => !player.transformations.includes(f));
    const hadForms = this.state.stats !== null;
    player.transformations = [...(d.forms ?? [])];
    if (hadForms) {
      for (const form of newForms) {
        events.push({ event: 'transformation', data: { form } });
        this.addHistory('transformation', { text: String(form) });
      }
    }
    if (this.state.run && typeof d.ptype === 'number' && this.state.run.character.type !== d.ptype) {
      // Character can change mid-run (Clicker, Lazarus revive, Tainted Lazarus flip...).
      this.state.run.character = { type: d.ptype, name: this.state.run.character.name, tainted: isTainted(d.ptype) };
    }

    const stats = toStats(d);
    const prev = this.state.stats;
    const deltas: Partial<Stats> = {};
    let changed = !prev;
    if (prev) {
      for (const k of MAIN_STATS) {
        const diff = round(stats[k] - prev[k]);
        if (diff !== 0) {
          deltas[k] = diff;
          changed = true;
        }
      }
    }
    this.state.stats = stats;
    if (changed) {
      events.push({ event: 'stats_changed', data: { stats, deltas } });
      if (prev) this.addHistory('stats_changed', { stats: { ...stats }, deltas });
    }
    return events;
  }

  private onInventory(d: InventoryMsg): DomainEvent[] {
    const before = new Set(this.state.inventory.collectibles.map((c) => c.id));
    const names = d.names ?? {};
    const collectibles = d.c.map(([id, count]) => {
      if (!this.acquisition.has(id)) this.acquisition.set(id, ++this.orderCounter);
      return { id, count, order: this.acquisition.get(id)!, ...(names[String(id)] ? { name: names[String(id)] } : {}) };
    });
    collectibles.sort((a, b) => a.order - b.order);
    const after = new Set(collectibles.map((c) => c.id));
    for (const id of [...this.acquisition.keys()]) if (!after.has(id)) this.acquisition.delete(id);
    const prevInv = this.rawInv;
    this.rawInv = d;
    this.state.inventory = { ...this.state.inventory, collectibles };
    // Picking up a pill/card reveals it (and records the discovery for the profile).
    const events: DomainEvent[] = [];
    const newly = prevInv ? this.newPocketItems(prevInv, d) : [];
    if (prevInv) this.trackDrops(prevInv, d);
    for (const card of d.k ?? []) {
      const e = this.discover('card', card);
      if (e) events.push(e);
    }
    // Pills: like the game, unknown until taken. The mod only sends an effect when the game
    // has identified that color (taken before this run, PHD...); it is not a new discovery.
    for (const [color, fx] of d.p ?? []) {
      if (fx >= 0) this.runPillColors.set(color & ~PILL_GIANT_FLAG, fx);
    }
    this.rebuildInventory();
    // A drop whose floor entity was already reported: identify it now.
    const before2 = new Map(this.state.roomItems.map((i) => [i.key, i.id]));
    this.rebuildRoomItems();
    for (const item of this.state.roomItems) {
      if (item.id !== null && before2.get(item.key) === null) events.push({ event: 'item_revealed', data: item });
    }
    // Just picked up a card/pill: show it as "obtained" (central card on the web).
    for (const p of newly) {
      this.state.lastPicked = { id: p.id, kind: p.kind, at: this.now() };
      events.push({ event: 'item_picked', data: { id: p.id, kind: p.kind } });
      const isNew = events.some((e) => e.event === 'discovery' && e.data.kind === p.kind && e.data.id === p.id);
      if (!isNew) this.addHistory('item_picked', { itemId: p.id, itemKind: p.kind });
    }
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    if (added.length || removed.length) events.push({ event: 'inventory_changed', data: { added, removed } });
    return events;
  }

  /**
   * Cards/pills that left the pocket without being used were dropped: link each one to its
   * floor entity (already reported, or the next one to appear) so it stays identified.
   */
  private trackDrops(prev: InventoryMsg, next: InventoryMsg): void {
    const now = this.now();
    this.recentUses = this.recentUses.filter((u) => now - u.at <= DROP_LINK_MS);
    this.pendingDrops = this.pendingDrops.filter((p) => now - p.at <= DROP_LINK_MS);
    const removed: { kind: 'card' | 'pill'; sub: number }[] = [];
    const diff = (kind: 'card' | 'pill', before: number[], after: number[]) => {
      const left = [...after];
      for (const v of before) {
        const i = left.findIndex((x) => sameSub(kind, x, v));
        if (i >= 0) left.splice(i, 1);
        else removed.push({ kind, sub: v });
      }
    };
    diff('card', prev.k ?? [], next.k ?? []);
    diff('pill', (prev.p ?? []).map(([c]) => c), (next.p ?? []).map(([c]) => c));
    for (const r of removed) {
      const used = this.recentUses.findIndex((u) => u.kind === r.kind && sameSub(r.kind, u.sub, r.sub));
      if (used >= 0) {
        this.recentUses.splice(used, 1);
        continue;
      }
      // Floor entity already reported (pickups arrived before the inventory)?
      let best: TrackedItem | null = null;
      for (const t of this.tracked.values()) {
        if (t.kind !== r.kind || this.knownFloor.has(t.key) || !sameSub(r.kind, t.trueSub, r.sub) || now - t.spawnedAt > DROP_LINK_MS) continue;
        if (!best || (t.distance ?? Infinity) < (best.distance ?? Infinity)) best = t;
      }
      if (best) this.knownFloor.add(best.key);
      else this.pendingDrops.push({ ...r, at: now });
    }
  }

  /** Cards / pills present in `next` more times than in `prev` (i.e. just picked up). */
  private newPocketItems(prev: InventoryMsg, next: InventoryMsg): { kind: 'card' | 'pill'; id: number }[] {
    const out: { kind: 'card' | 'pill'; id: number }[] = [];
    const count = (list: number[]) => list.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<number, number>());
    const cardsBefore = count(prev.k ?? []);
    for (const [id, n] of count(next.k ?? [])) {
      for (let i = cardsBefore.get(id) ?? 0; i < n; i++) out.push({ kind: 'card', id });
    }
    const pillsBefore = count((prev.p ?? []).map(([c]) => c));
    for (const [color, n] of count((next.p ?? []).map(([c]) => c))) {
      const fx = (next.p ?? []).find(([c]) => c === color)?.[1];
      const effect = this.pillEffectForColor(color, fx);
      if (effect === null) continue;
      for (let i = pillsBefore.get(color) ?? 0; i < n; i++) out.push({ kind: 'pill', id: effect });
    }
    return out;
  }

  /** Pocket items: cards/pills keep their identity hidden until discovered. */
  private rebuildInventory(): void {
    const d = this.rawInv;
    if (!d) return;
    this.state.inventory = {
      collectibles: this.state.inventory.collectibles,
      actives: d.a.map(([slot, id, charge]) => ({ slot, id, charge })),
      trinkets: [...d.t],
      cards: (d.k ?? []).map((id) => ({ id })),
      pills: (d.p ?? []).map(([color, fx]) => ({ color, effect: this.pillEffectForColor(color, fx) })),
    };
  }
}

interface TrackedItem {
  key: number;
  kind: ItemKind;
  variant: number;
  /** Real SubType from the game (id / card / pill color); -1 if the game hides it. Never sent to clients. */
  trueSub: number;
  x: number;
  y: number;
  price: number;
  optionsIndex: number;
  quality?: number;
  name?: string;
  /** Pill effect, only when the game has identified that color. */
  fx?: number;
  revealed: boolean;
  distance: number | null;
  /** Wall time when first reported (to match drops). */
  spawnedAt: number;
}

const NO_HEALTH: Health = { red: 0, max: 0, soul: 0, black: 0, bone: 0, eternal: 0, golden: 0, rotten: 0, broken: 0, limit: 0 };

/** Max time between a pocket item disappearing and its floor entity appearing (and vice versa). */
const DROP_LINK_MS = 3000;

/** Cards compare by id; pills by color (ignoring the horse-pill flag). */
function sameSub(kind: 'card' | 'pill', a: number, b: number): boolean {
  return kind === 'card' ? a === b : (a & ~PILL_GIANT_FLAG) === (b & ~PILL_GIANT_FLAG);
}
