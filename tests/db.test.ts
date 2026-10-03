import { describe, expect, it } from 'vitest';
import { createInitialState } from '@irtc/protocol';
import { migrate, readMigrations } from '../backend/src/db/database';
import { Repository } from '../backend/src/db/repository';
import { MIGRATIONS, testDb } from './helpers';

describe('database', () => {
  it('migrations are idempotent', () => {
    const { db } = testDb();
    expect(migrate(db, readMigrations(MIGRATIONS))).toEqual([]);
  });

  it('looks items up by game id', () => {
    const { repo } = testDb();
    const brim = repo.getItem('collectible', 118)!;
    expect(brim).toMatchObject({ name: 'Brimstone', nameEs: 'Azufre', quality: 4, quote: 'Blood laser barrage', synergyCount: 1 });
    expect(brim.tags).toEqual(['devil', 'offensive']);
    expect(brim.transformations).toEqual([{ id: 8, name: 'Leviathan!' }]);
    expect(brim.sources[0].license).toBe('CC BY-SA 4.0');
    expect(repo.getItem('collectible', 99999)).toBeNull();
    expect(repo.getItem('trinket', 1)?.name).toBe('Swallowed Penny');
  });

  it('only exposes local sprites when available', () => {
    const { db } = testDb();
    expect(new Repository(db, { localImages: () => false }).getItem('collectible', 118)?.image).toBeNull();
    expect(new Repository(db, { localImages: () => true }).getItem('collectible', 118)?.image).toBe(
      '/gfx/collectibles/Collectibles_118_Brimstone.png',
    );
  });

  it('searches by English or Spanish name, accents ignored', () => {
    const { repo } = testDb();
    expect(repo.search('brim', null).map((r) => r.id)).toEqual([118]);
    expect(repo.search('azufre', null).map((r) => r.id)).toEqual([118]);
    expect(repo.search('champinon', null).map((r) => r.id)).toEqual([12]);
    expect(repo.search('mom', 'collectible')[0].name).toBe("Mom's Knife");
    expect(repo.search('penny', 'collectible')).toEqual([]);
  });

  it('finds synergies among owned items only', () => {
    const { repo } = testDb();
    expect(repo.synergiesAmong([{ kind: 'collectible', id: 118 }])).toEqual([]);
    const s = repo.synergiesAmong([
      { kind: 'collectible', id: 118 },
      { kind: 'collectible', id: 114 },
      { kind: 'collectible', id: 4 },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ a: { name: 'Brimstone' }, b: { name: "Mom's Knife" } });
    expect(repo.synergiesFor('collectible', 114)).toHaveLength(1);
  });

  it('persists runs and their timeline anonymously', () => {
    const { repo } = testDb();
    const state = createInitialState();
    state.run = {
      id: 'run-1',
      startedAt: Date.now(),
      continued: false,
      seed: 'ABCD 1234',
      difficulty: 0,
      challenge: 0,
      greed: false,
      character: { type: 0, name: 'Isaac', tainted: false },
      floor: null,
      frame: 0,
      time: 0,
      status: 'playing',
    };
    repo.upsertRun(state.run);
    repo.insertRunEvents('run-1', [
      { seq: 1, type: 'run_started', time: 0, wallTime: Date.now(), floor: null, roomIndex: null },
      { seq: 2, type: 'item_picked', time: 61, wallTime: Date.now(), floor: 'Basement I', roomIndex: 45, itemId: 118, itemKind: 'collectible' },
    ]);
    expect(repo.findResumableRun('ABCD 1234', 0)).toEqual({ id: 'run-1' });
    expect(repo.findResumableRun('OTHER', 0)).toBeNull();
    expect(repo.runEvents('run-1').map((e) => [e.type, e.itemId])).toEqual([
      ['run_started', undefined],
      ['item_picked', 118],
    ]);
    expect(repo.listRuns()[0]).toMatchObject({ id: 'run-1', seed: 'ABCD 1234', status: 'playing' });
  });
});
