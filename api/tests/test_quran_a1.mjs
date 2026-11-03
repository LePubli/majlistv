// Étape A1 / A1 bis — récitateurs verset par verset ({ayahg}, catalogues EveryAyah et Islamic Network) et mot à mot aligné
// sur le texte arabe affiché (basmala du verset 1). Données fictives, sans texte réel ; aucun accès au réseau.
import assert from 'node:assert/strict';
const L = await import('../src/modules/quran/lib.js');
const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

// Numéro global et adresse du fichier
ok(L.globalAyah(1, 1) === 1 && L.globalAyah(2, 255) === 262 && L.globalAyah(114, 6) === 6236, 'numéro du verset de 1 à 6236');
ok(L.reciterFileUrl('https://cdn.islamic.network/quran/audio/128/ar.alafasy/{ayahg}.mp3', 2, 255).endsWith('/262.mp3'), '{ayahg} remplacé');
ok(L.reciterFileUrl('https://everyayah.com/data/X/{sura3}{aya3}.mp3', 18, 10).endsWith('/018010.mp3'), '{sura3}{aya3} remplacés');
ok(L.checkReciterUrl('https://cdn.islamic.network/quran/audio/128/ar.alafasy/{ayahg}.mp3').origin === 'https://cdn.islamic.network', 'modèle {ayahg} accepté');
ok(L.checkReciterUrl('https://everyayah.com/data/X/{sura3}{aya3}.mp3').origin === 'https://everyayah.com', 'modèle {sura3}{aya3} toujours accepté');
ok(L.checkReciterUrl('https://x.example/{sura3}.mp3').error, 'modèle sans verset refusé');
ok(L.checkReciterUrl('http://x.example/{ayahg}.mp3').error, 'http refusé');

// Catalogue EveryAyah
const ea = L.parseEveryAyah('var recitations = ' + JSON.stringify({
  ayahCount: [7, 286], 1: { subfolder: 'Reciter_One_64kbps', name: 'Reciter One', bitrate: '64kbps' },
  2: { subfolder: 'Reciter_Two_128kbps', name: 'Reciter Two', bitrate: '128kbps' }, 3: { subfolder: '../bad', name: 'x' }, x: { subfolder: 'Nope' },
}) + ';');
ok(ea.items.length === 2, 'EveryAyah : 2 récitateurs valides (dossier invalide et clé non numérique écartés)');
ok(ea.items[0].slug === 'ea-reciter_one_64kbps' && ea.items[0].name === 'Reciter One (64kbps)', 'EveryAyah : identifiant et nom');
ok(ea.items[1].urlTemplate === 'https://everyayah.com/data/Reciter_Two_128kbps/{sura3}{aya3}.mp3', 'EveryAyah : adresse modèle');
ok(!L.checkReciterUrl(ea.items[0].urlTemplate).error && /vérifier/.test(ea.items[0].license), 'EveryAyah : modèle valide, licence « à vérifier »');
ok(L.parseEveryAyah('pas du json').error, 'EveryAyah : catalogue illisible signalé');

// Catalogue Islamic Network
const isl = L.parseIslamicEditions(JSON.stringify({ data: [
  { identifier: 'ar.reciterone', language: 'ar', name: 'قارئ', englishName: 'Reciter One', format: 'audio', type: 'versebyverse' },
  { identifier: 'en.walk', language: 'en', name: 'x', englishName: 'English audio', format: 'audio', type: 'versebyverse' },
  { identifier: 'ar.text', language: 'ar', name: 'x', englishName: 'Text', format: 'text', type: 'quran' },
] }));
ok(isl.editions.length === 1 && isl.editions[0].identifier === 'ar.reciterone', 'Islamic Network : seules les récitations arabes verset par verset');
ok(L.islamicTemplate('https://cdn.islamic.network/quran/audio/64/ar.reciterone/1.mp3', 'ar.reciterone') === 'https://cdn.islamic.network/quran/audio/64/ar.reciterone/{ayahg}.mp3', 'Islamic Network : débit lu sur le premier verset');
ok(L.islamicTemplate(null, 'ar.reciterone') === 'https://cdn.islamic.network/quran/audio/128/ar.reciterone/{ayahg}.mp3', 'Islamic Network : 128 kb/s par défaut');
ok(L.islamicTemplate('https://evil.example/1.mp3', 'ar.reciterone').startsWith('https://cdn.islamic.network/'), 'Islamic Network : adresse inattendue ignorée');
const it = L.islamicItem(isl.editions[0], L.islamicTemplate(null, 'ar.reciterone'));
ok(it.slug === 'in-ar-reciterone' && it.name === 'Reciter One — قارئ' && !L.checkReciterUrl(it.urlTemplate).error, 'Islamic Network : fiche du récitateur');

// Catalogue complet avec un faux téléchargement (aucun réseau)
const fake = async (u) => (u.includes('edition?') ? JSON.stringify({ data: [{ identifier: 'ar.reciterone', language: 'ar', name: 'قارئ', englishName: 'Reciter One', format: 'audio', type: 'versebyverse' }] })
  : JSON.stringify({ data: { audio: 'https://cdn.islamic.network/quran/audio/192/ar.reciterone/1.mp3' } }));
const cat = await L.reciterCatalog('islamic', { fetcher: fake, now: 1 });
ok(cat.items[0].urlTemplate.includes('/192/ar.reciterone/{ayahg}.mp3'), 'catalogue Islamic Network assemblé (débit 192)');

// Mot à mot : alignement sur le texte affiché
ok(L.alignWords(2, 5, 'a b c', ['1', '2', '3']).join() === '1,2,3', 'alignement : même nombre de mots');
ok(L.alignWords(2, 1, 'b1 b2 b3 b4 x y', ['X', 'Y']).join() === ',,,,X,Y', 'alignement : basmala du verset 1 laissée sans sens');
ok(L.alignWords(1, 1, 'b1 b2 b3 b4 x y', ['X', 'Y']) === null && L.alignWords(9, 1, 'b1 b2 b3 b4 x y', ['X', 'Y']) === null, 'alignement : pas pour Al-Fatiha ni At-Tawba');
ok(L.alignWords(2, 7, 'a b c', ['1', '2']) === null, 'alignement : nombres différents → pas de mot à mot pour ce verset');

// Mot à mot : formats de fichiers (QUL : clés « s:a:m », tableau imbriqué) et numéro du verset en dernier « mot »
const w1 = L.parseWords(JSON.stringify({ '1:1:1': 'un', '1:1:2': { t: 'deux' }, '1:1:3': '(1)', '1:2:1': 'trois' }));
ok(w1.rows[0].words.join('|') === 'un|deux' && w1.rows[1].words.join('|') === 'trois', 'mot à mot : clés « s:a:m », objet { t }, numéro du verset retiré');
const w2 = L.parseWords(JSON.stringify([[1, 1, 1, 'a'], [1, 1, 2, 'b'], [2, 3, 1, 'c']]));
ok(w2.rows.length === 2 && w2.rows[0].words.join('') === 'ab', 'mot à mot : tableau [sourate, verset, mot, texte]');
console.log('test_quran_a1 : tout est OK');
