import { join } from 'node:path';
import { Bridge, findExtractedResources, findGameDir, findLogPath } from '../../bridge/src/index.js';
import { migrate, openDatabase, readMigrations, type Db } from '../../backend/src/db/database.js';
import { Repository } from '../../backend/src/db/repository.js';
import { startServer, type CompanionServer } from '../../backend/src/server.js';
import { ensureReferenceData } from './data.js';
import { RunPersistence } from './persist.js';
import type { CompanionConfig } from './config.js';

export interface Companion {
  config: CompanionConfig;
  server: CompanionServer;
  bridge: Bridge;
  repo: Repository;
  db: Db;
  logPath: string;
  resourcesDir: string | null;
  stop(): Promise<void>;
}

type Log = Pick<Console, 'info' | 'warn' | 'error'>;

export async function startCompanion(config: CompanionConfig, log: Log = console): Promise<Companion> {
  const logPath = findLogPath(config.logPath);
  if (!logPath) throw new Error('Could not determine the location of log.txt. Use --log <path>.');
  const gameDir = findGameDir(config.gameDir);
  const resourcesDir = findExtractedResources(gameDir);

  const db = openDatabase(join(config.dataDir, 'companion.sqlite'));
  migrate(db, readMigrations(config.migrationsDir));
  const repo = new Repository(db, { localImages: () => resourcesDir !== null });

  const data = ensureReferenceData(
    db,
    { seedDir: config.seedDir, dataDir: config.dataDir, resourcesDir, currentVersion: repo.getVersion('data') },
    log,
  );
  if (!data.sources.length) log.warn('[data] no item data source found (database/seed/wiki.json or extracted game resources).');

  const bridge = new Bridge({
    logPath,
    processCheck: config.processCheck,
    logger: log,
    revealDistance: config.revealDistance,
    discoveries: repo.loadDiscoveries(),
    onDiscovery: (kind, id, runId) => {
      try {
        repo.markDiscovered(kind, id, runId);
      } catch (err) {
        log.warn('[persist] discovery not saved:', (err as Error).message);
      }
    },
    onPresented: (kind, id) => {
      try {
        repo.markPresented(kind, id);
      } catch {
        /* bookkeeping only */
      }
    },
    resolveRunId: (run) => {
      if (!run.cont && !run.resync) return null;
      const found = repo.findResumableRun(run.seed ?? null, run.ptype ?? null);
      return found ? { id: found.id, history: repo.runEvents(found.id) } : null;
    },
  });

  const server = await startServer({
    repo,
    getState: () => bridge.state,
    host: config.host,
    port: config.port,
    staticDir: config.webDir,
    gfxDir: () => resourcesDir,
    allowedOrigins: config.allowedOrigins,
    logger: log,
  });

  const persistence = new RunPersistence(repo);
  bridge.on('update', ({ events, state }) => {
    try {
      persistence.save(state);
    } catch (err) {
      log.warn('[persist] failed:', (err as Error).message);
    }
    server.publish(events);
  });
  await bridge.start();
  // Persist whatever was replayed from an already running game session.
  persistence.save(bridge.state);

  log.info(`[companion] log.txt: ${logPath}`);
  log.info(`[companion] game folder: ${gameDir ?? 'not found'}; local sprites: ${resourcesDir ? 'yes' : 'no'}`);
  log.info(`[companion] data: ${data.sources.join(' + ') || 'none'}`);

  return {
    config,
    server,
    bridge,
    repo,
    db,
    logPath,
    resourcesDir,
    async stop() {
      bridge.stop();
      await server.close();
      db.close();
    },
  };
}
