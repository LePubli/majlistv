// Étape 41 — aides de l'assistant de conférence (site). Lancer : node web/tests/test_ask_web.mjs
import assert from 'node:assert/strict';
import { errorKey, validQuestion, pushTurn, markReported, dropTurn, MAX_QUESTION } from '../lib/ask.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
ok(errorKey('learning_required', 403) === 'askNeedLearning', 'palier requis');
ok(errorKey('ask_quota', 429) === 'askQuota' && errorKey('ask_busy', 429) === 'askBusy', 'plafonds : messages distincts');
ok(errorKey('ask_failed', 502) === 'askFailed' && errorKey('no_transcript', 409) === 'askNoTranscript', 'échec modèle et transcription absente');
ok(errorKey(undefined, 503) === 'askUnavailable' && errorKey('autre', 500) === 'askError', 'indisponible / erreur générique');
ok(validQuestion('Que dit-il ?') && !validQuestion('ab') && !validQuestion('   a  ') && !validQuestion('x'.repeat(MAX_QUESTION + 1)) && validQuestion('x'.repeat(MAX_QUESTION)), 'question : 3 à 400 caractères');
let t = []; for (let i = 0; i < 35; i += 1) t = pushTurn(t, { i, id: `e${i}` });
ok(t.length === 30 && t[0].i === 5 && t[29].i === 34, 'conversation limitée aux 30 derniers échanges');
ok(markReported(t, 'e7').find((x) => x.id === 'e7').reported === true && !markReported(t, 'e7').find((x) => x.id === 'e8').reported, 'échange signalé : marqué, les autres intacts');
ok(dropTurn(t, 'e7').length === 29 && !dropTurn(t, 'e7').some((x) => x.id === 'e7'), 'échange supprimé : retiré de l\'affichage');
