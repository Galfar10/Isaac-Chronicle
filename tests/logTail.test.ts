import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LogTail } from '../bridge/src/logTail';

describe('LogTail', () => {
  it('reads existing content, then appended lines, buffering partial lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-tail-'));
    const file = join(dir, 'log.txt');
    writeFileSync(file, 'a\nb\n');
    const tail = new LogTail(file, { intervalMs: 10_000 });
    const got: string[] = [];
    tail.on('lines', (l: string[]) => got.push(...l));
    await tail.start();
    expect(got).toEqual(['a', 'b']);
    appendFileSync(file, 'c\npart');
    await tail.poll();
    expect(got).toEqual(['a', 'b', 'c']);
    appendFileSync(file, 'ial\n');
    await tail.poll();
    expect(got).toEqual(['a', 'b', 'c', 'partial']);
    tail.stop();
  });

  it('detects truncation (game restarted) and reads from the beginning', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-tail-'));
    const file = join(dir, 'log.txt');
    writeFileSync(file, 'old line 1\nold line 2\n');
    const tail = new LogTail(file, { intervalMs: 10_000 });
    const got: string[] = [];
    let resets = 0;
    tail.on('lines', (l: string[]) => got.push(...l));
    tail.on('reset', () => resets++);
    await tail.start();
    writeFileSync(file, 'new\n');
    await tail.poll();
    expect(resets).toBe(1);
    expect(got.at(-1)).toBe('new');
    tail.stop();
  });

  it('reports a missing file and recovers when it appears', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'irtc-tail-'));
    const file = join(dir, 'log.txt');
    const tail = new LogTail(file, { intervalMs: 10_000 });
    let missing = 0;
    const got: string[] = [];
    tail.on('missing', () => missing++);
    tail.on('lines', (l: string[]) => got.push(...l));
    await tail.start();
    expect(missing).toBe(1);
    writeFileSync(file, 'hello\n');
    await tail.poll();
    expect(got).toEqual(['hello']);
    tail.stop();
  });
});
