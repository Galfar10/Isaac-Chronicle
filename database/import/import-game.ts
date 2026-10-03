/**
 * npm run import:game [-- <path to extracted resources>]
 * Reads the user's own extracted game files (official ResourceExtractor output) and
 * writes database/local/game.json (git-ignored: game text is not redistributed).
 * The Companion does this automatically at startup; this script is for inspection.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExtractedResources, findGameDir } from '../../bridge/src/paths.js';
import { importGameResources } from './game.js';

const dir = process.argv[2] ?? findExtractedResources(findGameDir(process.env.IRTC_GAME_DIR));
if (!dir) {
  console.error('Extracted resources not found. Run tools/ResourceExtractor in the game folder, or pass the path.');
  process.exit(1);
}
const data = importGameResources(dir);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'local', 'game.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 1));
const byKind = data.items.reduce<Record<string, number>>((acc, i) => ((acc[i.kind] = (acc[i.kind] ?? 0) + 1), acc), {});
console.log(`source: ${dir}`);
console.log(`items by kind: ${JSON.stringify(byKind)}; characters: ${data.characters.length}; transformations: ${data.transformations.length}`);
console.log(`wrote ${out}`);
