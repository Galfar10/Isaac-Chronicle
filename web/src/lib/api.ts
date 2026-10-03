import type { ItemKind, ItemRecord, ItemSearchResult, SynergyRecord } from '@irtc/protocol';
import { serverBase } from './connection';

const base = serverBase();
const itemCache = new Map<string, Promise<ItemRecord | null>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(base + path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}

/** Item info by game id. Cached; unknown items resolve to null (never throw). */
export function fetchItem(kind: ItemKind, id: number): Promise<ItemRecord | null> {
  const key = `${kind}:${id}`;
  let p = itemCache.get(key);
  if (!p) {
    p = getJson<ItemRecord>(`/api/items/${kind}/${id}`).catch((err) => {
      if ((err as { status?: number }).status !== 404) itemCache.delete(key); // retry later on network errors
      return null;
    });
    itemCache.set(key, p);
  }
  return p;
}

export function peekItemCache(kind: ItemKind, id: number): Promise<ItemRecord | null> | undefined {
  return itemCache.get(`${kind}:${id}`);
}

export function fetchSynergiesAmong(refs: { kind: ItemKind; id: number }[]): Promise<SynergyRecord[]> {
  if (refs.length < 2) return Promise.resolve([]);
  const q = refs.map((r) => `${r.kind}:${r.id}`).join(',');
  return getJson<SynergyRecord[]>(`/api/synergies?items=${encodeURIComponent(q)}`).catch(() => []);
}

export function fetchSynergiesFor(kind: ItemKind, id: number): Promise<SynergyRecord[]> {
  return getJson<SynergyRecord[]>(`/api/synergies/${kind}/${id}`).catch(() => []);
}

export function searchItems(q: string): Promise<ItemSearchResult[]> {
  return getJson<ItemSearchResult[]>(`/api/items/search?q=${encodeURIComponent(q)}&limit=12`).catch(() => []);
}

export function fetchCharacters(): Promise<{ id: number; name: string; nameEs: string | null }[]> {
  return getJson<{ id: number; name: string; nameEs: string | null }[]>('/api/characters').catch(() => []);
}

export function fetchTransformations(): Promise<{ id: number; name: string; nameEs: string | null }[]> {
  return getJson<{ id: number; name: string; nameEs: string | null }[]>('/api/transformations').catch(() => []);
}

export interface LanStatus {
  available: boolean;
  enabled: boolean;
  addresses: string[];
  urls: string[];
}

/** Mobile mode (only answered on the PC that runs the Companion). */
export function fetchLan(): Promise<LanStatus | null> {
  return getJson<LanStatus>('/api/lan').catch(() => null);
}

export async function setLan(enabled: boolean): Promise<LanStatus | null> {
  try {
    const res = await fetch(base + '/api/lan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return res.ok ? ((await res.json()) as LanStatus) : null;
  } catch {
    return null;
  }
}

export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('/') ? base + path : path;
}
