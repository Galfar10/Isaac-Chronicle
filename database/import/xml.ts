/**
 * Tiny XML helpers for the game's flat data files (items.xml, pocketitems.xml...).
 * Those files are machine generated, one element per tag, attribute-only; a full
 * XML parser dependency is not needed.
 */

export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

/** All opening elements whose tag is in `tags` (case-insensitive). Comments are ignored. */
export function elements(xml: string, tags: string[]): XmlElement[] {
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  const out: XmlElement[] = [];
  for (const m of clean.matchAll(/<([A-Za-z_][\w.-]*)(\s[^<>]*?)?\/?>/g)) {
    if (!wanted.has(m[1].toLowerCase())) continue;
    out.push({ tag: m[1].toLowerCase(), attrs: parseAttrs(m[2] ?? '') });
  }
  return out;
}

/** Elements inside each <Pool Name="..."> block of itempools.xml. */
export function pools(xml: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of clean.matchAll(/<Pool\b([^>]*)>([\s\S]*?)<\/Pool>/gi)) {
    const name = parseAttrs(m[1]).Name ?? parseAttrs(m[1]).name;
    if (!name) continue;
    const ids = elements(m[2], ['item']).map((e) => Number(e.attrs.Id ?? e.attrs.id)).filter(Number.isFinite);
    out.set(name, ids);
  }
  return out;
}

/**
 * Parses stringtable.sta: category -> key -> strings by language name.
 * The <languages> header gives the column order ("Key" is index 0).
 */
export function parseStringTable(xml: string): Map<string, Map<string, Record<string, string>>> {
  const langs: string[] = [];
  for (const l of elements(xml.slice(0, 5000), ['language'])) {
    langs[Number(l.attrs.index)] = l.attrs.name;
  }
  const table = new Map<string, Map<string, Record<string, string>>>();
  for (const cat of xml.matchAll(/<category name="([^"]+)">([\s\S]*?)<\/category>/g)) {
    const keys = new Map<string, Record<string, string>>();
    for (const k of cat[2].matchAll(/<key name="([^"]+)">([\s\S]*?)<\/key>/g)) {
      const strings = [...k[2].matchAll(/<string>([\s\S]*?)<\/string>|<string\s*\/>/g)].map((s) => decodeEntities(s[1] ?? ''));
      const rec: Record<string, string> = {};
      strings.forEach((s, i) => {
        const lang = langs[i + 1];
        if (lang) rec[lang] = s;
      });
      keys.set(k[1], rec);
    }
    table.set(cat[1], keys);
  }
  return table;
}
