// Bundles the Companion (bridge + backend + importers) into one CommonJS file
// suitable for a Node.js Single Executable Application.
import { build } from 'esbuild';

await build({
  entryPoints: ['companion/src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/companion.cjs',
  tsconfig: 'tsconfig.json',
  // ws optional native accelerators are not needed.
  external: ['bufferutil', 'utf-8-validate'],
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  legalComments: 'none',
  logLevel: 'info',
});
