import { join } from 'node:path';
import { migrate, openDatabase, readMigrations } from '../backend/src/db/database';
import { loadDataset } from '../backend/src/db/loadDataset';
import { Repository } from '../backend/src/db/repository';
import type { NormalizedDataset, NormalizedItem } from '../database/import/types';

export const MIGRATIONS = join(__dirname, '..', 'database', 'migrations');

const src = { name: 'wiki' as const, url: 'https://example.invalid/wiki', license: 'CC BY-SA 4.0' };

function item(kind: NormalizedItem['kind'], id: number, name: string, extra: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    kind,
    id,
    name,
    nameEs: null,
    quote: null,
    quoteEs: null,
    description: null,
    quality: null,
    type: null,
    maxCharges: null,
    gfx: null,
    imageRemote: null,
    pools: [],
    tags: [],
    effects: [],
    statCaches: [],
    sources: [src],
    ...extra,
  };
}

export const FIXTURE: NormalizedDataset = {
  version: 'test-1',
  items: [
    item('collectible', 118, 'Brimstone', {
      nameEs: 'Azufre',
      quote: 'Blood laser barrage',
      quality: 4,
      type: 'passive',
      tags: ['devil', 'offensive'],
      effects: ['Tears are replaced with a blood laser.'],
      gfx: 'collectibles/Collectibles_118_Brimstone.png',
    }),
    item('collectible', 114, "Mom's Knife", { quality: 4, tags: ['mom'] }),
    item('collectible', 4, "Cricket's Head", { quality: 4 }),
    item('collectible', 12, 'Magic Mushroom', { quality: 4, nameEs: 'Champiñón mágico' }),
    item('trinket', 1, 'Swallowed Penny', { quote: 'Gulp!' }),
  ],
  synergies: [
    { a: { kind: 'collectible', id: 118 }, b: { kind: 'collectible', id: 114 }, description: 'Knife + laser behaviour.', source: src },
    { a: { kind: 'collectible', id: 4 }, b: { kind: 'collectible', id: 12 }, description: 'Damage multipliers do not stack.', source: src },
  ],
  characters: [{ id: 0, name: 'Isaac', nameEs: 'Isaac', tainted: false }],
  transformations: [
    { id: 6, name: 'Yes Mother?', tag: 'mom', required: 3 },
    { id: 8, name: 'Leviathan!', tag: 'devil', required: 3 },
  ],
};

export function testDb() {
  const db = openDatabase(':memory:');
  migrate(db, readMigrations(MIGRATIONS));
  loadDataset(db, FIXTURE);
  return { db, repo: new Repository(db) };
}
