import { createHash } from 'node:crypto';
import type {
  ImportedDataset,
  NormalizedDataset,
  NormalizedItem,
  NormalizedSynergy,
  RawCharacter,
  RawItem,
  RawTransformation,
} from './types.js';

/** Manual corrections, applied last (database/seed/overrides.json). */
export interface Overrides {
  items?: (Partial<RawItem> & { kind: RawItem['kind']; id: number })[];
  synergies?: { a: { kind: RawItem['kind']; id: number }; b: { kind: RawItem['kind']; id: number }; description: string; sourceUrl?: string }[];
}

export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9?!]+/g, ' ')
    .trim();
}

const firstDefined = <T>(...vals: (T | undefined | null)[]): T | undefined => vals.find((v) => v !== undefined && v !== null && v !== '') as T | undefined;
const nonEmpty = <T>(...lists: (T[] | undefined)[]): T[] => lists.find((l) => l && l.length) ?? [];

/**
 * Merges datasets. Precedence per field:
 *  - game files (authoritative, matches the user's game version): names, quote, quality, tags, type, pools, sprite
 *  - wiki (CC BY-SA 4.0): long description, effects, synergies, remote image; fallback for everything else
 *  - overrides: manual fixes, highest priority
 */
export function normalize(datasets: ImportedDataset[], overrides: Overrides = {}): NormalizedDataset {
  const game = datasets.filter((d) => d.source === 'game');
  const wiki = datasets.filter((d) => d.source === 'wiki');
  const byKey = (list: ImportedDataset[]) => {
    const map = new Map<string, RawItem>();
    for (const d of list) for (const i of d.items) map.set(`${i.kind}:${i.id}`, i);
    return map;
  };
  const g = byKey(game);
  const w = byKey(wiki);
  const keys = new Set([...g.keys(), ...w.keys()]);
  const items: NormalizedItem[] = [];
  for (const key of keys) {
    const a = g.get(key);
    const b = w.get(key);
    const base = (a ?? b)!;
    const name = firstDefined(a?.name, b?.name);
    if (!name) continue;
    items.push({
      kind: base.kind,
      id: base.id,
      name,
      nameEs: firstDefined(a?.nameEs, b?.nameEs) ?? null,
      quote: firstDefined(a?.quote, b?.quote) ?? null,
      quoteEs: firstDefined(a?.quoteEs, b?.quoteEs) ?? null,
      description: firstDefined(b?.description, a?.description) ?? null,
      quality: firstDefined(a?.quality, b?.quality) ?? null,
      type: firstDefined(a?.type, b?.type) ?? null,
      maxCharges: firstDefined(a?.maxCharges, b?.maxCharges) ?? null,
      gfx: firstDefined(a?.gfx, b?.gfx) ?? null,
      imageRemote: firstDefined(b?.imageRemote, a?.imageRemote) ?? null,
      pools: nonEmpty(a?.pools, b?.pools),
      tags: nonEmpty(a?.tags, b?.tags),
      effects: nonEmpty(b?.effects, a?.effects),
      statCaches: nonEmpty(a?.statCaches, b?.statCaches),
      sources: [a?.source, b?.source].filter((s): s is NonNullable<typeof s> => !!s),
    });
  }

  for (const o of overrides.items ?? []) {
    const item = items.find((i) => i.kind === o.kind && i.id === o.id);
    if (!item) continue;
    const { kind: _k, id: _i, source: _s, ...rest } = o;
    Object.assign(item, rest);
    if (!item.sources.some((s) => s.name === 'manual')) item.sources.push({ name: 'manual', url: null, license: null });
  }
  items.sort((x, y) => (x.kind === y.kind ? x.id - y.id : x.kind.localeCompare(y.kind)));

  // Resolve synergy partners by name.
  const nameIndex = new Map<string, NormalizedItem>();
  for (const i of items) {
    nameIndex.set(`${i.kind}:${normName(i.name)}`, i);
  }
  for (const d of wiki) {
    for (const i of d.items) {
      const n = items.find((x) => x.kind === i.kind && x.id === i.id);
      if (n && i.name) nameIndex.set(`${i.kind}:${normName(i.name)}`, n);
    }
  }
  const synergies: NormalizedSynergy[] = [];
  const seen = new Set<string>();
  for (const d of datasets) {
    for (const s of d.synergies) {
      const partner = s.b.id !== undefined ? items.find((i) => i.kind === s.b.kind && i.id === s.b.id) : nameIndex.get(`${s.b.kind}:${normName(s.b.name)}`);
      if (!partner) continue;
      if (partner.kind === s.a.kind && partner.id === s.a.id) continue; // "duplicate copy" notes, not a synergy
      const key = `${s.a.kind}:${s.a.id}|${partner.kind}:${partner.id}|${s.description}`;
      if (seen.has(key)) continue;
      seen.add(key);
      synergies.push({ a: s.a, b: { kind: partner.kind, id: partner.id }, description: s.description, source: s.source });
    }
  }
  for (const o of overrides.synergies ?? []) {
    synergies.push({ a: o.a, b: o.b, description: o.description, source: { name: 'manual', url: o.sourceUrl ?? null, license: null } });
  }

  const characters = new Map<number, RawCharacter>();
  const transformations = new Map<number, RawTransformation>();
  for (const d of datasets) {
    for (const c of d.characters) characters.set(c.id, c);
    for (const t of d.transformations) transformations.set(t.id, t);
  }

  const version = createHash('sha1')
    .update(JSON.stringify({ items, synergies, c: [...characters.values()], t: [...transformations.values()] }))
    .digest('hex')
    .slice(0, 12);

  return {
    version,
    items,
    synergies,
    characters: [...characters.values()].sort((a, b) => a.id - b.id),
    transformations: [...transformations.values()].sort((a, b) => a.id - b.id),
  };
}
