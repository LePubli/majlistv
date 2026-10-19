// Étape E3 — calculs de l'habillage de l'éditeur (web/modules/editor/ops.js, section E3), sans navigateur.
// Lancement depuis la racine du dépôt : node web/tests/e3_dress.mjs
import * as op from '../modules/editor/ops.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const near = (a, b, e = 0.005) => Math.abs(a - b) <= e;

// --- valeurs par défaut et vide
const d0 = op.withDress(null);
ok(d0.items.length === 0 && d0.logo.on === false && d0.logo.pos === 'tr' && d0.logo.size === 12 && d0.intro.len === 4 && d0.outro.len === 5
  && d0.subs.scale === 100 && d0.subs.box === true && d0.transitions.all === null, 'habillage par défaut');
ok(op.dressEmpty(d0), 'habillage par défaut = vide');
ok(!op.dressEmpty({ ...d0, subs: { ...d0.subs, burn: true } }) && !op.dressEmpty({ ...d0, transitions: { all: { type: 'dip', len: 1 }, byClip: {} } }) && !op.dressEmpty({ ...d0, logo: { ...d0.logo, on: true } }), 'sous-titres incrustés, transition ou logo : pas vide');
const d1 = op.withDress({ items: [{ id: 't1', kind: 'title', start: 1, len: 3 }], logo: { on: true } });
ok(d1.items[0].text === '' && d1.items[0].pos === 'center' && d1.items[0].scale === 100 && d1.logo.size === 12 && d1.logo.on, 'valeurs manquantes complétées');
ok(JSON.stringify(op.withDress(op.withDress(d1))) === JSON.stringify(d1), 'withDress est stable (pas de dérive à la sauvegarde)');

// --- variables
ok(op.fillVars('{intervenant} — {titre}', { titre: 'La patience', intervenant: 'Cheikh' }) === 'Cheikh — La patience', 'variables {titre} et {intervenant}');
ok(op.fillVars('{inconnu} {titre}', { titre: 'X' }) === '{inconnu} X' && op.fillVars(null) === '', 'variable inconnue laissée, texte vide');
ok(op.fillVars('{titre}', {}) === '', 'variable sans valeur : texte vide');

// --- ajouter, déplacer, raccourcir
let r = op.addItem([], 'banner', 10, 100);
ok(r.id === 't1' && r.items[0].kind === 'banner' && r.items[0].start === 10 && r.items[0].len === 6 && r.items[0].text === '{intervenant}' && r.items[0].sub === '{titre}', 'bandeau de nom ajouté (6 s, {intervenant} / {titre})');
r = op.addItem(r.items, 'title', 98.7, 100);
ok(r.id === 't2' && near(r.items[1].start, 98.7) && near(r.items[1].len, 1.3), 'titre ajouté près de la fin : reste dans le montage');
r = op.addItem(r.items, 'title', 100, 100);
ok(r.items[2].start <= 99.5 && r.items[2].len >= 0.5, 'titre ajouté à la toute fin : recalé pour tenir 0,5 s');
let it = op.moveItem(r.items, 't1', -5); ok(it[0].start === 0, 'déplacer avant 0 : bloqué à 0');
it = op.moveItem(r.items, 't1', 20.1239); ok(it[0].start === 20.124, 'déplacer : arrondi au millième');
it = op.trimItem(r.items, 't1', 'out', 10.1); ok(it[0].len === 0.5, 'raccourcir par la fin : 0,5 s au minimum');
it = op.trimItem(r.items, 't1', 'out', 30); ok(it[0].len === 20, 'rallonger par la fin');
it = op.trimItem(r.items, 't1', 'in', 12); ok(it[0].start === 12 && it[0].len === 4, 'raccourcir par le début : la fin ne bouge pas');
it = op.trimItem(r.items, 't1', 'in', 40); ok(it[0].start === 15.5 && it[0].len === 0.5, 'début poussé après la fin : 0,5 s au minimum');
it = op.patchItem(r.items, 't2', { text: 'Salam' }); ok(it[1].text === 'Salam' && it[0].text === '{intervenant}', 'modifier un seul titre');

// --- titres visibles et fondu de 0,3 s
const dd = op.withDress({ items: [{ id: 'a', kind: 'title', text: 'A', start: 10, len: 5 }, { id: 'b', kind: 'banner', text: 'B', start: 12, len: 6 }] });
ok(op.activeItems(dd, 9.9, 100).length === 0 && op.activeItems(dd, 11, 100).length === 1 && op.activeItems(dd, 13, 100).length === 2 && op.activeItems(dd, 15, 100).length === 1 && op.activeItems(dd, 18, 100).length === 0, 'titres visibles selon l\'instant');
ok(near(op.activeItems(dd, 10.15, 100)[0].alpha, 0.5) && op.activeItems(dd, 12, 100)[0].alpha === 1 && near(op.activeItems(dd, 14.85, 100)[0].alpha, 0.5), 'fondu d\'entrée et de sortie de 0,3 s');
ok(op.activeItems(dd, 14.4, 14.5).length === 2 && op.activeItems(dd, 14.6, 14.5).length === 0 && op.activeItems(dd, 14.9, 15).filter((x) => x.item.id === 'a').length === 1 && op.activeItems(dd, 14.9, 14.5).length === 0, 'un titre ne dépasse pas la fin du montage');

