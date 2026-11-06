// Catalogue des adhans : lit assets/sounds/adhans.json, vérifie les fichiers MP3, puis
//   1) déclare les sons dans app.json (plugin expo-notifications → "sounds"), nécessaire au son des notifications ;
//   2) génère src/lib/adhans.generated.ts (liste + fichiers pour l'écoute d'essai).
// Usage :  node scripts/sync-adhans.mjs          (met à jour)
//          node scripts/sync-adhans.mjs --check  (échoue si app.json / adhans.generated.ts ne sont pas à jour : utilisé par les tests)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const list = JSON.parse(readFileSync(join(root, 'assets/sounds/adhans.json'), 'utf8'));
if (!Array.isArray(list)) throw new Error('adhans.json doit être une liste');
const ids = new Set();
for (const a of list) {
  if (!/^[a-z0-9-]{2,30}$/.test(a.id || '')) throw new Error(`id invalide : ${a.id} (minuscules, chiffres, tirets)`);
  if (ids.has(a.id)) throw new Error(`id en double : ${a.id}`);
  ids.add(a.id);
  if (!a.name || typeof a.name !== 'string') throw new Error(`nom manquant pour ${a.id}`);
  if (!/^[a-z0-9_-]+\.mp3$/.test(a.file || '')) throw new Error(`fichier invalide pour ${a.id} : ${a.file} (un .mp3, nom sans espace ni majuscule)`);
  if (!existsSync(join(root, 'assets/sounds', a.file))) throw new Error(`fichier introuvable : assets/sounds/${a.file}`);
}

// 1) app.json : édition ciblée du bloc expo-notifications (le reste du fichier garde sa mise en forme)
const appPath = join(root, 'app.json');
const appRaw = readFileSync(appPath, 'utf8');
const blockRe = /("expo-notifications",\s*\{)([^}]*)(\})/;
const m = appRaw.match(blockRe);
if (!m) throw new Error('plugin expo-notifications introuvable dans app.json');
let inner = m[2].replace(/,\s*"sounds":\s*\[[^\]]*\]/, '');
if (list.length) inner = inner.replace(/\s*$/, '') + `,\n          "sounds": [${list.map((a) => JSON.stringify(`./assets/sounds/${a.file}`)).join(', ')}]\n        `;
const appOut = appRaw.replace(blockRe, `$1${inner}$3`);
JSON.parse(appOut); // doit rester du JSON valide

// 2) fichier généré
const gen = `// FICHIER GÉNÉRÉ par scripts/sync-adhans.mjs à partir de assets/sounds/adhans.json — ne pas modifier à la main.
export type Adhan = { id: string; name: string; file: string; asset: number };
export const ADHANS: Adhan[] = [${list.map((a) => `
  { id: ${JSON.stringify(a.id)}, name: ${JSON.stringify(a.name)}, file: ${JSON.stringify(a.file)}, asset: require('../../assets/sounds/${a.file}') },`).join('')}${list.length ? '\n' : ''}];
`;
const genPath = join(root, 'src/lib/adhans.generated.ts');

const same = (p, txt) => existsSync(p) && readFileSync(p, 'utf8') === txt;
if (check) {
  if (!same(appPath, appOut)) { console.error('app.json (sounds) pas à jour : lancer node scripts/sync-adhans.mjs'); process.exit(1); }
  if (!same(genPath, gen)) { console.error('src/lib/adhans.generated.ts pas à jour : lancer node scripts/sync-adhans.mjs'); process.exit(1); }
  console.log(`OK : ${list.length} adhan(s) à jour`);
} else {
  writeFileSync(appPath, appOut); writeFileSync(genPath, gen);
  console.log(`${list.length} adhan(s) : app.json et src/lib/adhans.generated.ts mis à jour`);
}
