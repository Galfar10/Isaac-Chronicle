import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { loadConfig } from './config.js';
import { startCompanion } from './companion.js';
import { importWiki } from '../../database/import/wiki.js';

function openBrowser(url: string): void {
  const cmd = platform() === 'win32' ? 'cmd' : platform() === 'darwin' ? 'open' : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  process.title = 'Isaac Companion';

  if (config.updateData) {
    console.info('[data] downloading item data from bindingofisaacrebirth.wiki.gg (CC BY-SA 4.0)...');
    const wiki = await importWiki((s) => console.info(`[data] ${s}`));
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(join(config.dataDir, 'wiki.json'), JSON.stringify(wiki));
    console.info(`[data] saved ${wiki.items.length} items. It will be used on the next start.`);
  }

  let companion;
  try {
    companion = await startCompanion(config);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EADDRINUSE') {
      console.error(`\nPort ${config.port} is already in use: the Companion is probably already running.`);
      console.error(`Open http://127.0.0.1:${config.port} or start with --port <other>.\n`);
    } else {
      console.error('\nThe Companion could not start:', e.message, '\n');
    }
    process.exitCode = 1;
    return;
  }

  const url = companion.server.url;
  console.info('');
  console.info('  +----------------------------------------------+');
  console.info('  |   ISAAC CHRONICLE - Real-Time Companion 0.1  |');
  console.info('  +----------------------------------------------+');
  console.info(`   Web:   ${url}`);
  console.info(`   Modo segundo monitor: ${url}/?mode=monitor`);
  console.info('   Deja esta ventana abierta mientras juegas. Ctrl+C para salir.');
  console.info('');
  if (config.openBrowser) openBrowser(url);

  const shutdown = async () => {
    console.info('\n[companion] stopping...');
    await companion.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
