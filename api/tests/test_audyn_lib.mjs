// Audyn (étape 1) : règles pures. node tests/test_audyn_lib.mjs
import assert from 'node:assert/strict';
import { audioInfo, coverInfo, previewBytes, clean, validOrder, publishError, fullAccess, sumDuration } from '../src/modules/audyn/lib.js';

assert.deepEqual(audioInfo('audio/mpeg'), { ext: 'mp3', type: 'audio/mpeg' });
assert.deepEqual(audioInfo('AUDIO/MP3'), { ext: 'mp3', type: 'audio/mpeg' });
assert.deepEqual(audioInfo('audio/mp4'), { ext: 'm4a', type: 'audio/mp4' });
assert.deepEqual(audioInfo('audio/x-m4a'), { ext: 'm4a', type: 'audio/mp4' });
for (const bad of ['video/mp4', 'audio/wav', 'application/pdf', '', null, undefined]) assert.equal(audioInfo(bad), null, String(bad));
assert.equal(coverInfo('image/png').ext, 'png'); assert.equal(coverInfo('image/jpeg').ext, 'jpg'); assert.equal(coverInfo('image/svg+xml'), null); assert.equal(coverInfo('image/gif'), null);

// Aperçu : proportion de la durée + marge, jamais plus que le fichier ; durée inconnue → 32 000 octets par seconde.
assert.equal(previewBytes(0, 100, 10), 0);
assert.equal(previewBytes(1_000_000, 100, 10), Math.ceil(1_000_000 * 0.1 * 1.03) + 8192);
assert.equal(previewBytes(500_000, 60, 120), 500_000, 'aperçu plus long que le fichier : tout le fichier');
assert.equal(previewBytes(10_000_000, 0, 120), 3_840_000);
assert.equal(previewBytes(100_000, 0, 120), 100_000);
assert.ok(previewBytes(10_000_000, 600, 120) < 10_000_000 / 4, 'un aperçu de 2 min sur 10 min reste proche de 20 %');

assert.equal(clean('  a \n  b  ', 10), 'a b'); assert.equal(clean('x'.repeat(50), 5), 'xxxxx'); assert.equal(clean(null, 5), '');

assert.deepEqual(validOrder(['b', 'a', 'c'], ['a', 'b', 'c']), ['b', 'a', 'c']);
assert.equal(validOrder(['a', 'a', 'c'], ['a', 'b', 'c']), null, 'doublon');
assert.equal(validOrder(['a', 'b'], ['a', 'b', 'c']), null, 'chapitre manquant');
assert.equal(validOrder(['a', 'b', 'x'], ['a', 'b', 'c']), null, 'chapitre inconnu');
assert.equal(validOrder('a', ['a']), null);

assert.match(publishError({ title: 'Livre' }, []), /au moins un chapitre/);
assert.match(publishError({ title: '  ' }, [{}]), /titre/);
assert.equal(publishError({ title: 'Livre' }, [{ id: 1 }]), null);

assert.equal(fullAccess({ access: 'free' }, false), true);
assert.equal(fullAccess({ access: 'learning' }, false), false);
assert.equal(fullAccess({ access: 'learning' }, true), true);
assert.equal(sumDuration([{ duration_seconds: 60 }, { durationSeconds: 30 }, {}]), 90);
console.log('OK test_audyn_lib');
