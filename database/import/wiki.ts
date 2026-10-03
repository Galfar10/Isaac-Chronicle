import type { ItemKind } from '@irtc/protocol';
import { cleanWikitext, firstInt, parseInfobox, parseSynergies, section, sectionBullets } from './wikitext.js';
import type { ImportedDataset, RawItem, RawSynergy, SourceRef } from './types.js';

export const WIKI_BASE = 'https://bindingofisaacrebirth.wiki.gg';
const API = `${WIKI_BASE}/api.php`;
export const WIKI_LICENSE = 'CC BY-SA 4.0';
const USER_AGENT = 'IsaacRealTimeCompanion-importer/0.1 (open-source fan tool; low request rate)';

const CATEGORIES: { title: string; kind: ItemKind }[] = [
  { title: 'Category:Collectibles', kind: 'collectible' },
  { title: 'Category:Trinkets', kind: 'trinket' },
  { title: 'Category:Cards', kind: 'card' },
  { title: 'Category:Runes', kind: 'card' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(params: Record<string, string>, attempt = 0): Promise<any> {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await sleep(2000 * (attempt + 1));
      return api(params, attempt + 1);
    }
    throw new Error(`wiki API ${res.status} for ${url}`);
  }
  return res.json();
}

async function categoryMembers(title: string): Promise<string[]> {
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  do {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: title, cmlimit: '500', cmnamespace: '0', ...cont });
    for (const m of j.query?.categorymembers ?? []) titles.push(m.title);
    cont = j.continue ?? {};
    await sleep(300);
  } while (Object.keys(cont).length);
  return titles;
}

interface Page {
  title: string;
  content: string;
  revid: number | null;
  image: string | null;
}

async function fetchPages(titles: string[], log: (s: string) => void): Promise<Page[]> {
  const pages: Page[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await api({
      action: 'query',
      prop: 'revisions|pageimages',
      rvprop: 'content|ids',
      rvslots: 'main',
      piprop: 'original',
      redirects: '1',
      titles: batch.join('|'),
    });
    for (const p of j.query?.pages ?? []) {
      const rev = p.revisions?.[0];
      if (!rev) continue;
      pages.push({
        title: p.title,
        content: rev.slots?.main?.content ?? '',
        revid: rev.revid ?? null,
        image: p.original?.source ?? null,
      });
    }
    log(`  fetched ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(400);
  }
  return pages;
}

function kindFromInfobox(type: string): ItemKind | null {
  if (type.includes('collectible')) return 'collectible';
  if (type.includes('trinket')) return 'trinket';
  if (type.includes('card') || type.includes('rune') || type.includes('soul') || type.includes('object')) return 'card';
  return null;
}

function typeFromInfobox(type: string): string | undefined {
  if (type.includes('activated') || type.includes('active')) return 'active';
  if (type.includes('familiar')) return 'familiar';
  if (type.includes('passive')) return 'passive';
  if (type.includes('trinket')) return 'trinket';
  if (type.includes('rune')) return 'rune';
  if (type.includes('card')) return 'card';
  return undefined;
}

/** Wiki icon naming convention: "Collectible <Name> icon.png" / "Trinket <Name> icon.png" ("/" becomes " "). */
export function iconUrl(kind: ItemKind, name: string): string | undefined {
  const prefix = kind === 'collectible' ? 'Collectible' : kind === 'trinket' ? 'Trinket' : null;
  if (!prefix) return undefined;
  const file = `${prefix} ${name.replace(/\//g, ' ')} icon.png`.replace(/ /g, '_');
  return `${WIKI_BASE}/wiki/Special:FilePath/${encodeURIComponent(file)}`;
}

export function pageUrl(title: string): string {
  return `${WIKI_BASE}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** Parses one wiki page into an item + its synergies. Exported for tests. */
export function parseWikiPage(page: { title: string; content: string; image?: string | null }): { item: RawItem; synergies: RawSynergy[] } | null {
  if (/^#redirect/i.test(page.content.trim())) return null;
  const box = parseInfobox(page.content);
  if (!box) return null;
  const kind = kindFromInfobox(box.type);
  if (!kind) return null;
  const id = firstInt(box.params.id);
  if (id === undefined || id <= 0) return null;
  const source: SourceRef = { name: 'wiki', url: pageUrl(page.title), license: WIKI_LICENSE };
  const quality = firstInt(box.params.quality);
  const tags = cleanWikitext(box.params.tags ?? '').split(/[\s,]+/).filter(Boolean);
  const pools = cleanWikitext(box.params.pool ?? box.params.pools ?? '')
    .split(/,/)
    .map((s) => s.trim())
    .filter(Boolean);
  const item: RawItem = {
    kind,
    id,
    name: cleanWikitext(box.params.name ?? '') || page.title,
    quote: cleanWikitext(box.params.quote ?? '') || undefined,
    description: cleanWikitext(box.params.description ?? '') || undefined,
    quality: kind === 'collectible' && quality !== undefined && quality >= 0 && quality <= 4 ? quality : undefined,
    type: typeFromInfobox(box.type),
    tags,
    pools: pools.length ? pools : undefined,
    effects: sectionBullets(section(page.content, ['Effects', 'Effect']), 8),
    imageRemote: page.image ?? iconUrl(kind, cleanWikitext(box.params.name ?? '') || page.title),
    source,
  };
  const synergies: RawSynergy[] = [];
  if (kind === 'collectible' || kind === 'trinket') {
    for (const s of parseSynergies(section(page.content, ['Synergies']))) {
      for (const partner of s.partners) {
        synergies.push({ a: { kind, id }, b: { kind: partner.kind, name: partner.name }, description: s.description, source });
      }
    }
  }
  return { item, synergies };
}

export async function importWiki(log: (s: string) => void = console.log): Promise<ImportedDataset> {
  const titles = new Map<string, ItemKind>();
  for (const c of CATEGORIES) {
    const members = await categoryMembers(c.title);
    log(`${c.title}: ${members.length} pages`);
    for (const t of members) if (!titles.has(t)) titles.set(t, c.kind);
  }
  const pages = await fetchPages([...titles.keys()], log);
  const items: RawItem[] = [];
  const synergies: RawSynergy[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const parsed = parseWikiPage(page);
    if (!parsed) continue;
    const key = `${parsed.item.kind}:${parsed.item.id}`;
    if (seen.has(key)) continue; // e.g. "0 - The Fool" and "0 - The Fool?" style duplicates
    seen.add(key);
    items.push(parsed.item);
    synergies.push(...parsed.synergies);
  }
  log(`parsed ${items.length} items, ${synergies.length} synergy references`);
  return { generatedAt: new Date().toISOString(), source: 'wiki', items, synergies, characters: [], transformations: [] };
}
