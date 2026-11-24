// Fabrique le .zip d'un thème à partir de son dossier :   node api/theme-kit/build.mjs mon-theme/ mon-theme.zip
// Le .zip est reproductible (mêmes fichiers = mêmes octets) et contrôlé avant d'être écrit.
import fs from 'node:fs';
import path from 'node:path';
import { writeZip } from '../src/zip.js';
import { parsePack } from '../src/themePack.js';
import { folderEntries } from '../src/themeKit.js';

export const zipFolder = (dir) => writeZip(folderEntries(dir));

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) { console.error('Usage : node api/theme-kit/build.mjs <dossier-du-thème> <sortie.zip>'); process.exit(2); }
  const buf = zipFolder(dir);
  const r = parsePack(buf);
  for (const w of r.warnings) console.log('⚠ ' + w);
  if (!r.ok) { for (const e of r.errors) console.error('✗ ' + e); console.error(`\n${r.errors.length} erreur(s) : le .zip n'a pas été écrit.`); process.exit(1); }
  fs.writeFileSync(out, buf);
  console.log(`✓ ${out} (${Math.round(buf.length / 1024)} Ko) : « ${r.summary.name} » ${r.summary.version}, ${r.summary.pages} page(s), ${r.summary.globals} section(s) globale(s), ${r.summary.templates} modèle(s).`);
}
