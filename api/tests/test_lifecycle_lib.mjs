// Étape 33 — Règles pures des e-mails de cycle de vie. Lancer : node tests/test_lifecycle_lib.mjs
import assert from 'node:assert/strict';
import { inSendWindow, clampInt, remainingToday, onePerUser, talkPath, minutesLabel, KINDS } from '../src/lifecycleLib.js';
import { renderEmail } from '../src/emails.js';
import { CATEGORIES, KIND_CATEGORY, unsubToken, parseUnsubToken } from '../src/unsubscribe.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };

ok(inSendWindow(10, 10, 19) && inSendWindow(18, 10, 19), 'plage 10–19 : 10 h et 18 h dedans');
ok(!inSendWindow(19, 10, 19) && !inSendWindow(9, 10, 19) && !inSendWindow(3, 10, 19), 'plage 10–19 : 19 h, 9 h et 3 h dehors');
ok(inSendWindow(23, 22, 6) && inSendWindow(2, 22, 6) && !inSendWindow(12, 22, 6), 'plage qui passe minuit (22–6)');
ok(inSendWindow(0, 8, 8) && inSendWindow(15, 8, 8), 'mêmes bornes = toute la journée');

ok(clampInt('5', 1, 10, 3) === 5 && clampInt('0', 1, 10, 3) === 1 && clampInt('99', 1, 10, 3) === 10, 'bornes d\'un réglage');
ok(clampInt('abc', 1, 10, 3) === 3 && clampInt(undefined, 1, 10, 3) === 3, 'valeur invalide → défaut');

ok(remainingToday(100, 40) === 60 && remainingToday(100, 100) === 0 && remainingToday(100, 250) === 0, 'plafond quotidien jamais négatif');

const list = onePerUser([{ userId: 'a', k: 1 }, { userId: 'b', k: 2 }, { userId: 'a', k: 3 }]);
ok(list.length === 2 && list[0].k === 1, 'un seul message par personne, le premier gagne');

ok(talkPath({ slug: 'x' }) === '/conferences/x' && talkPath({ id: '1' }) === '/conferences/1' && talkPath(null) === '/', 'chemin du lien');
ok(minutesLabel(0) === '1' && minutesLabel(754000) === '13' && minutesLabel('x') === '1', 'minutes de reprise');
ok(KINDS.length === 3, 'trois situations');

// Modèles dans les trois langues, avec lien de désinscription.
const vars = { name: 'Amal', app: 'Mejliss TV', title: 'La patience', speaker: 'Cheikh X', minutes: '12', titles: '• A\n• B', url: 'https://x/conferences/1', unsubUrl: 'https://x/unsubscribe/t', prefsUrl: 'https://x/account#emails', webUrl: 'https://x' };
for (const k of KINDS) {
  for (const l of ['fr', 'en', 'ar']) {
    const r = renderEmail(k, l, vars);
    ok(r.subject && r.html.includes('https://x/unsubscribe/t') && r.text.includes('https://x/unsubscribe/t'), `modèle ${k} (${l}) : sujet + lien de désinscription`);
  }
}
ok(renderEmail('resume_talk', 'fr', vars).html.includes('12 min') && renderEmail('resume_talk', 'fr', vars).text.includes('Cheikh X'), 'reprise : minutes et intervenant');
ok(!renderEmail('resume_talk', 'fr', { ...vars, speaker: '' }).text.includes('Une conférence de'), 'reprise : ligne intervenant retirée si vide');
ok(renderEmail('resume_talk', 'ar', vars).html.includes('dir="rtl"'), 'arabe : sens de lecture droite-gauche');
ok(!renderEmail('winback', 'fr', { ...vars, titles: '<b>x</b>' }).html.includes('<b>x</b>'), 'contenu échappé');

// Couvertures : cartes avec image à adresse stable, titre échappé, texte inchangé.
const cards = [{ id: 'aaaaaaaa-0000-0000-0000-000000000001', title: 'Titre <i>1</i>', speaker: 'S1', poster: true, path: '/conferences/t1' }, { id: 'aaaaaaaa-0000-0000-0000-000000000002', title: 'Titre 2', poster: false, path: '/conferences/t2' }];
for (const k of ['welcome_nudge', 'winback', 'speaker_new', 'weekly_selection']) {
  const r = renderEmail(k, 'fr', { ...vars, cards });
  ok(r.html.includes('https://x/api/seo/poster/talks/aaaaaaaa-0000-0000-0000-000000000001') && r.html.includes('https://x/conferences/t2'), `${k} : couverture + lien de la conférence`);
  ok(!r.html.includes('poster/talks/aaaaaaaa-0000-0000-0000-000000000002') && !r.html.includes('<i>1</i>') && r.text.includes('• A'), `${k} : sans image si pas de couverture, titre échappé, texte à puces conservé`);
}
const rr = renderEmail('resume_talk', 'fr', { ...vars, cards: [cards[0]] });
ok(rr.html.includes('poster/talks/aaaaaaaa-0000-0000-0000-000000000001') && !rr.text.includes('[object') && !rr.text.includes('{cards}'), 'reprise : couverture en HTML, rien de parasite en texte');
ok(!renderEmail('resume_talk', 'fr', vars).html.includes('<img src="https://x/api/seo'), 'sans cartes : pas d\'image');

// Désinscription : catégorie dédiée, jeton valide.
ok(CATEGORIES.lifecycle === 'notify_lifecycle', 'catégorie lifecycle → notify_lifecycle');
ok(KINDS.every((k) => KIND_CATEGORY[k] === 'lifecycle'), 'les trois modèles portent le lien de désinscription');
const uid = '11111111-2222-3333-4444-555555555555';
const p = parseUnsubToken(unsubToken(uid, 'lifecycle'));
ok(p && p.userId === uid && p.cat === 'lifecycle', 'jeton de désinscription lifecycle valide');
ok(parseUnsubToken(unsubToken(uid, 'lifecycle').replace(/.$/, 'x')) === null, 'jeton falsifié refusé');

console.log(`\n${n} vérifications réussies`);
