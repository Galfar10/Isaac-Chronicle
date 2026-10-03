/**
 * npm run db:build [-- <output.sqlite>]
 * Builds a database from all available sources (seed + local game files) and prints a summary.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExtractedResources, findGameDir } from '../../bridge/src/paths.js';
import { migrate, openDatabase, readMigrations } from '../../backend/src/db/database.js';
import { Repository } from '../../backend/src/db/repository.js';
import { ensureReferenceData } from '../../companion/src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] ?? join(root, 'data', 'companion.sqlite');
const db = openDatabase(out);
migrate(db, readMigrations(join(root, 'database', 'migrations')));
const repo = new Repository(db);
const res = ensureReferenceData(
  db,
  {
    seedDir: join(root, 'database', 'seed'),
    dataDir: join(root, 'data'),
    resourcesDir: findExtractedResources(findGameDir(process.env.IRTC_GAME_DIR)),
    currentVersion: null,
  },
  console,
);
console.log(`database: ${out}`);
console.log(`sources: ${res.sources.join(' + ') || 'none'}`);
console.log(`items: ${res.items}, synergies: ${res.synergies}, version: ${res.version}`);
const sample = repo.getItem('collectible', 118);
if (sample) console.log(`sample #118: ${sample.name} (Q${sample.quality}) — ${sample.quote}; synergies: ${sample.synergyCount}`);
db.close();
