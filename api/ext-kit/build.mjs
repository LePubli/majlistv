// Fabrique le .zip d'une extension à partir de son dossier :   node api/ext-kit/build.mjs mon-extension/ mon-extension.zip
// Le .zip est contrôlé (mêmes règles que le site) avant d'être écrit.
import fs from 'node:fs';
import path from 'node:path';
import { writeZip } from '../src/zip.js';
import { parseExtPack } from '../src/extPack.js';
import { folderEntries } from '../src/themeKit.js';

export const zipFolder = (dir) => writeZip(folderEntries(dir));

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) { console.error('Usage : node api/ext-kit/build.mjs <dossier-de-l-extension> <sortie.zip>'); process.exit(2); }
  const buf = zipFolder(dir);
  const r = parseExtPack(buf);
  for (const w of r.warnings) console.log('⚠ ' + w);
  if (!r.ok) { for (const e of r.errors) console.error('✗ ' + e); console.error(`\n${r.errors.length} erreur(s) : le .zip n'a pas été écrit.`); process.exit(1); }
  fs.writeFileSync(out, buf);
  console.log(`✓ ${out} (${Math.round(buf.length / 1024)} Ko) : « ${r.summary.name} » ${r.summary.version}, ${r.summary.blocks} bloc(s) gabarit, ${r.summary.composed} composé(s).`);
}
