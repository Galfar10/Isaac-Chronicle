import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGameDir, findLogPath, logCandidates, type PathEnv } from '../bridge/src/paths';
import { isIsaacRunning } from '../bridge/src/processWatch';

const LOG = join('My Games', 'Binding of Isaac Repentance+', 'log.txt');
const PROTON_DOCS = 'steamapps/compatdata/250900/pfx/drive_c/users/steamuser/Documents';
const GAME = 'steamapps/common/The Binding of Isaac Rebirth';

let home: string;

function touch(path: string, ageSeconds = 0): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '');
  const t = Date.now() / 1000 - ageSeconds;
  utimesSync(path, t, t);
  return path;
}

const env = (platform: NodeJS.Platform, vars: Record<string, string> = {}): PathEnv => ({ platform, home, env: vars });

// The layouts below use symlinks and POSIX paths; Windows keeps its own (unchanged) lookup.
describe.skipIf(process.platform === 'win32')('game paths on Steam Deck / Linux / macOS', () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'irtc-paths-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('Steam Deck: finds the log inside the Proton prefix on the internal drive', () => {
    const log = touch(join(home, '.local/share/Steam', PROTON_DOCS, LOG));
    // SteamOS links ~/.steam/steam to the same folder: it must not produce a second candidate.
    mkdirSync(join(home, '.steam'), { recursive: true });
    symlinkSync(join(home, '.local/share/Steam'), join(home, '.steam/steam'));
    expect(findLogPath(null, env('linux'))).toBe(log);
    expect(logCandidates(env('linux')).filter((p) => p.includes('.steam/steam'))).toEqual([]);
  });

  it('Steam Deck: follows libraryfolders.vdf to a game installed on the microSD card', () => {
    const sd = join(home, 'run/media/mmcblk0p1');
    const root = join(home, '.local/share/Steam');
    mkdirSync(join(root, 'steamapps'), { recursive: true });
    writeFileSync(
      join(root, 'steamapps/libraryfolders.vdf'),
      `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${root}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${sd}"\n\t}\n}\n`,
    );
    const log = touch(join(sd, PROTON_DOCS, LOG));
    touch(join(sd, GAME, 'isaac-ng.exe'));
    expect(findLogPath(null, env('linux'))).toBe(log);
    expect(findGameDir(null, env('linux'))).toBe(join(sd, GAME));
  });

  it('uses the prefix Steam passes to the launch-options wrapper', () => {
    const compat = join(home, 'elsewhere/compatdata/250900');
    const log = touch(join(compat, 'pfx/drive_c/users/steamuser/Documents', LOG));
    expect(findLogPath(null, env('linux', { STEAM_COMPAT_DATA_PATH: compat }))).toBe(log);
  });

  it('Flatpak Steam on Linux', () => {
    const log = touch(join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam', PROTON_DOCS, LOG));
    expect(findLogPath(null, env('linux'))).toBe(log);
  });

  it('macOS: finds the log in a CrossOver bottle and in a Whisky bottle', () => {
    const crossover = touch(
      join(home, 'Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/Documents', LOG),
      60,
    );
    expect(findLogPath(null, env('darwin'))).toBe(crossover);
    // A newer log in another bottle wins: the game was last played there.
    const whisky = touch(
      join(home, 'Library/Containers/com.isaacmarovitz.Whisky/Bottles/1B2C/drive_c/users/crossover/Documents', LOG),
    );
    expect(findLogPath(null, env('darwin'))).toBe(whisky);
  });

  it('macOS: bottles that map Documents to the real ~/Documents', () => {
    const log = touch(join(home, 'Documents', LOG));
    expect(findLogPath(null, env('darwin'))).toBe(log);
  });

  it('prefers Repentance+ or Repentance by most recent write, and ignores the Public user', () => {
    const docs = join(home, '.local/share/Steam', PROTON_DOCS);
    touch(join(docs, 'My Games/Binding of Isaac Repentance/log.txt'), 3600);
    const plus = touch(join(docs, LOG));
    touch(join(home, '.local/share/Steam/steamapps/compatdata/250900/pfx/drive_c/users/Public/Documents', LOG));
    expect(findLogPath(null, env('linux'))).toBe(plus);
    expect(logCandidates(env('linux')).some((p) => p.includes('Public'))).toBe(false);
  });

  it('an explicit --log path always wins, and a fresh machine still gets a default to wait on', () => {
    expect(findLogPath('/custom/log.txt', env('linux'))).toBe('/custom/log.txt');
    expect(findLogPath(null, env('linux'))).toBe(join(home, '.local/share/Steam', PROTON_DOCS, LOG));
    expect(findLogPath(null, env('darwin'))).toBe(join(home, 'Documents', LOG));
    expect(findGameDir(null, env('darwin'))).toBeNull();
  });

  it('process check answers yes/no instead of "unsupported" outside Windows', async () => {
    const running = await isIsaacRunning();
    expect(running === true || running === false).toBe(true);
  });
});
