import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const DOC_FOLDERS = ['Binding of Isaac Repentance+', 'Binding of Isaac Repentance'];
const GAME_FOLDER = join('steamapps', 'common', 'The Binding of Isaac Rebirth');
/** Steam app id of The Binding of Isaac: Rebirth (its Proton prefix lives in compatdata/<id>). */
const APP_ID = '250900';

/** Where to look. Injectable so every OS layout can be tested on any OS. */
export interface PathEnv {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
}

function defaultEnv(): PathEnv {
  return { platform: platform(), home: homedir(), env: process.env };
}

function windowsDocuments(): string | null {
  try {
    // Handles OneDrive / redirected Documents folders.
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('MyDocuments')"],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/** Drops duplicates, including the same folder reached through a symlink (~/.steam/steam -> ~/.local/share/Steam). */
function unique(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    let key = p;
    try {
      key = realpathSync(p);
    } catch {
      /* does not exist: keep as written */
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function steamRoots(pe: PathEnv): string[] {
  const { home } = pe;
  const roots: string[] = [];
  if (pe.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      });
      const m = /SteamPath\s+REG_SZ\s+(.+)/.exec(out);
      if (m) roots.push(m[1].trim());
    } catch {
      /* no registry key */
    }
    roots.push('C:/Program Files (x86)/Steam');
  } else if (pe.platform === 'darwin') {
    roots.push(join(home, 'Library/Application Support/Steam'));
  } else {
    roots.push(
      join(home, '.local/share/Steam'), // Steam Deck (SteamOS) and most distros
      join(home, '.steam/steam'),
      join(home, '.steam/root'),
      join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'), // Flatpak
      join(home, 'snap/steam/common/.local/share/Steam'), // Snap
    );
  }
  return roots;
}

/** Steam library folders from libraryfolders.vdf (includes a Steam Deck microSD card or a second drive). */
function steamLibraries(pe: PathEnv): string[] {
  const libs: string[] = [];
  for (const root of steamRoots(pe)) {
    libs.push(root);
    for (const vdf of [join(root, 'steamapps', 'libraryfolders.vdf'), join(root, 'config', 'libraryfolders.vdf')]) {
      if (!existsSync(vdf)) continue;
      try {
        const text = readFileSync(vdf, 'utf8');
        for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, '\\'));
      } catch {
        /* unreadable: ignore */
      }
    }
  }
  return unique(libs);
}

/**
 * Wine prefixes the game may be running in. Repentance / Repentance+ only exist for Windows, so on
 * Steam Deck / Linux the game runs through Proton and on macOS through CrossOver, Whisky or plain Wine.
 */
function winePrefixes(pe: PathEnv): string[] {
  const { home, env } = pe;
  const out: string[] = [];
  // Set by Steam when the Companion is started from the game's launch options (steam-launch.sh).
  if (env.STEAM_COMPAT_DATA_PATH) out.push(join(env.STEAM_COMPAT_DATA_PATH, 'pfx'));
  if (env.WINEPREFIX) out.push(env.WINEPREFIX);
  // Proton keeps the prefix in the same Steam library as the game.
  for (const lib of steamLibraries(pe)) out.push(join(lib, 'steamapps', 'compatdata', APP_ID, 'pfx'));
  if (pe.platform === 'darwin') {
    out.push(
      ...subdirs(join(home, 'Library/Application Support/CrossOver/Bottles')),
      ...subdirs(join(home, 'Library/Containers/com.isaacmarovitz.Whisky/Bottles')),
    );
  } else {
    out.push(
      ...subdirs(join(home, '.var/app/com.usebottles.bottles/data/bottles/bottles')),
      ...subdirs(join(home, '.local/share/bottles/bottles')),
    );
  }
  out.push(join(home, '.wine'));
  return unique(out);
}

/** "Documents" folders of every Windows user inside a Wine prefix (steamuser, crossover, your own name...). */
function prefixDocuments(prefix: string): string[] {
  const out: string[] = [];
  for (const user of subdirs(join(prefix, 'drive_c', 'users'))) {
    if (/[\\/]public$/i.test(user)) continue;
    out.push(join(user, 'Documents'), join(user, 'My Documents'));
  }
  return out;
}

/** Candidate log.txt paths, most likely first. */
export function logCandidates(pe: PathEnv = defaultEnv()): string[] {
  const docs: string[] = [];
  if (pe.platform === 'win32') {
    const d = windowsDocuments();
    if (d) docs.push(d);
    docs.push(join(pe.home, 'Documents'));
  } else {
    for (const p of winePrefixes(pe)) docs.push(...prefixDocuments(p));
    // Game never started yet: the standard Proton location is still the best one to wait on.
    if (pe.platform === 'linux') {
      docs.push(join(pe.home, '.local/share/Steam/steamapps/compatdata', APP_ID, 'pfx/drive_c/users/steamuser/Documents'));
    }
    // Wine and CrossOver often map the Windows "Documents" folder to the real one.
    docs.push(join(pe.home, 'Documents'));
  }
  const out: string[] = [];
  for (const d of docs) for (const f of DOC_FOLDERS) out.push(join(d, 'My Games', f, 'log.txt'));
  return [...new Set(out)];
}

/** Picks the most recently modified existing log.txt (Repentance+ and Repentance use different folders). */
export function findLogPath(override?: string | null, pe: PathEnv = defaultEnv()): string | null {
  if (override) return override;
  const candidates = logCandidates(pe);
  let best: { path: string; mtime: number } | null = null;
  for (const p of candidates) {
    try {
      const st = statSync(p);
      if (!best || st.mtimeMs > best.mtime) best = { path: p, mtime: st.mtimeMs };
    } catch {
      /* not there */
    }
  }
  return best?.path ?? candidates[0] ?? null;
}

export function findGameDir(override?: string | null, pe: PathEnv = defaultEnv()): string | null {
  if (override) return existsSync(override) ? override : null;
  for (const lib of steamLibraries(pe)) {
    const dir = join(lib, GAME_FOLDER);
    if (existsSync(join(dir, 'isaac-ng.exe')) || existsSync(join(dir, 'resources'))) return dir;
  }
  return null;
}

/** Folder with resources extracted by the game's own ResourceExtractor tool, if present. */
export function findExtractedResources(gameDir: string | null): string | null {
  if (!gameDir) return null;
  for (const sub of ['extracted_resources/resources', 'resources-dlc3', 'resources']) {
    const dir = join(gameDir, sub);
    if (existsSync(join(dir, 'items.xml')) && existsSync(join(dir, 'items_metadata.xml'))) {
      try {
        if (statSync(dir).isDirectory()) return dir;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}
