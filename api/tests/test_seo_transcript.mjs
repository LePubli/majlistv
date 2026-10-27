// Étape 35 — Regroupement de la transcription en paragraphes horodatés. Lancer : node tests/test_seo_transcript.mjs
import assert from 'node:assert/strict';
import { paragraphs } from '../src/seoTranscript.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };
const seg = (i, start, text, dur = 3000) => ({ start_ms: start, end_ms: start + dur, text });

ok(paragraphs([]).length === 0 && paragraphs(null ?? []).length === 0, 'aucune phrase : aucun paragraphe');
let p = paragraphs([seg(0, 0, 'Bonjour'), seg(1, 3000, 'à tous.'), seg(2, 6000, 'Merci.')]);
ok(p.length === 1 && p[0].text === 'Bonjour à tous. Merci.' && p[0].ms === 0, 'phrases proches : un seul paragraphe, texte joint');
p = paragraphs([seg(0, 0, 'Première partie.'), seg(1, 3000, 'Suite.'), seg(2, 20000, 'Après une pause.')]);
ok(p.length === 2 && p[1].ms === 20000, 'pause marquée : nouveau paragraphe horodaté');
const long = Array.from({ length: 40 }, (_, i) => seg(i, i * 3000, 'x'.repeat(60)));
p = paragraphs(long, { maxChars: 300 });
ok(p.length > 3 && p.every((x) => x.text.length <= 300), 'taille maximale respectée');
p = paragraphs(Array.from({ length: 100 }, (_, i) => seg(i, i * 1000, 'mot', 900)), { maxMs: 30000, pauseMs: 99999 });
ok(p.length >= 3 && p[1].ms >= 30000, 'durée maximale d\'un paragraphe');
p = paragraphs([seg(0, 0, '  espaces\n\n multiples  '), seg(1, 2000, ''), seg(2, 3000, '   ')]);
ok(p.length === 1 && p[0].text === 'espaces multiples', 'espaces nettoyés, phrases vides ignorées');
p = paragraphs(Array.from({ length: 50 }, (_, i) => seg(i, i * 3000, 'a'.repeat(100))), { totalChars: 1000 });
ok(p.map((x) => x.text).join(' ').length <= 1000, 'plafond total de caractères');
ok(paragraphs([{ startMs: 5000, endMs: 6000, text: 'camel' }])[0].ms === 5000, 'accepte aussi startMs / endMs');
console.log(`\n${n} vérifications réussies`);
