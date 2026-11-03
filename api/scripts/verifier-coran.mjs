// Vérification du texte du Coran enregistré dans la base (à lancer sur le VPS, dans le conteneur de l'API).
// Compare, verset par verset et caractère par caractère, ce que le site et l'application affichent avec le fichier d'origine
// importé par « Ajouter le Coran complet » (Tanzil Uthmani ; traduction Hamidullah), téléchargé de nouveau à son adresse figée.
// Contrôle aussi la structure : 114 sourates, 6236 versets, nombre de versets de chaque sourate, caractères inattendus.
// Lecture seule : rien n'est modifié. Code de sortie 0 = tout est identique ; 1 = au moins un écart (listé).
//
// Usage (sur le VPS, après le Redeploy de majlistv-api qui embarque ce fichier) :
//   docker exec dockpanel-git-majlistv-api node scripts/verifier-coran.mjs
// Options (variables d'environnement) : API_DIR (défaut /app), REF_DIR (dossier contenant déjà les fichiers de référence,
// sinon ils sont téléchargés), SLUGS (ressources à vérifier, défaut « ar-tanzil-uthmani,fr-hamidullah »).
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const API = process.env.API_DIR || '/app';
const RAW = 'https://raw.githubusercontent.com/risan/quran-json/6523a9ad3b73bb7e8cb3a9cdf0ea774b8bab3123/data/';
const REFS = {
  'ar-tanzil-uthmani': { file: 'tanzil/uthmani.json', label: 'Texte arabe (Tanzil, Hafs, Uthmani)', arabic: true },
  'fr-hamidullah': { file: 'quranenc/french_hameedullah.json', label: 'Traduction française (Hamidullah, QuranEnc 1.0.2)', arabic: false },
};
const slugs = (process.env.SLUGS || Object.keys(REFS).join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const { pool } = await import(join(API, 'src/db.js'));
const { parseContent, fetchText } = await import(join(API, 'src/modules/quran/lib.js'));
const { SURA_VERSES } = await import(join(API, 'src/modules/quran/juz.js'));

const sha = (rows) => createHash('sha256').update(rows.map((r) => `${r.sura}|${r.aya}|${r.text}`).join('\n')).digest('hex');
let errors = 0;
const fail = (msg) => { errors++; console.log('  ✗ ' + msg); };

for (const slug of slugs) {
  const ref = REFS[slug];
  if (!ref) { console.log(`\n${slug} : pas de fichier de référence connu, ignoré.`); continue; }
  console.log(`\n== ${ref.label} (${slug})`);
  const res = (await pool.query('SELECT id, enabled, verse_count FROM quran_resources WHERE slug = $1', [slug])).rows[0];
  if (!res) { console.log('  — ressource absente de la base (pas importée) : rien à vérifier.'); continue; }
  console.log(`  ressource n° ${res.id}, ${res.enabled ? 'affichée' : 'NON affichée'}, ${res.verse_count} versets annoncés`);

  // Référence : fichier d'origine, lu exactement comme à l'import (même fonction parseContent du serveur).
  const content = process.env.REF_DIR ? await readFile(join(process.env.REF_DIR, ref.file.split('/').pop()), 'utf8') : await fetchText(RAW + ref.file);
  const parsed = parseContent('json', content);
  if (parsed.error) { fail(`fichier de référence illisible : ${parsed.error}`); continue; }
  const want = parsed.rows;
  const got = (await pool.query('SELECT sura, aya, text FROM quran_verses WHERE resource_id = $1 ORDER BY sura, aya', [res.id])).rows;

  // Structure
  if (want.length !== 6236) fail(`référence : ${want.length} versets (6236 attendus)`);
  if (got.length !== 6236) fail(`base : ${got.length} versets (6236 attendus)`);
  const per = new Map(); for (const r of got) per.set(r.sura, (per.get(r.sura) || 0) + 1);
  for (let s = 1; s <= 114; s++) if ((per.get(s) || 0) !== SURA_VERSES[s - 1]) fail(`sourate ${s} : ${per.get(s) || 0} versets en base, ${SURA_VERSES[s - 1]} attendus`);

  // Verset par verset, caractère par caractère
  const byKey = new Map(got.map((r) => [r.sura * 1000 + r.aya, r.text]));
  let same = 0; let shown = 0;
  for (const w of want) {
    const g = byKey.get(w.sura * 1000 + w.aya);
    if (g === w.text) { same++; continue; }
    if (shown++ < 15) fail(`${w.sura}:${w.aya} ${g === undefined ? 'absent de la base' : 'différent du fichier d\'origine'}`);
    else errors++;
  }
  const extra = got.filter((r) => !want.some((w) => w.sura === r.sura && w.aya === r.aya)).length;
  if (extra) fail(`${extra} verset(s) en base qui n'existent pas dans le fichier d'origine`);

  // Caractères inattendus dans le texte arabe (remplacement, lettres latines, balises, chiffres)
  if (ref.arabic) {
    const bad = got.filter((r) => /[�A-Za-z<>0-9]/.test(r.text));
    if (bad.length) fail(`${bad.length} verset(s) arabes contiennent des caractères inattendus (ex. ${bad[0].sura}:${bad[0].aya})`);
  }
  console.log(`  ${same} / ${want.length} versets identiques au fichier d'origine`);
  console.log(`  empreinte base      : ${sha(got)}`);
  console.log(`  empreinte référence : ${sha(want)}`);
}

await pool.end();
console.log(errors ? `\nRÉSULTAT : ${errors} écart(s). Ne rien corriger à la main : réimporter (Admin → Coran → « Ajouter le Coran complet ») puis relancer.` : '\nRÉSULTAT : 0 écart — le texte enregistré est identique, caractère par caractère, au fichier d\'origine.');
process.exit(errors ? 1 : 0);
