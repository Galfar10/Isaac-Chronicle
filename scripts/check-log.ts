/**
 * npx tsx scripts/check-log.ts [path/to/log.txt]
 * Decodes the mod's lines in a real log.txt and prints a summary (diagnostics).
 */
import { readFileSync } from 'node:fs';
import { WireDecoder } from '@irtc/protocol';
import { findLogPath } from '../bridge/src/paths.js';

const path = process.argv[2] ?? findLogPath();
if (!path) throw new Error('log.txt not found');
const decoder = new WireDecoder();
const kinds: Record<string, number> = {};
const invalid: string[] = [];
const samples: Record<string, unknown> = {};
for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
  const r = decoder.decodeLine(line);
  if (!r) continue;
  if (!r.ok) {
    invalid.push(`${r.reason}: ${r.line.slice(0, 120)}`);
    continue;
  }
  kinds[r.message.kind] = (kinds[r.message.kind] ?? 0) + 1;
  samples[r.message.kind] = r.message.data;
}
console.log(`log: ${path}`);
console.log('messages:', JSON.stringify(kinds));
console.log(`invalid: ${invalid.length}`, invalid.slice(0, 3));
for (const k of ['hello', 'run', 'level', 'room', 'pickups', 'inv', 'stats', 'err']) {
  if (samples[k]) console.log(`last ${k}:`, JSON.stringify(samples[k]).slice(0, 400));
}
