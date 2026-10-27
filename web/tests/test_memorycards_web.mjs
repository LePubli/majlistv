// Étape 38 — logique de séance des cartes mémoire (site). Lancer : node web/tests/test_memorycards_web.mjs
import assert from 'node:assert/strict';
import { requeue, replayHref } from '../lib/memoryCards.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const q0 = [{ id: 'a' }, { id: 'b' }];
let o = requeue(q0, q0[0], false, new Set());
ok(o.queue.map((x) => x.id).join() === 'b,a' && o.retried.has('a'), 'carte ratée : revient une fois en fin de file');
o = requeue(o.queue, o.queue[0], true, o.retried);
ok(o.queue.map((x) => x.id).join() === 'a', 'carte sue : sort de la file');
o = requeue(o.queue, o.queue[0], false, o.retried);
ok(o.queue.length === 0, 'carte déjà revenue une fois : pas de boucle');
const before = new Set(); requeue(q0, q0[0], false, before);
ok(before.size === 0, 'l’ensemble reçu n’est pas modifié');
ok(replayHref({ talkId: 't1', startMs: 125000 }) === '/talks/t1?t=122', 'lien : 3 secondes avant la citation');
ok(replayHref({ talkId: 't1', startMs: 4000 }) === '/talks/t1', 'lien : début de vidéo si la citation est dans les premières secondes');
ok(replayHref({ talkId: 't1', startMs: null }) === '/talks/t1', 'lien : sans minute connue');
console.log('\nTout est OK');
