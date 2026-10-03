/**
 * Wikitext helpers for bindingofisaacrebirth.wiki.gg (content licensed CC BY-SA 4.0).
 *
 * DLC markers: the wiki annotates text with {{dlc|code}}. Codes containing "nr"
 * (e.g. "nr", "anr", "a+nr", "nr+") mean "removed in Repentance(+)": that text does
 * not apply to the current game and is dropped.
 */

export function isRemovedInRepentance(code: string | undefined): boolean {
  return !!code && /nr/i.test(code.trim());
}

/** Finds the template starting at `start` ("{{") and returns its end index (after "}}"). */
export function matchBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i++;
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/** Splits template parameters on top-level "|" (ignoring nested {{ }} and [[ ]]). */
export function splitTopLevel(body: string, sep = '|'): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if (two === '}}' || two === ']]') {
      depth--;
      cur += two;
      i++;
      continue;
    }
    if (body[i] === sep && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += body[i];
  }
  out.push(cur);
  return out;
}

export interface Infobox {
  type: string;
  params: Record<string, string>;
}

export function parseInfobox(wikitext: string): Infobox | null {
  const m = /\{\{\s*infobox\s+([^|\n}]+)/i.exec(wikitext);
  if (!m) return null;
  const end = matchBraces(wikitext, m.index);
  const body = wikitext.slice(m.index + 2, end - 2);
  const parts = splitTopLevel(body);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return { type: m[1].trim().toLowerCase(), params };
}

/** Text of a "== Title ==" section (level 2), without the heading. */
export function section(wikitext: string, titles: string[]): string | null {
  const re = /^==\s*([^=].*?)\s*==\s*$/gm;
  const heads = [...wikitext.matchAll(re)];
  for (let i = 0; i < heads.length; i++) {
    if (!titles.some((t) => t.toLowerCase() === heads[i][1].toLowerCase())) continue;
    const start = heads[i].index! + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : wikitext.length;
    return wikitext.slice(start, end);
  }
  return null;
}

/** Resolves {{dlcalt|base|r=..|r+=..}} to the most recent value. */
function dlcAlt(params: string[]): string {
  const named: Record<string, string> = {};
  let base = '';
  for (const p of params) {
    const eq = p.indexOf('=');
    if (eq > 0 && /^[a-z+]+$/i.test(p.slice(0, eq).trim())) named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1);
    else if (!base) base = p;
  }
  return named['r+'] ?? named.r ?? base;
}

const LINK_TEMPLATES = new Set(['i', 't', 'c', 'e', 's', 'p', 'card', 'rune', 'pill', 'item', 'trinket', 'b', 'chara', 'r', 'cu', 'pi']);

/** Drops text that only applied before Repentance, based on inline {{dlc|...}} markers. */
export function filterDlcSegments(text: string): string {
  const re = /\{\{\s*dlc([+-]?)\s*(?:\|\s*([^}]*))?\}\}/gi;
  let out = '';
  let keep = true;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (keep) out += text.slice(last, m.index);
    last = m.index! + m[0].length;
    if (m[1] === '-') keep = true;
    else keep = !isRemovedInRepentance(m[2]);
  }
  if (keep) out += text.slice(last);
  return out;
}

