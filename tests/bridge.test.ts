import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Bridge, type BridgeUpdate } from '../bridge/src/bridge';
import { encodeLines, resetSeq } from '../scripts/mockScenario';

const quiet = { info() {}, warn() {}, error() {} };
const stats = (coins: number) => ({ dmg: 3.5, fd: 10, rng: 260, ss: 1, spd: 1, luck: 0, hp: { red: 6, max: 6 }, res: { coins, bombs: 1, keys: 0 }, forms: [] });

describe('Bridge publishing', () => {
  it('publishes state-only changes (coins, hearts...) immediately, without waiting for another event', () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-bridge-'));
    const logPath = join(dir, 'log.txt');
    writeFileSync(logPath, '');
    const bridge = new Bridge({ logPath, processCheck: false, logger: quiet });
    const updates: BridgeUpdate[] = [];
    bridge.on('update', (u: BridgeUpdate) => updates.push(u));
    resetSeq();
    bridge.onLines([
      ...encodeLines('hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true }),
      ...encodeLines('run', { cont: false, seed: 'S', ptype: 0, f: 0 }),
      ...encodeLines('stats', stats(1)),
    ]);
    updates.length = 0;
    // Only the coin count changes: no domain event, but the update must still be emitted.
    bridge.onLines(encodeLines('stats', stats(2)));
    expect(updates).toHaveLength(1);
    expect(updates[0].events).toEqual([]);
    expect(updates[0].state.player?.resources.coins).toBe(2);
  });
});
