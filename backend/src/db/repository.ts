import type { HistoryEntry, ItemKind, ItemRecord, ItemSearchResult, RunInfo, SynergyRecord } from '@irtc/protocol';
import type { Db } from './database.js';

interface ItemRow {
  kind: ItemKind;
  id: number;
  name: string;
  name_es: string | null;
  quote: string | null;
  quote_es: string | null;
  description: string | null;
  quality: number | null;
  type: string | null;
  max_charges: number | null;
  gfx: string | null;
  image_remote: string | null;
  pools: string;
  stat_caches: string;
  updated_at: string;
}

export interface RepositoryOptions {
  /** True when the companion can serve local sprites from the user's extracted game resources. */
  localImages: () => boolean;
}

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export class Repository {
  constructor(
    private readonly db: Db,
    private readonly opts: RepositoryOptions = { localImages: () => false },
  ) {}

  private image(row: Pick<ItemRow, 'gfx' | 'image_remote'>): string | null {
    if (row.gfx && this.opts.localImages()) return `/gfx/${row.gfx}`;
    return row.image_remote;
  }

  getVersion(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM versions WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  counts(): { items: number; synergies: number } {
    const items = (this.db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n;
    const synergies = (this.db.prepare('SELECT COUNT(*) AS n FROM synergies').get() as { n: number }).n;
    return { items, synergies };
  }

  getItem(kind: ItemKind, id: number): ItemRecord | null {
    const row = this.db.prepare('SELECT * FROM items WHERE kind = ? AND id = ?').get(kind, id) as ItemRow | undefined;
    if (!row) return null;
    const effects = (this.db.prepare('SELECT text FROM item_effects WHERE kind = ? AND id = ? ORDER BY position').all(kind, id) as { text: string }[]).map(
      (r) => r.text,
    );
    const tags = (this.db.prepare('SELECT tag FROM item_tags WHERE kind = ? AND id = ? ORDER BY tag').all(kind, id) as { tag: string }[]).map((r) => r.tag);
    const transformations = this.db
      .prepare(
        `SELECT t.id, t.name FROM transformations t
         JOIN item_tags it ON it.tag = t.tag WHERE it.kind = ? AND it.id = ? ORDER BY t.id`,
      )
      .all(kind, id) as { id: number; name: string }[];
    const sources = this.db.prepare('SELECT source AS name, url, license FROM item_sources WHERE kind = ? AND id = ? ORDER BY source').all(kind, id) as {
      name: string;
      url: string | null;
      license: string | null;
    }[];
    const synergyCount = (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT CASE WHEN s.a_kind = ? AND s.a_id = ? THEN s.b_kind || ':' || s.b_id ELSE s.a_kind || ':' || s.a_id END) AS n
           FROM synergies s WHERE (s.a_kind = ? AND s.a_id = ?) OR (s.b_kind = ? AND s.b_id = ?)`,
        )
        .get(kind, id, kind, id, kind, id) as { n: number }
    ).n;
    return {
      kind: row.kind,
      id: row.id,
      name: row.name,
      nameEs: row.name_es,
      quote: row.quote,
      quoteEs: row.quote_es,
      description: row.description,
      quality: row.quality,
      type: row.type,
      pools: parseJson(row.pools, [] as string[]),
      tags,
      effects,
      maxCharges: row.max_charges,
      statCaches: parseJson(row.stat_caches, [] as string[]),
      transformations,
      image: this.image(row),
      imageRemote: row.image_remote,
      synergyCount,
      sources,
      updatedAt: row.updated_at,
    };
  }

  /** Many items at once (inventory / room list). */
  getItems(refs: { kind: ItemKind; id: number }[]): ItemRecord[] {
    const out: ItemRecord[] = [];
    for (const r of refs.slice(0, 500)) {
      const item = this.getItem(r.kind, r.id);
      if (item) out.push(item);
    }
    return out;
  }

  search(query: string, kind: ItemKind | null, limit = 20): ItemSearchResult[] {
    const q = query
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9?!]+/g, ' ')
      .trim();
    const lim = Math.max(1, Math.min(100, limit));
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q) {
      for (const word of q.split(' ').slice(0, 6)) {
        where.push('search_text LIKE ?');
        params.push(`%${word}%`);
      }
    }
    if (kind) {
      where.push('kind = ?');
      params.push(kind);
    }
    const sql = `SELECT kind, id, name, name_es, quality, quote, gfx, image_remote,
        CASE WHEN search_text LIKE ? THEN 0 ELSE 1 END AS rank
      FROM items ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY rank, length(name), id LIMIT ?`;
    const rows = this.db.prepare(sql).all(`% ${q}%`, ...params, lim) as unknown as (ItemRow & { rank: number })[];
    return rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      name: r.name,
      nameEs: r.name_es,
      quality: r.quality,
      quote: r.quote,
      image: this.image(r),
    }));
  }

  private synergyRows(sql: string, params: (string | number)[]): SynergyRecord[] {
    const rows = this.db.prepare(sql).all(...params) as {
      id: number;
      a_kind: ItemKind;
      a_id: number;
      a_name: string | null;
      a_name_es: string | null;
      b_kind: ItemKind;
      b_id: number;
      b_name: string | null;
      b_name_es: string | null;
      description: string;
      source_name: string;
      source_url: string | null;
      license: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      a: { kind: r.a_kind, id: r.a_id, name: r.a_name ?? `#${r.a_id}`, nameEs: r.a_name_es },
      b: { kind: r.b_kind, id: r.b_id, name: r.b_name ?? `#${r.b_id}`, nameEs: r.b_name_es },
      description: r.description,
      source: { name: r.source_name, url: r.source_url, license: r.license },
    }));
  }

  private static readonly SYN_SELECT = `SELECT s.id, s.a_kind, s.a_id, ia.name AS a_name, ia.name_es AS a_name_es,
      s.b_kind, s.b_id, ib.name AS b_name, ib.name_es AS b_name_es,
      s.description, s.source_name, s.source_url, s.license
    FROM synergies s
    LEFT JOIN items ia ON ia.kind = s.a_kind AND ia.id = s.a_id
    LEFT JOIN items ib ON ib.kind = s.b_kind AND ib.id = s.b_id`;

  synergiesFor(kind: ItemKind, id: number): SynergyRecord[] {
    return this.synergyRows(`${Repository.SYN_SELECT} WHERE (s.a_kind = ? AND s.a_id = ?) OR (s.b_kind = ? AND s.b_id = ?) ORDER BY s.id`, [
      kind,
      id,
      kind,
      id,
    ]);
  }

  /** Known synergies where BOTH items are in the given set (e.g. the inventory). */
  synergiesAmong(refs: { kind: ItemKind; id: number }[]): SynergyRecord[] {
    if (refs.length < 2) return [];
    const keys = [...new Set(refs.slice(0, 400).map((r) => `${r.kind}:${r.id}`))];
    const placeholders = keys.map(() => '?').join(',');
    return this.synergyRows(
      `${Repository.SYN_SELECT}
       WHERE (s.a_kind || ':' || s.a_id) IN (${placeholders}) AND (s.b_kind || ':' || s.b_id) IN (${placeholders})
       ORDER BY s.id`,
      [...keys, ...keys],
    );
  }

  listSynergies(limit = 100, offset = 0): SynergyRecord[] {
    return this.synergyRows(`${Repository.SYN_SELECT} ORDER BY s.id LIMIT ? OFFSET ?`, [Math.min(500, limit), Math.max(0, offset)]);
  }

  characters(): { id: number; name: string; nameEs: string | null; tainted: boolean }[] {
    return (this.db.prepare('SELECT id, name, name_es, tainted FROM characters ORDER BY id').all() as {
      id: number;
      name: string;
      name_es: string | null;
      tainted: number;
    }[]).map((r) => ({ id: r.id, name: r.name, nameEs: r.name_es, tainted: r.tainted === 1 }));
  }

  transformations(): { id: number; name: string; nameEs: string | null; tag: string | null; required: number | null }[] {
    return (this.db.prepare('SELECT id, name, name_es, tag, required FROM transformations ORDER BY id').all() as {
      id: number;
      name: string;
      name_es: string | null;
      tag: string | null;
      required: number | null;
    }[]).map((r) => ({ id: r.id, name: r.name, nameEs: r.name_es, tag: r.tag, required: r.required }));
  }

  // ---------------------------------------------------------------- discoveries

  loadDiscoveries(): { pills: number[]; cards: number[] } {
    const rows = this.db.prepare("SELECT kind, id FROM discoveries WHERE discovered = 1 ORDER BY id").all() as { kind: string; id: number }[];
    return {
      pills: rows.filter((r) => r.kind === 'pill').map((r) => r.id),
      cards: rows.filter((r) => r.kind === 'card').map((r) => r.id),
    };
  }

  markPresented(kind: 'pill' | 'card', id: number): void {
    this.db
      .prepare(
        `INSERT INTO discoveries (kind, id, presented_count, first_seen_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(kind, id) DO UPDATE SET presented_count = presented_count + 1`,
      )
      .run(kind, id, new Date().toISOString());
  }

  markDiscovered(kind: 'pill' | 'card', id: number, runId: string | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO discoveries (kind, id, first_seen_at, discovered, discovered_at, discovered_run_id) VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(kind, id) DO UPDATE SET
           discovered_run_id = CASE WHEN discovered = 1 THEN discovered_run_id ELSE excluded.discovered_run_id END,
           discovered_at = CASE WHEN discovered = 1 THEN discovered_at ELSE excluded.discovered_at END,
           discovered = 1`,
      )
      .run(kind, id, now, now, runId);
  }

  listDiscoveries(): { kind: string; id: number; presentedCount: number; discovered: boolean; discoveredAt: string | null }[] {
    return (this.db.prepare('SELECT * FROM discoveries ORDER BY kind, id').all() as {
      kind: string;
      id: number;
      presented_count: number;
      discovered: number;
      discovered_at: string | null;
    }[]).map((r) => ({ kind: r.kind, id: r.id, presentedCount: r.presented_count, discovered: r.discovered === 1, discoveredAt: r.discovered_at }));
  }

  // ---------------------------------------------------------------- runs

  /** Finds a recent unfinished run with the same seed + character (continued run / companion restart). */
  findResumableRun(seed: string | null, characterType: number | null, maxAgeHours = 72): { id: string } | null {
    if (!seed) return null;
    const since = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
    const r = this.db
      .prepare(
        `SELECT id FROM runs WHERE seed = ? AND (character_type IS ? OR character_type = ?) AND status IN ('playing', 'exited')
         AND started_at >= ? ORDER BY started_at DESC LIMIT 1`,
      )
      .get(seed, characterType, characterType, since) as { id: string } | undefined;
    return r ?? null;
  }

  upsertRun(run: RunInfo, summary: Record<string, unknown> = {}): void {
    const ended = run.status === 'playing' ? null : new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO runs (id, seed, character_type, character_name, start_frame, started_at, ended_at, status, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, ended_at = excluded.ended_at, summary = excluded.summary,
           character_type = excluded.character_type`,
      )
      .run(
        run.id,
        run.seed,
        run.character.type,
        run.character.name,
        run.frame,
        new Date(run.startedAt).toISOString(),
        ended,
        run.status,
        JSON.stringify(summary),
      );
  }

  insertRunEvents(runId: string, entries: HistoryEntry[]): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO run_events (run_id, seq, type, time, wall_time, floor, room_index, item_kind, item_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of entries) {
      const { seq, type, time, wallTime, floor, roomIndex, itemKind, itemId, ...data } = e;
      stmt.run(runId, seq, type, time, new Date(wallTime).toISOString(), floor, roomIndex, itemKind ?? null, itemId ?? null, JSON.stringify(data));
    }
  }

  runEvents(runId: string): HistoryEntry[] {
    const rows = this.db.prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY seq').all(runId) as {
      seq: number;
      type: HistoryEntry['type'];
      time: number;
      wall_time: string;
      floor: string | null;
      room_index: number | null;
      item_kind: ItemKind | null;
      item_id: number | null;
      data: string;
    }[];
    return rows.map((r) => ({
      ...parseJson<Partial<HistoryEntry>>(r.data, {}),
      seq: r.seq,
      type: r.type,
      time: r.time,
      wallTime: Date.parse(r.wall_time),
      floor: r.floor,
      roomIndex: r.room_index,
      ...(r.item_kind ? { itemKind: r.item_kind } : {}),
      ...(r.item_id !== null ? { itemId: r.item_id } : {}),
    }));
  }

  listRuns(limit = 20): { id: string; seed: string | null; characterType: number | null; characterName: string | null; startedAt: string; endedAt: string | null; status: string; summary: unknown }[] {
    return (this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(Math.min(200, limit)) as {
      id: string;
      seed: string | null;
      character_type: number | null;
      character_name: string | null;
      started_at: string;
      ended_at: string | null;
      status: string;
      summary: string;
    }[]).map((r) => ({
      id: r.id,
      seed: r.seed,
      characterType: r.character_type,
      characterName: r.character_name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      summary: parseJson(r.summary, {}),
    }));
  }
}
