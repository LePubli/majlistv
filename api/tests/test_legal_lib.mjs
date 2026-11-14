// Étape D : modèles des pages légales (remplissage, lignes facultatives, mentions « à compléter », trois langues complètes).
import assert from 'node:assert/strict';
import { fillTemplate, LEGAL_TEMPLATES, LEGAL_FIELDS, LEGAL_SLUGS } from '../src/legalTemplates.js';

const full = Object.fromEntries(Object.keys(LEGAL_FIELDS).map((k) => [k, `V-${k}`]));
full.app = 'Mejliss TV'; full.site = 'site.test'; full.askDays = '90';
let r = fillTemplate('A {{company}}\n?? - Capital : {{capital}}\nB', { company: 'Le Publicitaire' }, 'fr');
assert.equal(r.text, 'A Le Publicitaire\nB', 'ligne facultative retirée si vide');
assert.deepEqual(r.missing, []);
r = fillTemplate('Siège : {{address}}', {}, 'fr');
assert.equal(r.text, 'Siège : [à compléter : adresse du siège]');
assert.deepEqual(r.missing, ['address']);
assert.equal(fillTemplate('{{address}}', {}, 'en').text, '[to be completed : registered address]');
assert.equal(fillTemplate('{{address}}', {}, 'ar').text, '[يُستكمل : عنوان المقر]');
for (const slug of LEGAL_SLUGS) {
  for (const l of ['fr', 'en', 'ar']) {
    const t = LEGAL_TEMPLATES[slug][l];
    assert.ok(t && t.title && t.body.length > 600, `${slug}/${l}`);
    const f = fillTemplate(t.body, full, l);
    assert.deepEqual(f.missing, [], `${slug}/${l} : toutes les clés sont connues`);
    assert.doesNotMatch(f.text, /\{\{|\?\? /, `${slug}/${l} : rien de non remplacé`);
    const keysIn = (b) => [...new Set([...b.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort().join(',');
    assert.equal(keysIn(t.body), keysIn(LEGAL_TEMPLATES[slug].fr.body), `${slug}/${l} : mêmes informations que la version française`);
    assert.equal((t.body.match(/^## /gm) || []).length, (LEGAL_TEMPLATES[slug].fr.body.match(/^## /gm) || []).length, `${slug}/${l} : mêmes sections`);
    if (l !== 'fr') assert.match(t.body, /French version prevails|النسخة الفرنسية هي المعتمدة/);
  }
}
const cgv = LEGAL_TEMPLATES.cgv.fr.body;
for (const p of ['L221-28', 'Location', 'Cartes cadeaux', 'Espace enfants', 'fatwa', '{{mediator}}', 'renouvelle automatiquement']) assert.ok(cgv.includes(p), p);
const pr = LEGAL_TEMPLATES.confidentialite.fr.body;
for (const p of ['Stripe', 'Anthropic', 'DeepSeek', 'Microsoft Azure', 'Firebase', 'CNIL', '{{askDays}}', 'environ 10 km', 'Do Not Track']) assert.ok(pr.includes(p), p);
console.log('test_legal_lib : OK');
