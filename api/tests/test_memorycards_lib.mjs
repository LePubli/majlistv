// Étape 38 — calculs purs des cartes mémoire. Lancer : node tests/test_memorycards_lib.mjs
import assert from 'node:assert/strict';
import { nextState, planSession, cardOf, clampInt, OFFSETS, MASTERED } from '../src/memoryCardsLib.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

ok(OFFSETS.join() === '1,3,7,21' && MASTERED === 5, 'calendrier 1 / 3 / 7 / 21 jours, acquise à la 5e réussite');
let s = nextState(null, true);
ok(s.stage === 1 && s.addDays === 1 && s.advanced, 'nouvelle carte sue : revue demain');
s = nextState(null, false);
ok(s.stage === 0 && s.addDays === 1 && !s.advanced, 'nouvelle carte ratée : revue demain, rien d’avancé');
let st = { stage: 1, dueOffsetDays: 0 };
const path = [];
for (let i = 0; i < 4; i++) { const n = nextState(st, true); path.push([n.stage, n.addDays]); st = { stage: n.stage, dueOffsetDays: 0 }; }
ok(JSON.stringify(path) === JSON.stringify([[2, 3], [3, 7], [4, 21], [5, null]]), 'réussites à l’échéance : +3, +7, +21 puis acquise');
s = nextState({ stage: 3, dueOffsetDays: -4 }, true);
ok(s.stage === 4 && s.addDays === 21 && s.advanced, 'en retard de 4 jours : avance quand même');
s = nextState({ stage: 3, dueOffsetDays: 5 }, true);
ok(s.stage === 3 && s.addDays === 5 && !s.advanced, 'revue avant l’échéance : le calendrier ne bouge pas');
s = nextState({ stage: 3, dueOffsetDays: 5 }, false);
ok(s.stage === 0 && s.addDays === 1, 'échec même avant l’échéance : retour au début');
s = nextState({ stage: 5, dueOffsetDays: null }, true);
ok(s.stage === 5 && s.addDays === null && !s.advanced, 'carte acquise revue en séance libre : reste acquise');
s = nextState({ stage: 5, dueOffsetDays: null }, false);
ok(s.stage === 0 && s.addDays === 1, 'carte acquise ratée : repart du début');

const mk = (n, p = 'c') => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));
let p = planSession(mk(3, 'd'), mk(10, 'n'), { dailyMax: 20, newLeft: 5 });
ok(p.cards.length === 8 && p.due === 3 && p.fresh === 5 && p.cards[0].id === 'd0' && p.cards[3].id === 'n0', 'séance : échues d’abord, puis 5 nouvelles');
p = planSession(mk(30, 'd'), mk(10, 'n'), { dailyMax: 20, newLeft: 5 });
ok(p.cards.length === 20 && p.fresh === 0 && p.dueTotal === 30, 'beaucoup d’échues : plafond du jour, aucune nouvelle');
p = planSession(mk(18, 'd'), mk(10, 'n'), { dailyMax: 20, newLeft: 5 });
ok(p.due === 18 && p.fresh === 2, 'les nouvelles complètent jusqu’au plafond');
p = planSession([], mk(10, 'n'), { dailyMax: 20, newLeft: 0 });
ok(p.cards.length === 0, 'plus de nouvelles autorisées aujourd’hui : séance vide');

const c = cardOf({ id: 'q1', talk_id: 't1', lang: 'fr', question: 'Quoi ?', options: ['A', 'B', 'C'], correct_index: 1, explanation: 'Parce que.', evidence_quote: 'citation', evidence_ms: 4000, chapter_title: 'Intro' });
ok(c.front === 'Quoi ?' && c.answer === 'B' && c.explanation === 'Parce que.' && c.quote === 'citation' && c.startMs === 4000, 'carte : recto = question, verso = bonne réponse, explication, citation, minute');
ok(!('options' in c) && !('correct_index' in c), 'carte : pas de liste d’options');
ok(cardOf({ id: 'x', options: null, correct_index: 0 }).answer === '', 'carte sans options : réponse vide, pas d’exception');

ok(clampInt('abc', 1, 10, 5) === 5 && clampInt(99, 1, 10, 5) === 10 && clampInt(0, 1, 10, 5) === 1, 'bornes des réglages');
console.log('\nTout est OK');
