/**
 * npm run mod:install  — DEVELOPMENT ONLY.
 * Copies isaac-mod/ into <game>/mods/isaac-real-time-companion so the game loads it
 * without Workshop. Players use Steam Workshop instead (see WORKSHOP.md).
 * Remove it again with:  npm run mod:uninstall
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { findGameDir } from '../bridge/src/paths.js';

const game = findGameDir(process.env.IRTC_GAME_DIR);
if (!game) {
  console.error('Game folder not found. Set IRTC_GAME_DIR to "...\\steamapps\\common\\The Binding of Isaac Rebirth".');
  process.exit(1);
}
const target = join(game, 'mods', 'isaac-real-time-companion');
if (process.argv.includes('--uninstall')) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  console.log(`removed ${target}`);
} else {
  cpSync(join(import.meta.dirname, '..', 'isaac-mod'), target, { recursive: true });
  console.log(`installed to ${target}\nStart Isaac, enable "Isaac Real-Time Companion" in the Mods menu, then run: npm start`);
}
