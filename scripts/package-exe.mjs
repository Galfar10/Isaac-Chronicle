// npm run package — builds release/IsaacCompanion/ with a single executable (Node SEA)
// plus the web UI, migrations and seed data next to it, and zips it.
// https://nodejs.org/api/single-executable-applications.html
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join('release', 'IsaacCompanion');
const exeName = process.platform === 'win32' ? 'IsaacCompanion.exe' : 'isaac-companion';
rmSync('release', { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. SEA blob
writeFileSync(
  'dist/sea-config.json',
  JSON.stringify({ main: 'dist/companion.cjs', output: 'dist/sea-prep.blob', disableExperimentalSEAWarning: true, useCodeCache: false }),
);
execFileSync(process.execPath, ['--experimental-sea-config', 'dist/sea-config.json'], { stdio: 'inherit' });

// 2. Copy the node binary and inject the blob
const exe = join(out, exeName);
copyFileSync(process.execPath, exe);
const postject = join('node_modules', 'postject', 'dist', 'cli.js');
const args = [postject, exe, 'NODE_SEA_BLOB', 'dist/sea-prep.blob', '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, args, { stdio: 'inherit' });

// 3. Assets next to the executable
cpSync('web/dist', join(out, 'web'), { recursive: true });
cpSync('database/migrations', join(out, 'migrations'), { recursive: true });
mkdirSync(join(out, 'seed'), { recursive: true });
for (const f of ['wiki.json', 'overrides.json']) {
  if (existsSync(join('database/seed', f))) copyFileSync(join('database/seed', f), join(out, 'seed', f));
}
writeFileSync(
  join(out, 'LEEME.txt'),
  [
    'ISAAC REAL-TIME COMPANION',
    '',
    '1. Suscríbete al mod "Isaac Real-Time Companion" en Steam Workshop.',
    `2. Ejecuta ${exeName}. Se abrirá http://127.0.0.1:47823 en tu navegador.`,
    '3. Inicia The Binding of Isaac y juega. Deja esta ventana abierta.',
    '',
    'Opciones: --port <n>  --no-open  --log <ruta log.txt>  --game-dir <carpeta del juego>  --update-data',
    'Datos de objetos: Binding of Isaac Wiki (bindingofisaacrebirth.wiki.gg), licencia CC BY-SA 4.0.',
  ].join('\r\n'),
);

// 4. Zip (Windows: built-in tar.exe supports zip; elsewhere use zip if available)
try {
  if (process.platform === 'win32') execFileSync('tar.exe', ['-a', '-c', '-f', 'release/IsaacCompanion-win-x64.zip', '-C', 'release', 'IsaacCompanion'], { stdio: 'inherit' });
  else execFileSync('zip', ['-qr', 'IsaacCompanion.zip', 'IsaacCompanion'], { cwd: 'release', stdio: 'inherit' });
} catch {
  console.warn('zip step skipped');
}
console.log(`\nRelease ready in ${out}`);
