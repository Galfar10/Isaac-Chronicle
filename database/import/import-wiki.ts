/**
 * npm run import:wiki
 * Downloads item data + synergies from bindingofisaacrebirth.wiki.gg (CC BY-SA 4.0)
 * into database/seed/wiki.json (bundled with the Companion, attribution in README).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importWiki } from './wiki.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'wiki.json');
const data = await importWiki();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 1));
const byKind = data.items.reduce<Record<string, number>>((acc, i) => ((acc[i.kind] = (acc[i.kind] ?? 0) + 1), acc), {});
console.log(`wrote ${out}`);
console.log(`items by kind: ${JSON.stringify(byKind)}; synergy references: ${data.synergies.length}`);
