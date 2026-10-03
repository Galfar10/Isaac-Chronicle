import type { NormalizedDataset } from '../../../database/import/types.js';
import { normName } from '../../../database/import/normalize.js';
import { transaction, type Db } from './database.js';

/**
 * Replaces the reference data (items, synergies, characters, transformations) with a
 * normalized dataset. Run history tables are untouched.
 */
export function loadDataset(db: Db, data: NormalizedDataset): void {
  const now = new Date().toISOString();
  transaction(db, () => {
    for (const t of ['items', 'item_effects', 'item_tags', 'item_sources', 'synergies', 'item_synergies', 'characters', 'transformations']) {
      db.exec(`DELETE FROM ${t}`);
    }
    const insItem = db.prepare(`INSERT INTO items
      (kind, id, name, name_es, quote, quote_es, description, quality, type, max_charges, gfx, image_remote, pools, stat_caches, search_text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insEffect = db.prepare('INSERT INTO item_effects (kind, id, position, text) VALUES (?, ?, ?, ?)');
    const insTag = db.prepare('INSERT OR IGNORE INTO item_tags (kind, id, tag) VALUES (?, ?, ?)');
    const insSource = db.prepare('INSERT OR IGNORE INTO item_sources (kind, id, source, url, license) VALUES (?, ?, ?, ?, ?)');
    for (const i of data.items) {
      const search = ` ${normName(i.name)} ${i.nameEs ? normName(i.nameEs) : ''} ${i.id} `;
      insItem.run(
        i.kind, i.id, i.name, i.nameEs, i.quote, i.quoteEs, i.description, i.quality, i.type, i.maxCharges,
        i.gfx, i.imageRemote, JSON.stringify(i.pools), JSON.stringify(i.statCaches), search, now,
      );
      i.effects.forEach((e, pos) => insEffect.run(i.kind, i.id, pos, e));
      for (const t of i.tags) insTag.run(i.kind, i.id, t);
      for (const s of i.sources) insSource.run(i.kind, i.id, s.name, s.url, s.license);
    }
    const insSyn = db.prepare(`INSERT INTO synergies (a_kind, a_id, b_kind, b_id, description, source_name, source_url, license)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insItemSyn = db.prepare('INSERT OR IGNORE INTO item_synergies (synergy_id, kind, id) VALUES (?, ?, ?)');
    for (const s of data.synergies) {
      const r = insSyn.run(s.a.kind, s.a.id, s.b.kind, s.b.id, s.description, s.source.name, s.source.url, s.source.license);
      const sid = Number(r.lastInsertRowid);
      insItemSyn.run(sid, s.a.kind, s.a.id);
      insItemSyn.run(sid, s.b.kind, s.b.id);
    }
    const insChar = db.prepare('INSERT INTO characters (id, name, name_es, tainted) VALUES (?, ?, ?, ?)');
    for (const c of data.characters) insChar.run(c.id, c.name, c.nameEs ?? null, c.tainted ? 1 : 0);
    const insForm = db.prepare('INSERT INTO transformations (id, name, name_es, tag, required) VALUES (?, ?, ?, ?, ?)');
    for (const t of data.transformations) insForm.run(t.id, t.name, t.nameEs ?? null, t.tag ?? null, t.required ?? null);
    const setVersion = db.prepare(
      'INSERT INTO versions (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    );
    setVersion.run('data', data.version, now);
    setVersion.run('items_count', String(data.items.length), now);
    setVersion.run('synergies_count', String(data.synergies.length), now);
  });
}
