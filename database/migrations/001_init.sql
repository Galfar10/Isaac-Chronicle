-- Isaac Real-Time Companion — initial schema.
-- Written in portable SQL (SQLite for the local companion; also valid on PostgreSQL
-- except for the INTEGER PRIMARY KEY autoincrement idiom, see ARCHITECTURE.md).

CREATE TABLE IF NOT EXISTS versions (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- kind: collectible | trinket | card | pill
CREATE TABLE IF NOT EXISTS items (
  kind          TEXT    NOT NULL,
  id            INTEGER NOT NULL,
  name          TEXT    NOT NULL,
  name_es       TEXT,
  quote         TEXT,
  quote_es      TEXT,
  description   TEXT,
  quality       INTEGER,
  type          TEXT,
  max_charges   INTEGER,
  gfx           TEXT,
  image_remote  TEXT,
  pools         TEXT    NOT NULL DEFAULT '[]',
  stat_caches   TEXT    NOT NULL DEFAULT '[]',
  search_text   TEXT    NOT NULL DEFAULT '',
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_items_search ON items (search_text);

CREATE TABLE IF NOT EXISTS item_effects (
  kind     TEXT    NOT NULL,
  id       INTEGER NOT NULL,
  position INTEGER NOT NULL,
  text     TEXT    NOT NULL,
  PRIMARY KEY (kind, id, position)
);

CREATE TABLE IF NOT EXISTS item_tags (
  kind TEXT    NOT NULL,
  id   INTEGER NOT NULL,
  tag  TEXT    NOT NULL,
  PRIMARY KEY (kind, id, tag)
);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags (tag);

CREATE TABLE IF NOT EXISTS item_sources (
  kind    TEXT    NOT NULL,
  id      INTEGER NOT NULL,
  source  TEXT    NOT NULL,
  url     TEXT,
  license TEXT,
  PRIMARY KEY (kind, id, source)
);

CREATE TABLE IF NOT EXISTS synergies (
  id          INTEGER PRIMARY KEY,
  a_kind      TEXT    NOT NULL,
  a_id        INTEGER NOT NULL,
  b_kind      TEXT    NOT NULL,
  b_id        INTEGER NOT NULL,
  description TEXT    NOT NULL,
  source_name TEXT    NOT NULL,
  source_url  TEXT,
  license     TEXT
);
CREATE INDEX IF NOT EXISTS idx_synergies_a ON synergies (a_kind, a_id);
CREATE INDEX IF NOT EXISTS idx_synergies_b ON synergies (b_kind, b_id);

-- Many-to-many helper: every item that takes part in a synergy.
CREATE TABLE IF NOT EXISTS item_synergies (
  synergy_id INTEGER NOT NULL,
  kind       TEXT    NOT NULL,
  id         INTEGER NOT NULL,
  PRIMARY KEY (synergy_id, kind, id)
);
CREATE INDEX IF NOT EXISTS idx_item_synergies_item ON item_synergies (kind, id);

CREATE TABLE IF NOT EXISTS characters (
  id      INTEGER PRIMARY KEY,
  name    TEXT    NOT NULL,
  name_es TEXT,
  tainted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transformations (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  name_es  TEXT,
  tag      TEXT,
  required INTEGER
);

-- Run history (local only, anonymous: random run id, no user/Steam data).
CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  seed           TEXT,
  character_type INTEGER,
  character_name TEXT,
  start_frame    INTEGER,
  started_at     TEXT NOT NULL,
  ended_at       TEXT,
  status         TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_runs_seed ON runs (seed);

CREATE TABLE IF NOT EXISTS run_events (
  run_id     TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  type       TEXT    NOT NULL,
  time       INTEGER NOT NULL,
  wall_time  TEXT    NOT NULL,
  floor      TEXT,
  room_index INTEGER,
  item_kind  TEXT,
  item_id    INTEGER,
  data       TEXT    NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, seq)
);
