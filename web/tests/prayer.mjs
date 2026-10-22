// Étape 23a — Prière : calcul des horaires, préférences, fenêtre de pause. node web/tests/prayer.mjs
// Comparaison facultative avec la bibliothèque « adhan » si elle est installée (npm i adhan dans un dossier de passage).
import { dayTimes, schedule, civilDate, fmtTime, METHODS } from '../lib/prayerTimes.js';
import { CITIES, searchCities, cityForTimezone, plain } from '../lib/prayerCities.js';
import { resolvePrefs, storable, statusAt, countdown, prayerKey, rememberDone, normalizeConfig, buildSchedule } from '../lib/prayerLogic.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const hm = (d, tz) => fmtTime(d.getTime(), tz);

// --- Horaires connus : Paris le 22 octobre 2026 (heure d'été jusqu'au 25 : UTC+2), méthode UOIF.
const paris = dayTimes({ lat: 48.86, lon: 2.35, y: 2026, m: 10, d: 22, method: 'uoif' });
const tz = 'Europe/Paris';
const t = Object.fromEntries(Object.entries(paris).map(([k, v]) => [k, hm(v, tz)]));
console.log('Paris 22/10/2026 :', JSON.stringify(t));
ok(t.fajr > '06:50' && t.fajr < '07:30', `Fajr de Paris plausible (${t.fajr})`);
ok(t.sunrise > '08:00' && t.sunrise < '08:30', `lever du soleil (${t.sunrise})`);
ok(t.dhuhr > '13:30' && t.dhuhr < '13:50', `Dhuhr (${t.dhuhr})`);
ok(t.maghrib > '18:30' && t.maghrib < '19:00', `Maghrib (${t.maghrib})`);
ok(paris.fajr < paris.sunrise && paris.sunrise < paris.dhuhr && paris.dhuhr < paris.asr && paris.asr < paris.maghrib && paris.maghrib < paris.isha, 'ordre des prières dans la journée');
ok(dayTimes({ lat: 48.86, lon: 2.35, y: 2026, m: 10, d: 22, asr: 'hanafi' }).asr > paris.asr, 'Asr hanafite plus tard que standard');
ok(dayTimes({ lat: 21.42, lon: 39.83, y: 2026, m: 10, d: 22, method: 'umm' }).isha - dayTimes({ lat: 21.42, lon: 39.83, y: 2026, m: 10, d: 22, method: 'umm' }).maghrib === 90 * 60000, 'Umm al-Qura : Isha = Maghrib + 90 min');

// --- Été à Lille (latitude élevée) : jamais de valeur absente, ordre conservé.
for (const rule of ['angle', 'middle', 'seventh']) {
  const x = dayTimes({ lat: 50.63, lon: 3.06, y: 2026, m: 6, d: 21, method: 'uoif', highLat: rule });
  ok(Object.values(x).every((d) => Number.isFinite(d.getTime())) && x.fajr < x.sunrise && x.maghrib < x.isha, `Lille 21 juin, règle « ${rule} » : horaires valides (Fajr ${hm(x.fajr, tz)}, Isha ${hm(x.isha, tz)})`);
}

// --- Toutes les villes : horaires valides toute l'année (4 dates), dans l'ordre.
let badCity = [];
for (const c of CITIES) for (const [m, d] of [[1, 15], [3, 20], [6, 21], [9, 22], [12, 21]]) {
  const x = dayTimes({ lat: c.lat, lon: c.lon, y: 2026, m, d, method: 'mwl' });
  if (!Object.values(x).every((v) => Number.isFinite(v.getTime())) || !(x.fajr < x.sunrise && x.sunrise < x.dhuhr && x.dhuhr < x.asr && x.asr < x.maghrib && x.maghrib < x.isha)) badCity.push(`${c.id} ${m}/${d}`);
}
ok(badCity.length === 0, `${CITIES.length} villes × 5 dates : horaires valides et ordonnés${badCity.length ? ' — ' + badCity.slice(0, 5).join(', ') : ''}`);
ok(new Set(CITIES.map((c) => c.id)).size === CITIES.length, 'identifiants de villes uniques');
for (const c of CITIES) { try { new Intl.DateTimeFormat('en', { timeZone: c.tz }); } catch { ok(false, `fuseau inconnu : ${c.id} ${c.tz}`); } }

