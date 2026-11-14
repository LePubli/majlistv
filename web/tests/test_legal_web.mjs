// Étape D — pages légales côté site : langue du visiteur (repli français signalé), éditeur admin (modèle / texte personnalisé, 3 langues).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const page = read('app/legal/[slug]/page.js');
assert.ok(page.includes('call(`/legal/${slug}?lang=${locale}`'), 'page dans la langue du visiteur');
assert.match(page, /page\.lang !== locale && <p className="meta small">\{t\('legalFrOnly'\)\}<\/p>/);
assert.match(page, /dir=\{page\.lang === 'ar' \? 'rtl' : undefined\}/);
const adm = read('app/admin/page.js');
for (const p of ["call('/admin/legal/' + slug)", '`/admin/legal/${d.slug}/custom`', "method: 'DELETE'", 'Personnaliser le texte', 'Revenir au modèle automatique', 'section=legal', "['fr', 'en', 'ar'].map"]) assert.ok(adm.includes(p), p);
assert.match(read('components/SettingsHub.js'), /groups: \['general', 'legal', /);
const i18n = read('lib/i18n.js');
assert.equal((i18n.match(/^    legalFrOnly: /gm) || []).length, 3);
console.log('test_legal_web : OK');
