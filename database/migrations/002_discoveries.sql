-- Persistent discovery memory (local player profile). Survives new runs and restarts.
-- kind: 'pill' (id = PillEffect) | 'card' (id = Card)
--   presented: the companion has seen it (picked up / identified by the game) — NOT knowledge.
--   discovered: the player really used it at least once (evidence from MC_USE_PILL / MC_USE_CARD).
CREATE TABLE IF NOT EXISTS discoveries (
  kind              TEXT    NOT NULL,
  id                INTEGER NOT NULL,
  presented_count   INTEGER NOT NULL DEFAULT 0,
  first_seen_at     TEXT,
  discovered        INTEGER NOT NULL DEFAULT 0,
  discovered_at     TEXT,
  discovered_run_id TEXT,
  PRIMARY KEY (kind, id)
);

CREATE VIEW IF NOT EXISTS discovered_pills AS
  SELECT id AS pill_effect, discovered_at, discovered_run_id FROM discoveries WHERE kind = 'pill' AND discovered = 1;

CREATE VIEW IF NOT EXISTS discovered_cards AS
  SELECT id AS card, discovered_at, discovered_run_id FROM discoveries WHERE kind = 'card' AND discovered = 1;
