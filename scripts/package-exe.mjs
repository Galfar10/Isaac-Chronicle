// npm run package — builds release/IsaacCompanion/ with a single executable (Node SEA)
// plus the web UI, migrations and seed data next to it, and archives it.
// Builds for the OS and CPU it runs on: Windows (.zip), Linux / Steam Deck (.tar.gz), macOS (.zip).
// https://nodejs.org/api/single-executable-applications.html
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const os = process.platform;
const win = os === 'win32';
const mac = os === 'darwin';
const out = join('release', 'IsaacCompanion');
const exeName = win ? 'IsaacCompanion.exe' : 'isaac-companion';
const target = `${win ? 'win' : mac ? 'macos' : 'linux'}-${process.arch}`;
const archive = `IsaacCompanion-${target}.${os === 'linux' ? 'tar.gz' : 'zip'}`;
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
if (!win) chmodSync(exe, 0o755);
// macOS refuses to run a binary whose signature no longer matches: drop it, inject, sign again (ad hoc).
if (mac) execFileSync('codesign', ['--remove-signature', exe], { stdio: 'inherit' });
const postject = join('node_modules', 'postject', 'dist', 'cli.js');
const args = [postject, exe, 'NODE_SEA_BLOB', 'dist/sea-prep.blob', '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
if (mac) args.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, args, { stdio: 'inherit' });
if (mac) execFileSync('codesign', ['--sign', '-', exe], { stdio: 'inherit' });

// 3. Assets next to the executable
cpSync('web/dist', join(out, 'web'), { recursive: true });
cpSync('database/migrations', join(out, 'migrations'), { recursive: true });
mkdirSync(join(out, 'seed'), { recursive: true });
for (const f of ['wiki.json', 'overrides.json']) {
  if (existsSync(join('database/seed', f))) copyFileSync(join('database/seed', f), join(out, 'seed', f));
}
if (os === 'linux') {
  // Starts and stops the Companion together with the game (Steam launch options).
  copyFileSync(join('scripts', 'steam-launch.sh'), join(out, 'steam-launch.sh'));
  chmodSync(join(out, 'steam-launch.sh'), 0o755);
}

const howToRun = win
  ? [`2. Ejecuta ${exeName}. Se abrirá http://127.0.0.1:47823 en tu navegador.`]
  : mac
    ? [
        `2. Abre ${exeName} (doble clic: se abre en Terminal). Se abrirá http://127.0.0.1:47823 en tu navegador.`,
        '   La primera vez macOS lo bloquea por no estar firmado por Apple. Abre Terminal y ejecuta:',
        '     xattr -dr com.apple.quarantine ~/Downloads/IsaacCompanion',
        '   (o Ajustes del Sistema > Privacidad y seguridad > "Abrir igualmente").',
      ]
    : [
        '2. Steam Deck / Linux: en Steam, Isaac > Propiedades > Parámetros de lanzamiento, escribe',
        '     "/home/deck/IsaacCompanion/steam-launch.sh" %command%',
        '   (con la ruta donde hayas descomprimido esta carpeta). La app arranca y se cierra con el juego.',
        `   También puedes abrirla a mano desde una terminal: ./${exeName}`,
      ];
const eol = win ? '\r\n' : '\n';
writeFileSync(
  join(out, 'LEEME.txt'),
  [
    'ISAAC CHRONICLE - COMPANION',
    '',
    '1. Suscríbete al mod "Isaac Chronicle" en Steam Workshop.',
    ...howToRun,
    '3. Inicia The Binding of Isaac y juega. Deja la app abierta mientras juegas.',
    '',
    'Opciones: --port <n>  --no-open  --lan  --log <ruta log.txt>  --game-dir <carpeta del juego>  --update-data',
    'Más ayuda: https://github.com/Galfar10/Isaac-Chronicle/blob/main/INSTALL.md',
    'Datos de objetos: Binding of Isaac Wiki (bindingofisaacrebirth.wiki.gg), licencia CC BY-SA 4.0.',
    '',
  ].join(eol),
);

// 4. Archive. Windows: built-in tar.exe writes zip. Linux: tar.gz keeps the executable bit everywhere.
try {
  if (win) execFileSync('tar.exe', ['-a', '-c', '-f', `release/${archive}`, '-C', 'release', 'IsaacCompanion'], { stdio: 'inherit' });
  else if (mac) execFileSync('zip', ['-qry', archive, 'IsaacCompanion'], { cwd: 'release', stdio: 'inherit' });
  else execFileSync('tar', ['-czf', archive, 'IsaacCompanion'], { cwd: 'release', stdio: 'inherit' });
  console.log(`Archive: release/${archive}`);
} catch {
  console.warn('archive step skipped');
}
console.log(`\nRelease ready in ${out}`);
