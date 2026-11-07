// Structure du lecteur Audyn (sans téléphone) : branchements indispensables, textes dans les 3 langues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_DICT } from '../src/lib/i18n';

const r = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('le lecteur est monté à la racine, avec mini-barre et écrans', () => {
  const layout = r('../src/app/_layout.tsx');
  assert.match(layout, /<AudynPlayerProvider>/); assert.match(layout, /<AudynMiniBar \/>/);
  for (const s of ['audyn/index', 'audyn/\\[id\\]', 'audyn/player']) assert.match(layout, new RegExp(`name="${s}"`));
  assert.match(r('../src/components/MenuDrawer.tsx'), /feat\('audyn'\)/);
});

test('lecture en arrière-plan, écran verrouillé, reprise et minuteur', () => {
  const p = r('../src/lib/audynPlayer.tsx');
  assert.match(p, /staysActiveInBackground = true/); assert.match(p, /showNowPlayingNotification = true/);
  assert.match(p, /SecureStore\.setItemAsync\(resumeKey/); assert.match(p, /sleepTick/); assert.match(p, /player\.volume = tick\.volume/);
  assert.match(p, /URL_LIFETIME_MS/);                       // lien signé renouvelé après une longue pause
  assert.match(p, /quran\.stop\(\)/);                        // un seul son à la fois
  assert.match(p, /previewEnded/);                           // fin de l'aperçu gérée
});

test('aucune dépendance native ajoutée (mise à jour OTA possible)', () => {
  const pkg = JSON.parse(r('../package.json'));
  const files = ['../src/lib/audynPlayer.tsx', '../src/app/audyn/player.tsx', '../src/components/AudynParts.tsx'].map(r).join('\n');
  for (const m of files.matchAll(/from '(expo-[a-z-]+|react-native-[a-z-]+)'/g)) {
    if (m[1] === 'react-native-safe-area-context') continue;
    assert.ok(pkg.dependencies[m[1]], `${m[1]} déjà dans package.json`);
  }
});

test('tous les textes aud.* existent en fr / en / ar', () => {
  const used = new Set<string>();
  for (const f of ['../src/app/audyn/index.tsx', '../src/app/audyn/[id].tsx', '../src/app/audyn/player.tsx', '../src/components/AudynMiniBar.tsx']) {
    for (const m of r(f).matchAll(/\bt\('(aud\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
  }
  used.add('aud.nav');
  assert.ok(used.size >= 30);
  for (const loc of ['fr', 'en', 'ar'] as const) for (const k of used) assert.ok((APP_DICT[loc] as Record<string, string>)[k], `${k} manquant en ${loc}`);
});