/** Converts wikitext to readable plain text. */
export function cleanWikitext(input: string): string {
  let text = filterDlcSegments(input);
  text = text.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, ' ');
  // Templates, innermost first.
  for (let guard = 0; guard < 20 && text.includes('{{'); guard++) {
    const before = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_m, body: string) => {
      const parts = body.split('|').map((s) => s.trim());
      const name = parts[0].toLowerCase();
      if (name === 'dlcalt') return dlcAlt(parts.slice(1));
      if (name === 'transformation contribution') return `Counts toward the ${parts[1] ?? ''} transformation.`;
      if (LINK_TEMPLATES.has(name)) return parts[1] ?? '';
      if (name === 'tooltip' || name === 'hover') return parts[1] ?? '';
      if (/^(?:tears|damage|speed|range|luck|shot speed)$/i.test(parts[0])) return parts[0];
      return '';
    });
    if (text === before) break;
  }
  text = text.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, (_m, l: string) => l.replace(/#.*/, ''));
  text = text.replace(/'''?/g, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s+([.,:;])/g, '$1');
  return text.trim();
}

export interface Bullet {
  depth: number;
  raw: string;
}

export function bullets(sectionText: string): Bullet[] {
  const out: Bullet[] = [];
  for (const line of sectionText.split('\n')) {
    const m = /^(\*+)\s*(.*)$/.exec(line);
    if (m) out.push({ depth: m[1].length, raw: m[2] });
  }
  return out;
}

/** Top-level bullets of a section with their sub-bullets folded in, cleaned, removed-DLC lines skipped. */
export function sectionBullets(sectionText: string | null, max = 10): string[] {
  if (!sectionText) return [];
  const out: string[] = [];
  for (const b of bullets(sectionText)) {
    if (b.depth !== 1) continue;
    const lead = /^\{\{\s*dlc\s*\|\s*([^}]*)\}\}/i.exec(b.raw);
    if (lead && isRemovedInRepentance(lead[1])) continue;
    const text = cleanWikitext(b.raw);
    if (text.length > 2) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export interface SynergyRef {
  kind: 'collectible' | 'trinket';
  name: string;
}

export interface ParsedSynergy {
  partners: SynergyRef[];
  description: string;
}

/**
 * Parses "== Synergies ==" bullets of the form
 *   * {{I|Partner}} / {{T|Other}}: description
 *   ** detail
 */
export function parseSynergies(sectionText: string | null): ParsedSynergy[] {
  if (!sectionText) return [];
  const list = bullets(sectionText);
  const out: ParsedSynergy[] = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.depth !== 1) continue;
    const lead = /^\{\{\s*dlc\s*\|\s*([^}]*)\}\}\s*/i.exec(b.raw);
    if (lead && isRemovedInRepentance(lead[1])) continue;
    const raw = lead ? b.raw.slice(lead[0].length) : b.raw;
    // Split "refs: description" on the first top-level colon.
    let depth = 0;
    let colon = -1;
    for (let j = 0; j < raw.length; j++) {
      const two = raw.slice(j, j + 2);
      if (two === '{{' || two === '[[') {
        depth++;
        j++;
      } else if (two === '}}' || two === ']]') {
        depth--;
        j++;
      } else if (raw[j] === ':' && depth === 0) {
        colon = j;
        break;
      }
    }
    if (colon < 0) continue;
    const refsPart = raw.slice(0, colon);
    const partners: SynergyRef[] = [];
    for (const m of refsPart.matchAll(/\{\{\s*([IiTt])\s*\|([^}|]+)(?:\|([^}]*))?\}\}/g)) {
      if (isRemovedInRepentance(m[3])) continue;
      partners.push({ kind: m[1].toLowerCase() === 't' ? 'trinket' : 'collectible', name: m[2].trim() });
    }
    if (!partners.length) continue;
    const parts = [cleanWikitext(raw.slice(colon + 1))];
    for (let k = i + 1; k < list.length && list[k].depth > 1; k++) {
      if (list[k].depth !== 2) continue;
      const sub = /^\{\{\s*dlc\s*\|\s*([^}]*)\}\}/i.exec(list[k].raw);
      if (sub && isRemovedInRepentance(sub[1])) continue;
      const t = cleanWikitext(list[k].raw);
      if (t) parts.push(t);
    }
    let description = parts.filter(Boolean).join(' ');
    if (description.length > 700) description = description.slice(0, 697).replace(/\s+\S*$/, '') + '…';
    if (description.length < 3) continue;
    out.push({ partners, description });
  }
  return out;
}

/** First integer in a (possibly templated) value. */
export function firstInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = cleanWikitext(value);
  const m = /-?\d+/.exec(cleaned);
  return m ? Number(m[0]) : undefined;
}