// --- logo
const lg = op.withDress({ logo: { on: true, from: 3, to: 10 } });
ok(!op.logoOn(lg, 2.9) && op.logoOn(lg, 3) && op.logoOn(lg, 9.99) && !op.logoOn(lg, 10), 'logo visible de 3 s à 10 s');
ok(op.logoOn(op.withDress({ logo: { on: true } }), 500) && !op.logoOn(op.withDress({ logo: { on: false } }), 5), 'logo sans fin : jusqu\'à la fin ; logo éteint : jamais');

// --- transitions
const clips = [{ id: 'c1', in: 0, out: 20 }, { id: 'c2', in: 30, out: 50 }, { id: 'c3', in: 60, out: 70 }];
let tr = op.setTransition(d0, 'all', { type: 'dip', len: 1 });
ok(op.transitionFor(tr, clips, 0) === null && op.transitionFor(tr, clips, 1).type === 'dip' && op.transitionFor(tr, clips, 2).len === 1 && op.transitionFor(tr, clips, 3) === null, 'transition « pour tous » : pas avant le premier extrait');
tr = op.setTransition(tr, 'c2', { type: 'dipwhite', len: 0.5 });
ok(op.transitionFor(tr, clips, 1).type === 'dipwhite' && op.transitionFor(tr, clips, 2).type === 'dip', 'transition propre à un extrait prioritaire');
tr = op.setTransition(tr, 'c2', { type: 'cut', len: 1 });
ok(op.transitionFor(tr, clips, 1) === null, '« coupure » sur un extrait : pas de fondu malgré le réglage pour tous');
tr = op.setTransition(tr, 'c2', null);
ok(!('c2' in tr.transitions.byClip) && op.transitionFor(tr, clips, 1).type === 'dip', 'réglage propre effacé : retour au réglage pour tous');
ok(op.setTransition(tr, 'all', { type: 'cut', len: 1 }).transitions.all === null, '« pour tous » en coupure = aucun réglage');
// voile : monte jusqu'au raccord (20 s) puis redescend, len / 2 de chaque côté
const dp = (T, d = tr) => op.dipAt(d, clips, T);
ok(dp(19.4).alpha === 0 && near(dp(19.75).alpha, 0.5) && dp(20).alpha === 1 && near(dp(20.25).alpha, 0.5) && dp(20.5).alpha === 0, 'voile : 0 → 1 au raccord → 0 sur 1 s');
ok(dp(30).alpha === 0 || dp(30).alpha === 1, 'second raccord à 40 s (20 + 20), pas à 30 s');
ok(dp(40).alpha === 1 && dp(40).color === '#000', 'second raccord : fondu au noir');
const wh = op.setTransition(d0, 'c2', { type: 'dipwhite', len: 2 });
ok(op.dipAt(wh, clips, 20).color === '#fff' && op.dipAt(wh, clips, 20).alpha === 1 && op.dipAt(wh, clips, 40).alpha === 0, 'fondu au blanc sur un seul raccord');
ok(op.dipAt(d0, clips, 20).alpha === 0, 'sans transition : aucun voile');
const lay = op.layout(clips);
ok(lay[1].start === 20 && lay[2].start === 40, 'le fondu ne décale pas le montage (raccords à 20 s et 40 s)');

// --- modèles prêts à l'emploi
const [std, intro] = op.builtinTemplates({ standard: 'Standard', intro: 'Avec intro', outroTitle: 'Merci', outroSub: '' });
ok(std.dress.items[0].kind === 'banner' && std.dress.logo.on && std.dress.logo.asset === 'channel' && std.dress.transitions.all.type === 'dip' && !std.dress.intro.on, 'modèle Standard : bandeau, logo de la chaîne, fondu');
ok(intro.dress.intro.on && intro.dress.intro.title === '{titre}' && intro.dress.outro.on && intro.dress.outro.title === 'Merci' && intro.dress.items.length === 1, 'modèle Avec intro et fin');
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
ok(JSON.stringify(canon(op.withDress(std.dress))) === JSON.stringify(canon(std.dress)) && JSON.stringify(canon(op.withDress(intro.dress))) === JSON.stringify(canon(intro.dress)), 'un modèle prêt à l\'emploi est déjà complet');

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT OK');
process.exit(fails ? 1 : 0);
