import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Nitro bundles PGlite's JS, but its WASM and data files are loaded relative to
// that bundle at runtime. Keep the assets alongside the bundled library.
const packageDir=dirname(fileURLToPath(import.meta.resolve('@electric-sql/pglite')));
const destination='.output/server/_libs';
if (existsSync('.output/server')) {
  mkdirSync(destination,{recursive:true});
  for(const name of ['pglite.wasm','initdb.wasm','pglite.data']) copyFileSync(join(packageDir,name),join(destination,name));
  console.log('Packaged the embedded database runtime.');
}
