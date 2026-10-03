/**
 * npx tsx scripts/measure-latency.ts
 * Measures log.txt append -> WebSocket update latency of the Companion (temp log, port 0).
 */
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerMessage } from '@irtc/protocol';
import { loadConfig } from '../companion/src/config.js';
import { startCompanion } from '../companion/src/companion.js';
import { encodeLines, resetSeq } from './mockScenario.js';

const dir = mkdtempSync(join(tmpdir(), 'irtc-lat-'));
const logPath = join(dir, 'log.txt');
writeFileSync(logPath, '');
const quiet = { info() {}, warn() {}, error() {} };
const companion = await startCompanion({ ...loadConfig([]), port: 0, logPath, dataDir: join(dir, 'data'), processCheck: false, openBrowser: false }, quiet);
const write = (kind: Parameters<typeof encodeLines>[0], data: unknown) => {
  for (const l of encodeLines(kind, data)) appendFileSync(logPath, l + '\n');
};
resetSeq();
write('hello', { mod: '0.1.0', proto: 1, rgon: false, rep: true });
write('run', { cont: false, seed: 'LAT', ptype: 0, f: 0 });

const ws = new WebSocket(companion.server.url.replace('http', 'ws') + '/ws');
let lastCoins = -1;
let resolveCoin: ((n: number) => void) | null = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data)) as ServerMessage;
  if (m.type !== 'update' && m.type !== 'welcome') return;
  const coins = m.state.player?.resources.coins ?? -1;
  if (coins !== lastCoins) {
    lastCoins = coins;
    resolveCoin?.(coins);
  }
};
await new Promise((r) => (ws.onopen = r));
await new Promise((r) => setTimeout(r, 300));

const samples: number[] = [];
let bridgeAt = 0;
companion.bridge.on('update', () => (bridgeAt = performance.now()));
for (let coins = 1; coins <= 20; coins++) {
  const got = new Promise<number>((r) => (resolveCoin = r));
  const t0 = performance.now();
  write('stats', { dmg: 3.5, fd: 10, rng: 260, ss: 1, spd: 1, luck: 0, hp: {}, res: { coins, bombs: 1, keys: 0 }, forms: [] });
  await got;
  samples.push(performance.now() - t0);
  if (process.argv.includes('--verbose')) console.log(`#${coins}: bridge ${(bridgeAt - t0).toFixed(0)} ms, web ${(performance.now() - t0).toFixed(0)} ms`);
  await new Promise((r) => setTimeout(r, 37 + Math.random() * 80));
}
samples.sort((a, b) => a - b);
const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
console.log(`log append -> web: avg ${avg.toFixed(0)} ms, min ${samples[0].toFixed(0)} ms, max ${samples.at(-1)!.toFixed(0)} ms`);
ws.close();
await companion.stop();
process.exit(0);
