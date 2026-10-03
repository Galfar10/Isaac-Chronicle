import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const DOC_FOLDERS = ['Binding of Isaac Repentance+', 'Binding of Isaac Repentance'];
const GAME_FOLDER = join('steamapps', 'common', 'The Binding of Isaac Rebirth');

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

/** Candidate log.txt paths, most likely first. */
export function logCandidates(): string[] {
  const docs: string[] = [];
  if (platform() === 'win32') {
    const d = windowsDocuments();
    if (d) docs.push(d);
    docs.push(join(homedir(), 'Documents'));
  } else {
    // Steam Deck / Linux via Proton.
    docs.push(
      join(homedir(), '.local/share/Steam/steamapps/compatdata/250900/pfx/drive_c/users/steamuser/Documents'),
      join(homedir(), '.steam/steam/steamapps/compatdata/250900/pfx/drive_c/users/steamuser/Documents'),
      join(homedir(), 'Documents'),
    );
  }
  const out: string[] = [];
  for (const d of docs) for (const f of DOC_FOLDERS) out.push(join(d, 'My Games', f, 'log.txt'));
  return [...new Set(out)];
}

/** Picks the most recently modified existing log.txt (Repentance+ and Repentance use different folders). */
export function findLogPath(override?: string | null): string | null {
  if (override) return override;
  let best: { path: string; mtime: number } | null = null;
  for (const p of logCandidates()) {
    try {
      const st = statSync(p);
      if (!best || st.mtimeMs > best.mtime) best = { path: p, mtime: st.mtimeMs };
    } catch {
      /* not there */
    }
  }
  return best?.path ?? logCandidates()[0] ?? null;
}

function steamRoots(): string[] {
  const roots: string[] = [];
  if (platform() === 'win32') {
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
  } else {
    roots.push(join(homedir(), '.local/share/Steam'), join(homedir(), '.steam/steam'));
  }
  return roots;
}

/** Steam library folders from libraryfolders.vdf. */
function steamLibraries(): string[] {
  const libs = new Set<string>();
  for (const root of steamRoots()) {
    libs.add(root);
    const vdf = join(root, 'steamapps', 'libraryfolders.vdf');
    if (!existsSync(vdf)) continue;
    const text = readFileSync(vdf, 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  }
  return [...libs];
}

export function findGameDir(override?: string | null): string | null {
  if (override) return existsSync(override) ? override : null;
  for (const lib of steamLibraries()) {
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
