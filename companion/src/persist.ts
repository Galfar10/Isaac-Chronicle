import type { GameState } from '@irtc/protocol';
import type { Repository } from '../../backend/src/db/repository.js';

/**
 * Persists the run and its timeline to SQLite (anonymous: random run id, seed and
 * character only). Writes only what changed since the last call.
 */
export class RunPersistence {
  private lastRunKey = '';
  private persistedSeq = new Map<string, number>();

  constructor(private readonly repo: Repository) {}

  save(state: GameState): void {
    const run = state.run;
    if (!run) return;
    const key = `${run.id}|${run.status}|${run.character.type}|${state.inventory.collectibles.length}|${run.floor?.stage}`;
    if (key !== this.lastRunKey) {
      this.lastRunKey = key;
      this.repo.upsertRun(run, {
        floor: run.floor?.name ?? null,
        items: state.inventory.collectibles.map((c) => c.id),
        time: run.time,
      });
    }
    const last = this.persistedSeq.get(run.id) ?? 0;
    const fresh = state.history.filter((h) => h.seq > last);
    if (fresh.length) {
      this.repo.insertRunEvents(run.id, fresh);
      this.persistedSeq.set(run.id, fresh[fresh.length - 1].seq);
    }
  }
}
