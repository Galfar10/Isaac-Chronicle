import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { importGameResources } from '../../database/import/game.js';
import { normalize, type Overrides } from '../../database/import/normalize.js';
import type { ImportedDataset } from '../../database/import/types.js';
import { loadDataset } from '../../backend/src/db/loadDataset.js';
import type { Db } from '../../backend/src/db/database.js';

type Log = Pick<Console, 'info' | 'warn'>;

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
  } catch {
    return null;
  }
}

/** Newest of: user-updated wiki data (data dir) and bundled seed. */
export function wikiDatasetPath(seedDir: string, dataDir: string): string | null {
  const candidates = [join(dataDir, 'wiki.json'), join(seedDir, 'wiki.json')].filter(existsSync);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/**
 * Builds the reference data from every available source and (re)loads the DB when
 * the resulting dataset version changed. The mod is never involved: item data can
 * be corrected by updating these files only.
 */
export function ensureReferenceData(
  db: Db,
  opts: { seedDir: string; dataDir: string; resourcesDir: string | null; currentVersion: string | null },
  log: Log,
): { version: string; items: number; synergies: number; sources: string[] } {
  const datasets: ImportedDataset[] = [];
  const sources: string[] = [];
  const wikiPath = wikiDatasetPath(opts.seedDir, opts.dataDir);
  const wiki = wikiPath ? readJson<ImportedDataset>(wikiPath) : null;
  if (wiki) {
    datasets.push(wiki);
    sources.push(`wiki (${wiki.items.length} items, ${wiki.generatedAt.slice(0, 10)})`);
  }
  if (opts.resourcesDir) {
    try {
      const game = importGameResources(opts.resourcesDir);
      datasets.push(game);
      sources.push(`game files (${game.items.length} items)`);
    } catch (err) {
      log.warn(`[data] could not read game resources: ${(err as Error).message}`);
    }
  }
  const overrides = readJson<Overrides>(join(opts.seedDir, 'overrides.json')) ?? {};
  const data = normalize(datasets, overrides);
  if (data.version !== opts.currentVersion) {
    loadDataset(db, data);
    log.info(`[data] reference data loaded: ${data.items.length} items, ${data.synergies.length} synergies (v${data.version})`);
  }
  return { version: data.version, items: data.items.length, synergies: data.synergies.length, sources };
}
