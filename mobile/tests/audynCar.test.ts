// Audyn dans Android Auto : module natif local (mobile/modules/audyn-car) — vérifications sans téléphone ni voiture.
// Ce qui ne peut être vérifié qu'en vrai (voiture ou simulateur d'Android Auto) est listé dans docs/historique/ETAPES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeResume } from '../src/lib/audyn';

const root = join(__dirname, '..');
const mod = join(root, 'modules', 'audyn-car');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');
const kt = (f: string) => read(mod, 'android/src/main/java/expo/modules/audyncar', f);

test('module lié automatiquement (Android seulement)', () => {
  const cfg = JSON.parse(read(mod, 'expo-module.config.json'));
  assert.deepEqual(cfg.platforms, ['android']);
  assert.deepEqual(cfg.android.modules, ['expo.modules.audyncar.AudynCarModule']);
  const g = read(mod, 'android/build.gradle');
  const video = read(root, 'node_modules/expo-video/android/build.gradle').match(/androidxMedia3Version = "([^"]+)"/)![1];
  assert.match(g, new RegExp(`androidxMedia3Version = "${video.replace(/\./g, '\\.')}"`), 'même Media3 que expo-video');
  assert.match(g, /media3-session/); assert.match(g, /namespace "expo\.modules\.audyncar"/);
});

test('déclaration à Android Auto : application média, service de bibliothèque', () => {
  const m = read(mod, 'android/src/main/AndroidManifest.xml');
  assert.match(m, /com\.google\.android\.gms\.car\.application" android:resource="@xml\/automotive_app_desc"/);
  assert.match(m, /android:name="expo\.modules\.audyncar\.AudynCarService"/);
  assert.match(m, /android:exported="true"/);
  assert.match(m, /foregroundServiceType="mediaPlayback"/);
  assert.match(m, /androidx\.media3\.session\.MediaLibraryService/);
  assert.match(m, /android\.media\.browse\.MediaBrowserService/);
  assert.match(m, /FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
  assert.match(read(mod, 'android/src/main/res/xml/automotive_app_desc.xml'), /<uses name="media" \/>/);
});

test('service : arborescence, reprise, aperçu, positions', () => {
  const s = kt('AudynCarService.kt');
  assert.match(s, /class AudynCarService : MediaLibraryService\(\)/);
  for (const k of ['continue', 'all', 'cats']) assert.match(s, new RegExp(`folder\\(${k.toUpperCase()}, t\\("${k}"\\)`), `dossier ${k}`);
  assert.match(s, /filter \{ it\.playable \}/, 'seuls les chapitres écoutables (aperçu sans formule)');
  assert.match(s, /maxOf\(0L, saved\.pos - 3\) \* 1000/, 'reprise 3 s plus tôt, comme dans l\'application');
  assert.match(s, /main\.postDelayed\(this, 10_000\)/, 'position gardée toutes les 10 s');
  assert.match(s, /api\.playUrl\(parts\[0\], parts\[1\]\)/, 'lien du fichier demandé au moment de lire');
  assert.match(s, /50 \* 60_000L/, 'lien gardé 50 min (valable 1 h)');
  assert.match(s, /setSeekBackIncrementMs\(15_000\)/);
  assert.match(s, /onGetSearchResult/, 'recherche vocale');
  assert.match(s, /it\.second\.pos >= 5/, 'livre à peine commencé ou fini : hors « Continuer »');
});

test('positions : même format que l\'application, la plus récente gagne', () => {
  const st = kt('CarStore.kt');
  assert.equal(encodeResume({ cid: 'c1', pos: 12.4, at: 1700000000000 }), '["c1",12,1700000000000]');
  assert.match(st, /JSONArray\(\)\.put\(cid\)\.put\(posSec\)\.put\(System\.currentTimeMillis\(\)\)/, 'écrit [chapitre, secondes, ms]');
  assert.match(st, /theirs\.at > mine\.at/); assert.match(st, /mine\.at > theirs\.at/);
  assert.match(st, /AndroidKeyStore/, 'jeton chiffré par le coffre Android');
  assert.doesNotMatch(st, /putString\("token", token\)/, 'jamais le jeton en clair');
});

test('textes de la voiture en fr / en / ar', () => {
  const t = kt('CarTexts.kt');
  for (const k of ['continue', 'all', 'cats', 'empty', 'emptyContinue', 'preview']) {
    assert.match(t, new RegExp(`"${k}" to mapOf\\("fr" to "[^"]+", "en" to "[^"]+", "ar" to "[^"]+"\\)`), k);
  }
});

test('application : session, langue et positions transmises à la voiture', () => {
  const s = read(root, 'src/lib/session.tsx');
  assert.match(s, /setCarSession\(API_URL, tokenRef\.current, locale\)/);
  assert.match(s, /\[ready, user, locale\]/, 'connexion, déconnexion et changement de langue suivis');
  const p = read(root, 'src/lib/audynPlayer.tsx');
  assert.match(p, /putCarPosition\(id, raw\)/);
  assert.match(p, /exchangeCarPositions\(\{ \[itemId\]: raw \}\)/);
  const js = read(mod, 'index.ts');
  assert.match(js, /requireOptionalNativeModule<Native>\('AudynCar'\)/, 'sans le module (iPhone, ancienne version) : rien ne casse');
  for (const f of ['setSession', 'exchange', 'put']) assert.match(kt('AudynCarModule.kt'), new RegExp(`Function\\("${f}"\\)`));
});
