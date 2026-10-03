import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTainted } from '@irtc/protocol';
import { elements, parseStringTable, pools as parsePools } from './xml.js';
import type { ImportedDataset, RawCharacter, RawItem, RawTransformation, SourceRef } from './types.js';

/**
 * Imports authoritative data from the user's own game files, extracted with the
 * official ResourceExtractor tool (Steam/.../The Binding of Isaac Rebirth/tools).
 * Nothing is redistributed: this runs locally on the user's machine.
 */

const SOURCE: SourceRef = { name: 'game', url: null, license: null };

function read(dir: string, file: string): string | null {
  const p = join(dir, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

type StringTable = ReturnType<typeof parseStringTable>;

function lookup(table: StringTable | null, categories: string[], rawKey: string | undefined) {
  if (!rawKey) return { en: undefined, es: undefined };
  if (!rawKey.startsWith('#')) return { en: rawKey, es: undefined }; // literal (not localized)
  const key = rawKey.slice(1);
  for (const c of categories) {
    const rec = table?.get(c)?.get(key);
    if (rec) return { en: rec.English || undefined, es: rec.Spanish || undefined };
  }
  return { en: undefined, es: undefined };
}

function splitList(s: string | undefined): string[] {
  return (s ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

export function importGameResources(resourcesDir: string): ImportedDataset {
  const itemsXml = read(resourcesDir, 'items.xml');
  if (!itemsXml) throw new Error(`items.xml not found in ${resourcesDir}`);
  const metaXml = read(resourcesDir, 'items_metadata.xml') ?? '';
  const poolsXml = read(resourcesDir, 'itempools.xml') ?? '';
  const pocketXml = read(resourcesDir, 'pocketitems.xml') ?? '';
  const playersXml = read(resourcesDir, 'players.xml') ?? '';
  const formsXml = read(resourcesDir, 'playerforms.xml') ?? '';
  const staXml = read(resourcesDir, 'stringtable.sta');
  const table = staXml ? parseStringTable(staXml) : null;

  // Quality + tags
  const meta = new Map<string, { quality?: number; tags: string[] }>();
  for (const e of elements(metaXml, ['item', 'trinket'])) {
    const kind = e.tag === 'item' ? 'collectible' : 'trinket';
    meta.set(`${kind}:${e.attrs.id}`, {
      quality: e.attrs.quality !== undefined ? Number(e.attrs.quality) : undefined,
      tags: splitList(e.attrs.tags),
    });
  }

  // Pools (collectibles only)
  const poolsById = new Map<number, string[]>();
  for (const [pool, ids] of parsePools(poolsXml)) {
    for (const id of ids) {
      const list = poolsById.get(id) ?? [];
      if (!list.includes(pool)) list.push(pool);
      poolsById.set(id, list);
    }
  }

  const items: RawItem[] = [];
  for (const e of elements(itemsXml, ['passive', 'active', 'familiar', 'trinket'])) {
    const id = Number(e.attrs.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const kind = e.tag === 'trinket' ? 'trinket' : 'collectible';
    const name = lookup(table, ['Items'], e.attrs.name);
    const quote = lookup(table, ['Items'], e.attrs.description);
    const m = meta.get(`${kind}:${id}`);
    items.push({
      kind,
      id,
      name: name.en,
      nameEs: name.es,
      quote: quote.en,
      quoteEs: quote.es,
      quality: kind === 'collectible' ? m?.quality : undefined,
      type: e.tag,
      maxCharges: e.attrs.maxcharges !== undefined ? Number(e.attrs.maxcharges) : undefined,
      gfx: e.attrs.gfx ? `${kind === 'trinket' ? 'trinkets' : 'collectibles'}/${e.attrs.gfx}` : undefined,
      pools: kind === 'collectible' ? (poolsById.get(id) ?? []) : undefined,
      tags: m?.tags ?? [],
      statCaches: splitList(e.attrs.cache),
      source: SOURCE,
    });
  }

  // Cards / runes / soul stones / objects
  for (const e of elements(pocketXml, ['card'])) {
    const id = Number(e.attrs.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const name = lookup(table, ['PocketItems'], e.attrs.name);
    const quote = lookup(table, ['PocketItems'], e.attrs.description);
    items.push({
      kind: 'card',
      id,
      name: name.en,
      nameEs: name.es,
      quote: quote.en,
      quoteEs: quote.es,
      type: e.attrs.type,
      source: SOURCE,
    });
  }
  // Pill effects (id = PillEffect)
  for (const e of elements(pocketXml, ['pilleffect'])) {
    const id = Number(e.attrs.id);
    if (!Number.isFinite(id)) continue;
    const name = lookup(table, ['PocketItems'], e.attrs.name);
    items.push({
      kind: 'pill',
      id,
      name: name.en,
      nameEs: name.es,
      type: e.attrs.class ? `pill ${e.attrs.class}` : 'pill',
      source: SOURCE,
    });
  }

  const characters: RawCharacter[] = [];
  for (const e of elements(playersXml, ['player'])) {
    const id = Number(e.attrs.id);
    if (!Number.isFinite(id)) continue;
    const name = lookup(table, ['Players'], e.attrs.name);
    if (!name.en) continue;
    characters.push({ id, name: name.en, nameEs: name.es, tainted: isTainted(id) });
  }

  const transformations: RawTransformation[] = [];
  for (const e of elements(formsXml, ['form'])) {
    const id = Number(e.attrs.id);
    const name = lookup(table, ['Default', 'Items', 'Players'], e.attrs.name);
    if (!Number.isFinite(id) || !name.en) continue;
    transformations.push({ id, name: name.en, nameEs: name.es, tag: e.attrs.tags || undefined, required: e.attrs.tags ? 3 : undefined });
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'game',
    items: items.filter((i) => i.name),
    synergies: [],
    characters,
    transformations,
  };
}