// --- Recherche de villes
ok(searchCities('liege')[0]?.id === 'liege' && searchCities('Genève')[0]?.id === 'geneve' && searchCities('PAR')[0]?.id === 'paris', 'recherche sans accents ni majuscules');
ok(plain('Fès ÉÈ') === 'fes ee', 'plain() retire les accents');
ok(cityForTimezone('Africa/Casablanca').id === 'casablanca' && cityForTimezone('Pacific/Nowhere', 'lille').id === 'lille', 'ville par défaut selon le fuseau, sinon celle de l’administrateur');

// --- Préférences
const cfg = { defaultEnabled: true, method: 'uoif', blockMinutes: 10, maxBlockMinutes: 30, city: 'lille', pill: true };
let p = resolvePrefs(null, cfg, 'Europe/Paris');
ok(p.enabled && p.pill && p.method === 'uoif' && p.blockMinutes === 10 && p.loc.mode === 'auto' && p.loc.tz === 'Europe/Paris', 'sans choix : valeurs de l’administrateur, activée par défaut');
ok(Object.values(p.prayers).every(Boolean), 'toutes les prières suivies par défaut');
p = resolvePrefs({ enabled: false, method: 'inconnue', blockMinutes: 999, loc: { mode: 'city', city: 'oran' }, prayers: { fajr: false } }, cfg, 'Europe/Paris');
ok(p.enabled === false && p.method === 'uoif' && p.blockMinutes === 30 && p.loc.city === 'oran' && p.prayers.fajr === false && p.prayers.isha === true, 'valeurs hors limites ramenées au plafond, méthode inconnue ignorée');
p = resolvePrefs({ loc: { mode: 'geo', lat: 50.6292, lon: 3.0573, tz: 'Europe/Paris', name: 'Ma position' } }, cfg, 'Europe/Paris');
ok(p.loc.mode === 'geo' && p.loc.lat === 50.6 && p.loc.lon === 3.1, 'position arrondie à 0,1°');
p = resolvePrefs({ loc: { mode: 'geo', lat: 999, lon: 0 } }, cfg, 'Europe/Paris');
ok(p.loc.mode === 'auto', 'position invalide : retour à la ville automatique');
p = resolvePrefs({ loc: { mode: 'geo', lat: 10, lon: 10, tz: 'Pas/UnFuseau' } }, cfg, 'Europe/Paris');
ok(p.loc.tz === 'Europe/Paris', 'fuseau inconnu remplacé par celui de l’appareil');
const s1 = storable(resolvePrefs({ loc: { mode: 'city', city: 'paris' }, method: 'mwl' }, cfg, 'Europe/Paris'));
ok(s1.method === 'mwl' && s1.loc.city === 'paris' && !('lat' in s1.loc), 'enregistrement : la ville seule (pas de coordonnées)');
ok(normalizeConfig({ blockMinutes: 99, maxBlockMinutes: 15 }).blockMinutes === 15 && normalizeConfig(null).defaultEnabled === true && normalizeConfig({ defaultEnabled: false }).defaultEnabled === false, 'réglages admin : plafond et valeurs de secours');

