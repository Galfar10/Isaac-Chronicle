import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DomainEvent, GameState, ServerMessage } from '@irtc/protocol';
import { startCompanion } from '../companion/src/companion';
import type { CompanionConfig } from '../companion/src/config';
import { encodeLines, resetSeq, scenario } from '../scripts/mockScenario';

const quiet = { info() {}, warn() {}, error() {} };

describe('end to end: mock log.txt -> bridge -> backend -> WebSocket', () => {
  it('plays a full simulated run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-e2e-'));
    const logPath = join(dir, 'log.txt');
    writeFileSync(logPath, '[INFO] - session start\n');
    const root = join(__dirname, '..');
    const config: CompanionConfig = {
      port: 0,
      host: '127.0.0.1',
      logPath,
      gameDir: join(dir, 'no-game'),
      dataDir: join(dir, 'data'),
      webDir: null,
      migrationsDir: join(root, 'database', 'migrations'),
      seedDir: join(root, 'database', 'seed'),
      allowedOrigins: [],
      openBrowser: false,
      processCheck: false,
      updateData: false,
    };
    const companion = await startCompanion(config, quiet);
    try {
      const ws = new WebSocket(companion.server.url.replace('http', 'ws') + '/ws');
      const events: DomainEvent[] = [];
      let last: GameState | null = null;
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as ServerMessage;
        if (m.type === 'update') events.push(...m.events);
        if (m.type === 'welcome' || m.type === 'update') last = m.state;
      };
      await new Promise((r) => (ws.onopen = r));

      resetSeq();
      for (const step of scenario()) {
        if ('kind' in step) for (const l of encodeLines(step.kind, step.data)) appendFileSync(logPath, l + '\n');
      }
      // Bridge polls every 100 ms; wait for the final exit to arrive.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !events.some((e) => e.event === 'run_ended')) await new Promise((r) => setTimeout(r, 50));

      const order = events.map((e) => e.event);
      // Brimstone was detected on entry (unidentified), identified when approached, then picked.
      const spawned = events.findIndex((e) => e.event === 'item_spawned' && e.data.kind === 'collectible');
      const revealed = events.findIndex((e) => e.event === 'item_revealed' && e.data.id === 118);
      const picked = events.findIndex((e) => e.event === 'item_picked' && e.data.id === 118);
      expect(spawned).toBeGreaterThanOrEqual(0);
      expect(revealed).toBeGreaterThan(spawned);
      expect(picked).toBeGreaterThan(revealed);
      // Mom's Knife and Cricket's Head were each identified only when the player walked up to them.
      const revealedIds = events.flatMap((e) => (e.event === 'item_revealed' ? [e.data.id] : []));
      expect(revealedIds).toEqual(expect.arrayContaining([118, 114, 4]));
      // Never identified at spawn time from across the room.
      expect(events.filter((e) => e.event === 'item_spawned').every((e) => e.event === 'item_spawned' && e.data.id === null)).toBe(true);
      // The Fool and pill effect 2 were discovered when picked up.
      expect(events).toContainEqual({ event: 'discovery', data: { kind: 'card', id: 1, first: true } });
      expect(events).toContainEqual({ event: 'discovery', data: { kind: 'pill', id: 2, first: true } });
      expect(order).toContain('stats_changed');
      expect(order).toContain('floor_changed');

      const state = last as unknown as GameState;
      expect(state.inventory.collectibles.map((c) => c.id).sort((a, b) => a - b)).toEqual([12, 114, 118]);
      expect(state.inventory.trinkets).toEqual([1]);
      expect(state.run?.status).toBe('dead');
      expect(state.history.filter((h) => h.type === 'item_picked').map((h) => h.itemId)).toEqual([118, 114, 1, 12]);

      // REST and DB agree with the stream.
      const api = await (await fetch(companion.server.url + '/api/state')).json();
      expect(api.run.id).toBe(state.run?.id);
      const runs = await (await fetch(companion.server.url + '/api/runs')).json();
      expect(runs[0].status).toBe('dead');
      const brim = await (await fetch(companion.server.url + '/api/items/118')).json();
      expect(brim.name).toBe('Brimstone');
      expect(state.discoveries).toEqual({ pills: [2], cards: [1] });
      ws.close();
    } finally {
      await companion.stop();
    }
  });
});
