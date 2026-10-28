// Étape 41 — aides de l'assistant de conférence (site). Lancer : node web/tests/test_ask_web.mjs
import assert from 'node:assert/strict';
import { errorKey, validQuestion, pushTurn, MAX_QUESTION } from '../lib/ask.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
ok(errorKey('learning_required', 403) === 'askNeedLearning', 'palier requis');
ok(errorKey('ask_quota', 429) === 'askQuota' && errorKey('ask_busy', 429) === 'askBusy', 'plafonds : messages distincts');
ok(errorKey('ask_failed', 502) === 'askFailed' && errorKey('no_transcript', 409) === 'askNoTranscript', 'échec modèle et transcription absente');
ok(errorKey(undefined, 503) === 'askUnavailable' && errorKey('autre', 500) === 'askError', 'indisponible / erreur générique');
ok(validQuestion('Que dit-il ?') && !validQuestion('ab') && !validQuestion('   a  ') && !validQuestion('x'.repeat(MAX_QUESTION + 1)) && validQuestion('x'.repeat(MAX_QUESTION)), 'question : 3 à 400 caractères');
let t = []; for (let i = 0; i < 25; i += 1) t = pushTurn(t, { i });
ok(t.length === 20 && t[0].i === 5 && t[19].i === 24, 'conversation limitée aux 20 derniers échanges');
