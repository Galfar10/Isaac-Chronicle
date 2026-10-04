import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT } from '@irtc/protocol';

export interface CompanionConfig {
  port: number;
  host: string;
  logPath: string | null;
  gameDir: string | null;
  dataDir: string;
  webDir: string | null;
  migrationsDir: string;
  seedDir: string;
  allowedOrigins: string[];
  openBrowser: boolean;
  processCheck: boolean;
  updateData: boolean;
  /** Proximity reveal distance in tiles (default ITEM_REVEAL_DISTANCE). */
  revealDistance?: number;
  /** Mobile mode forced on (--lan) or off (--no-lan); undefined = last choice made in the web UI. */
  lan?: boolean;
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

/** True inside the Node.js single executable (https://nodejs.org/api/single-executable-applications.html). */
export function isPackaged(): boolean {
  try {
    const sea = process.getBuiltinModule('node:sea') as { isSea?: () => boolean } | undefined;
    return sea?.isSea?.() === true || process.env.IRTC_PACKAGED === '1';
  } catch {
    return process.env.IRTC_PACKAGED === '1';
  }
}

/** Folder of the running code: the executable folder when packaged, the repo otherwise. */
export function appRoot(): string {
  // Single executable application: assets are shipped next to the executable.
  if (isPackaged()) return dirname(process.execPath);
  const here = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
  // companion/src -> repo root, or dist/ -> repo root
  for (const up of ['..', '../..', '../../..']) {
    const root = resolve(here, up);
    if (existsSync(join(root, 'database', 'migrations'))) return root;
  }
  return process.cwd();
}

function firstExisting(...paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
}

function defaultDataDir(root: string, packaged: boolean): string {
  if (!packaged) return join(root, 'data');
  if (platform() === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'IsaacCompanion');
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'IsaacCompanion');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'isaac-companion');
}

export function loadConfig(argv = process.argv.slice(2), env = process.env): CompanionConfig {
  const root = appRoot();
  const packaged = isPackaged();
  // The official hosted web UI (GitHub Pages) is allowed by default; more via --origin= / env.
  const origins = [
    PROJECT.pagesOrigin,
    ...(env.IRTC_ALLOWED_ORIGINS ?? '').split(','),
    ...argv.filter((a) => a.startsWith('--origin=')).map((a) => a.slice(9)),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port: Number(arg(argv, 'port') ?? env.IRTC_PORT ?? 47823),
    host: '127.0.0.1', // local only by design (see SECURITY in ARCHITECTURE.md)
    logPath: arg(argv, 'log') ?? env.IRTC_LOG_PATH ?? null,
    gameDir: arg(argv, 'game-dir') ?? env.IRTC_GAME_DIR ?? null,
    dataDir: arg(argv, 'data-dir') ?? env.IRTC_DATA_DIR ?? defaultDataDir(root, packaged),
    webDir: arg(argv, 'web-dir') ?? (packaged ? firstExisting(join(root, 'web')) : firstExisting(join(root, 'web', 'dist'))),
    migrationsDir: firstExisting(join(root, 'database', 'migrations'), join(root, 'migrations')) ?? join(root, 'database', 'migrations'),
    seedDir: firstExisting(join(root, 'database', 'seed'), join(root, 'seed')) ?? join(root, 'database', 'seed'),
    allowedOrigins: origins,
    openBrowser: !argv.includes('--no-open') && env.IRTC_NO_OPEN !== '1',
    processCheck: !argv.includes('--no-process-check'),
    updateData: argv.includes('--update-data'),
    lan: argv.includes('--no-lan') ? false : argv.includes('--lan') ? true : undefined,
    revealDistance: (() => {
      const v = Number(arg(argv, 'reveal-distance') ?? env.IRTC_REVEAL_DISTANCE);
      return Number.isFinite(v) && v > 0 ? v : undefined;
    })(),
  };
}
