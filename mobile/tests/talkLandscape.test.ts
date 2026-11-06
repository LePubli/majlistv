// Fiche vidéo : paysage = plein écran sans barre qui cache l'image ; compteur non perturbé par le lecteur natif quand la vidéo est YouTube/Vimeo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'src', 'app', 'talk', '[id].tsx'), 'utf8');
test('le lecteur natif ne touche pas au compteur pour une vidéo intégrée', () => {
  assert.match(src, /useEventListener\(player, 'timeUpdate', \(\{ currentTime \}\) => \{\s*\n[^\n]*\n\s*if \(src\.embed\) return;/);
});
test('paysage : barre retenir/noter, liste et commandes fixes masquées ; barre d\'état cachée', () => {
  assert.match(src, /const landscape = playable && winW > winH && !cast;/);
  assert.match(src, /\{landscape \? null : <View style=\{\{ position: 'absolute', start: 0, end: 0, bottom: 0/);
  assert.match(src, /\{playable && !landscape \? \(\s*\n\s*<PlayerControls/);
  assert.match(src, /<StatusBar hidden \/>/);
});
