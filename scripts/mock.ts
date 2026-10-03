/**
 * npm run mock  [-- --speed 2] [-- --once] [-- --no-open]
 * Starts the Companion against a temporary log.txt and plays a simulated run into it.
 */
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../companion/src/config.js';
import { startCompanion } from '../companion/src/companion.js';
import { encodeLines, resetSeq, scenario } from './mockScenario.js';

const argv = process.argv.slice(2);
const speedArg = argv.indexOf('--speed');
const speed = speedArg >= 0 ? Number(argv[speedArg + 1]) || 1 : 1;
const once = argv.includes('--once');

const dir = mkdtempSync(join(tmpdir(), 'irtc-mock-'));
const logPath = join(dir, 'log.txt');
writeFileSync(logPath, '[INFO] - Mock Isaac session\n');

const config = { ...loadConfig(argv), logPath, processCheck: false };
const companion = await startCompanion(config);
console.info(`\n[mock] Companion: ${companion.server.url}   (log: ${logPath})`);
console.info('[mock] Abre la web y mira la partida simulada. Ctrl+C para salir.\n');
if (config.openBrowser) {
  const { spawn } = await import('node:child_process');
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', companion.server.url], { detached: true, stdio: 'ignore' }).unref();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / speed));
let stopped = false;
process.on('SIGINT', async () => {
  stopped = true;
  await companion.stop();
  process.exit(0);
});

// Heartbeat like MC_POST_RENDER every 2 s.
let frame = 0;
const hb = setInterval(() => {
  frame += 60;
  for (const l of encodeLines('hb', { inRun: true, paused: false, f: frame })) appendFileSync(logPath, l + '\n');
}, 2000 / speed);

do {
  resetSeq();
  for (const step of scenario()) {
    if (stopped) break;
    await sleep(step.delay);
    if ('kind' in step) {
      for (const line of encodeLines(step.kind, step.data)) appendFileSync(logPath, line + '\n');
      console.info(`[mock] ${step.kind}`);
    }
  }
  if (!once) {
    console.info('[mock] run finished, starting again in 4 s');
    await sleep(4000);
  }
} while (!once && !stopped);

clearInterval(hb);
if (once) {
  await sleep(500);
  await companion.stop();
}