// --- Prière en cours / suivante (Paris, 22/10/2026)
const prefs = resolvePrefs({ loc: { mode: 'city', city: 'paris' } }, cfg, 'Europe/Paris');
const day = buildSchedule(Date.UTC(2026, 9, 22, 10, 0), prefs);
const dhuhr = day.find((x) => x.id === 'dhuhr' && x.at > Date.UTC(2026, 9, 22, 8));
const at = (ms) => statusAt(day, ms, prefs);
ok(at(dhuhr.at - 60_000).current === null && at(dhuhr.at - 60_000).next.id === 'dhuhr', 'une minute avant Dhuhr : prochaine = Dhuhr, pas de pause');
let s = at(dhuhr.at);
ok(s.current?.id === 'dhuhr' && s.current.endsAt === dhuhr.at + 600_000 && s.next.id === 'asr', 'à l’heure de Dhuhr : pause ouverte 10 minutes, prochaine = Asr');
ok(at(dhuhr.at + 599_000).current?.id === 'dhuhr' && at(dhuhr.at + 600_000).current === null, 'la pause se ferme après 10 minutes');
const noAsr = resolvePrefs({ loc: { mode: 'city', city: 'paris' }, prayers: { asr: false } }, cfg, 'Europe/Paris');
const asrAt = day.find((x) => x.id === 'asr' && x.at > dhuhr.at).at;
ok(statusAt(day, asrAt + 1000, noAsr).current === null && statusAt(day, asrAt + 1000, prefs).current?.id === 'asr', 'une prière décochée ne déclenche pas la pause');
ok(statusAt(day, dhuhr.at + 700_000, noAsr).next.id === 'asr', 'la pastille montre quand même Asr (informative)');
ok(day.some((x) => x.id === 'sunrise') && statusAt(day, day.find((x) => x.id === 'sunrise' && x.at > dhuhr.at - 86_400_000).at - 1000, prefs).next.id !== 'sunrise', 'le lever du soleil n’est jamais « prochaine prière »');
const after = statusAt(buildSchedule(Date.UTC(2026, 9, 22, 22, 30), prefs), Date.UTC(2026, 9, 22, 22, 30), prefs);
ok(after.next && after.next.id === 'fajr' && after.next.at > Date.UTC(2026, 9, 22, 22, 30), 'après Isha : prochaine = Fajr du lendemain');
ok(prayerKey({ id: 'asr', at: 60_000 * 5 + 123 }) === 'asr@5', 'clé de prière à la minute');
ok(countdown(5_040_000) === '1 h 24' && countdown(2_052_000) === '34:12' && countdown(-5) === '00:00', 'compte à rebours');
let done = {}; for (let i = 0; i < 14; i++) done = rememberDone(done, `k${i}`, i);
ok(Object.keys(done).length === 10 && done.k13 === 13 && !('k0' in done), 'mémoire des prières traitées limitée à 10');

// --- Date civile dans un fuseau
ok(JSON.stringify(civilDate(Date.UTC(2026, 9, 22, 23, 30), 'Europe/Paris')) === JSON.stringify({ y: 2026, m: 10, d: 23 }), 'jour civil à Paris après 22 h UTC');
ok(Object.keys(METHODS).length >= 6, 'méthodes de calcul disponibles');

// --- Comparaison avec adhan si installé (tolérance : 2 minutes)
try {
  const A = await import(process.env.ADHAN_PATH || 'adhan');
  const defs = { uoif: () => new A.CalculationParameters('Other', 12, 12), mwl: () => A.CalculationMethod.MuslimWorldLeague(), egypt: () => A.CalculationMethod.Egyptian(), umm: () => A.CalculationMethod.UmmAlQura(), turkey: () => A.CalculationMethod.Turkey(), isna: () => A.CalculationMethod.NorthAmerica() };
  let worst = 0;
  for (const c of CITIES.filter((_, i) => i % 3 === 0)) for (const [m, d] of [[1, 15], [3, 20], [6, 21], [12, 21]]) for (const method of Object.keys(defs)) {
    const mine = dayTimes({ lat: c.lat, lon: c.lon, y: 2026, m, d, method });
    const prm = defs[method](); prm.highLatitudeRule = A.HighLatitudeRule.TwilightAngle;
    if (method !== 'turkey') prm.methodAdjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
    if (method === 'isna') prm.madhab = A.Madhab.Shafi;
    const ref = new A.PrayerTimes(new A.Coordinates(c.lat, c.lon), new Date(Date.UTC(2026, m - 1, d, 12)), prm);
    for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) worst = Math.max(worst, Math.abs(mine[k] - ref[k]) / 60000);
  }
  ok(worst <= 2.5, `écart maximal avec « adhan » : ${worst.toFixed(1)} min (≤ 2,5 min)`);
} catch { console.log('INFO comparaison adhan ignorée (paquet non installé)'); }

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
process.exit(fails ? 1 : 0);
