import type { ItemKind } from './state.js';

/** Item record as returned by GET /api/items/:kind/:id */
export interface ItemRecord {
  kind: ItemKind;
  id: number;
  name: string;
  nameEs: string | null;
  /** In-game pickup text ("Blood laser barrage"). */
  quote: string | null;
  quoteEs: string | null;
  /** Longer description (wiki). */
  description: string | null;
  quality: number | null;
  /** passive | active | familiar | trinket | card | rune | soul | pill ... */
  type: string | null;
  pools: string[];
  tags: string[];
  effects: string[];
  maxCharges: number | null;
  /** Stat-related cache flags from items.xml (damage, firedelay, range...). */
  statCaches: string[];
  transformations: { id: number; name: string }[];
  /** Relative URL to the local sprite (served by the companion) or remote fallback. */
  image: string | null;
  imageRemote: string | null;
  synergyCount: number;
  sources: { name: string; url: string | null; license: string | null }[];
  updatedAt: string;
}

export interface SynergyRecord {
  id: number;
  a: { kind: ItemKind; id: number; name: string; nameEs?: string | null };
  b: { kind: ItemKind; id: number; name: string; nameEs?: string | null };
  description: string;
  source: { name: string; url: string | null; license: string | null };
}

export interface ItemSearchResult {
  kind: ItemKind;
  id: number;
  name: string;
  nameEs: string | null;
  quality: number | null;
  quote: string | null;
  image: string | null;
}

export const ITEM_KINDS: readonly ItemKind[] = ['collectible', 'trinket', 'card', 'pill'];

export function itemRef(kind: ItemKind, id: number): string {
  return `${kind}:${id}`;
}
