// Copie dans l'application le calcul des horaires de prière du site (web/lib/prayer*.js) : MÊMES horaires sur le site et sur le téléphone.
// Usage : node scripts/import-prayer.mjs   (à relancer si le calcul du site change ; le test « prayer.test.ts » vérifie que les copies sont à jour)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../src/lib/prayer');
mkdirSync(out, { recursive: true });
for (const f of ['prayerTimes.js', 'prayerCities.js', 'prayerLogic.js']) {
  const src = readFileSync(join(here, '../../web/lib', f), 'utf8');
  writeFileSync(join(out, f), `// COPIE de web/lib/${f} — ne pas modifier ici : node scripts/import-prayer.mjs\n${src}`);
  console.log('copié :', f);
}
