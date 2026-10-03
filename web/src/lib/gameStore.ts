import { useEffect, useState, useSyncExternalStore } from 'react';
import { createInitialState, type DomainEvent, type GameState, type ItemKind, type ItemRecord, type ServerMessage } from '@irtc/protocol';
import { ConnectionManager, serverBase, wsUrl, type SocketStatus } from './connection';
import { fetchItem } from './api';

export interface ClientSnapshot {
  state: GameState;
  socket: SocketStatus;
  retryInMs: number | null;
  socketError: string | null;
  /** Wall time of the last message from the companion. */
  lastMessageAt: number | null;
  everConnected: boolean;
}

type Listener = () => void;
type EventListener = (events: DomainEvent[]) => void;

class GameStore {
  private snap: ClientSnapshot = {
    state: createInitialState(),
    socket: 'connecting',
    retryInMs: null,
    socketError: null,
    lastMessageAt: null,
    everConnected: false,
  };
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private conn: ConnectionManager | null = null;

  start(): void {
    if (this.conn) return;
    this.conn = new ConnectionManager({
      url: wsUrl(serverBase()),
      onMessage: (msg) => this.onMessage(msg),
      onStatus: (socket, info) => {
        this.set({
          socket,
          retryInMs: info.nextRetryMs,
          socketError: info.error,
          everConnected: this.snap.everConnected || socket === 'open',
        });
      },
    });
    this.conn.start();
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.type === 'welcome' || msg.type === 'update') {
      this.set({ state: msg.state, lastMessageAt: Date.now() });
      if (msg.type === 'update' && msg.events.length) for (const l of this.eventListeners) l(msg.events);
    } else {
      this.set({ lastMessageAt: Date.now() });
    }
  }

  private set(patch: Partial<ClientSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  onEvents(l: EventListener): () => void {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }

  get = () => this.snap;
}

export const gameStore = new GameStore();

export function useClient(): ClientSnapshot {
  return useSyncExternalStore(gameStore.subscribe, gameStore.get, gameStore.get);
}

export function useGameEvents(handler: EventListener, deps: unknown[] = []): void {
  useEffect(() => gameStore.onEvents(handler), deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Item metadata from the companion database (by game id). */
export function useItem(kind: ItemKind | null | undefined, id: number | null | undefined): { item: ItemRecord | null; loading: boolean } {
  const [res, setRes] = useState<{ key: string; item: ItemRecord | null } | null>(null);
  const key = kind && id !== null && id !== undefined ? `${kind}:${id}` : null;
  useEffect(() => {
    if (!kind || id === null || id === undefined) return;
    let alive = true;
    void fetchItem(kind, id).then((item) => alive && setRes({ key: `${kind}:${id}`, item }));
    return () => {
      alive = false;
    };
  }, [kind, id]);
  if (!key) return { item: null, loading: false };
  if (res?.key !== key) return { item: null, loading: true };
  return { item: res.item, loading: false };
}

/** Re-renders every `ms` (for "x s ago" labels). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
