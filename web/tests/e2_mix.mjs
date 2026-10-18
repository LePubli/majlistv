// Étape E2 — calculs du son de l'éditeur (web/modules/editor/ops.js), sans navigateur.
// Lancement depuis la racine du dépôt : node web/tests/e2_mix.mjs
import * as op from '../modules/editor/ops.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const near = (a, b, e = 0.005) => Math.abs(a - b) <= e;

const a = op.withAudio({ dub: { duck: 20 } });
ok(a.orig.gainDb === 0 && a.dub.duck === 20 && a.dub.fade === 0.5 && a.loudness.target === -16 && a.music.length === 0, 'réglages complétés par les valeurs par défaut');
ok(near(op.dbToLin(-6), 0.501, 0.002) && op.dbToLin(0) === 1, 'décibels → volume');
const clips = [{ id: 'c1', in: 0, out: 60 }];
const segs = [{ s: 0, e: 5, keep: false }, { s: 6, e: 11, keep: false }, { s: 12, e: 17, keep: true }];
const ctx = { hasDub: true, dubSp: op.dubSpans(clips, segs), speechSp: op.speechSpans(clips, segs), joins: [] };
ok(ctx.dubSp.length === 2, 'passages de la voix française : sans ceux gardés en voix d\'origine');
ok(near(op.mixAt(3, a, ctx).orig, 0.2), 'voix d\'origine à 20 % sous la voix française');
ok(near(op.mixAt(14, a, ctx).orig, 1), 'passage en voix d\'origine : volume plein');
ok(near(op.mixAt(5.25, a, ctx).orig, 0.6), 'fondu de 0,5 s : à mi-chemin, 60 %');
ok(near(op.mixAt(3, { ...a, dub: { ...a.dub, use: false } }, ctx).orig, 1) && op.mixAt(3, { ...a, dub: { ...a.dub, use: false } }, ctx).dub === 0, 'voix française non utilisée : rien ne baisse');
ok(op.mixAt(3, { ...a, orig: { ...a.orig, mute: true } }, ctx).orig === 0, 'voix d\'origine coupée');
ok(op.mixAt(3, { ...a, dub: { ...a.dub, gainDb: 6 } }, ctx).dub === 1, 'au-dessus de 0 dB : 100 % dans l\'aperçu (le gain réel au rendu)');
const j = { ...ctx, joins: [30] };
ok(op.mixAt(30, a, j).orig === 0 && near(op.mixAt(30.0075, a, j).orig, 0.5) && op.mixAt(30.02, a, j).orig === 1, 'fondu de 30 ms à un raccord');
// musique
let r = op.addMusic([], 'A', 2, 20, 60);
const m = r.items[0];
ok(m.start === 2 && m.len === 58 && m.loop === true && m.id === 'm1', 'musique de 20 s ajoutée à 0:02 : jusqu\'à la fin, en boucle');
ok(op.musicTime(m, 25, 20) === 3 && op.musicTime(m, 1, 20) === null, 'position dans le fichier (boucle)');
const am = { ...a, music: r.items };
const v1 = op.mixAt(3, am, ctx).music.m1; const v2 = op.mixAt(14, am, ctx).music.m1;
ok(v1 < v2 && near(v2, op.dbToLin(-12)), 'musique baissée sous la voix française (−12 dB de plus)');
ok(op.mixAt(2.5, am, ctx).music.m1 < op.mixAt(4.5, am, ctx).music.m1 * 2, 'fondu d\'entrée');
r = op.addMusic([], 'B', 10, 60, 30);
ok(r.items[0].loop === false && r.items[0].len === 20, 'musique plus longue que la place : coupée à la fin du montage, sans boucle');
let it = op.moveMusic(r.items, 'm1', -5); ok(it[0].start === 0, 'déplacer : jamais avant 0');
it = op.trimMusic(r.items, 'm1', 'in', 15, 60); ok(it[0].start === 15 && it[0].offset === 5 && it[0].len === 15, 'raccourcir par le début : décalage dans le fichier');
it = op.trimMusic(r.items, 'm1', 'out', 200, 60); ok(it[0].len === 60, 'rallonger sans boucle : limité à la durée du fichier');
ok(op.envelope(5.25, [{ ts: 0, te: 5 }], 0.5) === 0.5, 'enveloppe : rampe linéaire');
const pk = op.decodePeaks(Buffer.from([0, 128, 255, 10]).toString('base64'));
ok(pk.length === 4 && op.peakBetween(pk, 100, 0.1, 0.25) === 1, 'formes d\'onde : décodage et pic maximal');
console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
