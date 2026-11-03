// Étape M2 — essai de bout en bout contre une VRAIE API : Coran (sourates, lecteur avec traduction / phonétique / mot à mot /
// tajwid, tafsir, récitateurs, recherche) et « Lire le Coran en 30 jours ». Les données sont FICTIVES (comme api/tests/test_quran.py),
// créées par l'administrateur de test puis supprimées. Lancer :
//   API_TEST_URL=http://127.0.0.1:3055 ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=AdminPassw0rd-test npx tsx tests/m2_contract.ts
// Non lancé par « npm test » (il faut une API qui tourne). À NE PAS lancer contre le site réel (il crée et supprime des ressources).
import assert from 'node:assert/strict';
import { createApi } from '../src/lib/api';
import { DEFAULT_PREFS, filterSuras, juzRange, nextAya, readPrefs, reciterUrl, suraQuery, tajLegend, wordMode, type Juz, type QuranPlan, type Reciter, type SearchHit, type SuraData, type SurasResponse } from '../src/lib/quran';
import type { User } from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
if (/le-publicitaire\.fr/.test(URL_)) { console.log('Refusé : cet essai ne se lance que contre une API de test.'); process.exit(2); }
let token: string | null = null;
const api = createApi({ baseUrl: URL_, getToken: () => token });
const step = (s: string) => console.log('  ✓ ' + s);
const P = 'm2c-';

async function main() {
  const adm = await api.post<{ token: string }>('/auth/login', { email: process.env.ADMIN_EMAIL ?? 'admin@test.local', password: process.env.ADMIN_PASSWORD ?? 'AdminPassw0rd-test' });
  token = adm.token;
  const meta = (slug: string, kind: string, lang: string, name: string, position: number) => ({ slug: P + slug, kind, lang, name, author: '', sourceUrl: 'https://example.org/source', license: 'Essai', credit: 'Crédit essai', enabled: false, position });
  const ids: number[] = [];
  const mk = async (m: ReturnType<typeof meta>, body: unknown) => {
    const r = await api.post<{ id: number }>('/admin/quran/resources', m); ids.push(r.id);
    await api.post(`/admin/quran/resources/${r.id}/import`, body);
    const { slug, kind, ...rest } = m; void slug; void kind;
    await api.put(`/admin/quran/resources/${r.id}`, { ...rest, enabled: true });
    return r.id;
  };
  // Nettoyage d'un essai précédent interrompu.
  const prev = await api.get<{ resources: { id: number; slug: string }[] }>('/admin/quran/resources');
  for (const r of prev.resources.filter((x) => x.slug.startsWith(P))) await api.del(`/admin/quran/resources/${r.id}`);
  const prevRc = await api.get<{ reciters: { id: number; slug: string }[] }>('/admin/quran/reciters');
  for (const r of prevRc.reciters.filter((x) => x.slug.startsWith(P))) await api.del(`/admin/quran/reciters/${r.id}`);

  const before = await api.get<SurasResponse>('/quran/suras', undefined, false);
  const ar = 'نَصٌّ تَجْرِيبِيٌّ أَوَّل';
  await mk(meta('ar', 'text', 'ar', 'Texte fictif', 0), { format: 'tanzil', content: `1|1|${ar}\n1|2|نَصٌّ ثَانٍ\n18|1|مِثَالٌ لِلْبَحْث\n` });
  await mk(meta('fr', 'translation', 'fr', 'Traduction fictive', 1), { format: 'tanzil', content: '1|1|Premier verset fictif\n1|2|Deuxième verset fictif\n18|1|Exemple de recherche\n' });
  await mk(meta('ph', 'transliteration', 'fr', 'Phonétique fictive', 2), { format: 'tanzil', content: '1|1|fonétik un\n1|2|fonétik deux\n' });
  await mk(meta('tf', 'tafsir', 'fr', 'Tafsir fictif', 3), { format: 'tanzil', content: '1|1|Commentaire un\n' });
  await mk(meta('wb', 'words', 'fr', 'Mot à mot fictif', 4), { format: 'json', content: JSON.stringify([1, 2, 3].map((p) => ({ surah: 1, ayah: 1, position: p, translation: `mot${p}` }))) });
  await mk(meta('tj', 'tajweed', 'ar', 'Tajwid fictif', 5), { format: 'json', content: JSON.stringify([{ surah: 1, ayah: 1, annotations: [{ rule: 'ghunnah', start: 1, end: 3 }] }]) });
  const rc = await api.post<{ id: number }>('/admin/quran/reciters', { slug: P + 'rc', name: 'Récitateur fictif', urlTemplate: 'https://audio.example.org/{sura3}{aya3}.mp3', sourceUrl: '', license: '', credit: '', enabled: true, position: 0 });
  step('données fictives créées (texte, traduction, phonétique, tafsir, mot à mot, tajwid, récitateur)');

  try {
    token = null; // tout le Coran est public
    const s = await api.get<SurasResponse>('/quran/suras', undefined, false);
    assert.equal(s.ready, true); assert.equal(s.suras.length, 114);
    assert.ok(s.suras[0].verses && s.suras[0].verses >= 2);
    assert.equal(filterSuras(s.suras, '18')[0].n, 18);
    step(`GET /quran/suras : prête, 114 sourates (avant : ready=${before.ready})`);

    const full = await api.get<SuraData>('/quran/suras/1', suraQuery('fr', { ...DEFAULT_PREFS, translation: P + 'fr', wbw: true, taj: true }), false);
    const v1 = full.verses.find((v) => v.aya === 1)!;
    assert.equal(v1.ar, ar); assert.equal(v1.tr, 'Premier verset fictif'); assert.equal(v1.ph, 'fonétik un');
    assert.deepEqual(full.words?.['1'], ['mot1', 'mot2', 'mot3']);
    assert.equal(wordMode(v1.ar, full.words?.['1']), true, 'mot à mot affiché (3 mots = 3 sens)');
    assert.deepEqual(full.tajweed?.['1'], [['ghunnah', 1, 3]]);
    assert.equal(tajLegend(full.tajweed, 'fr')[0].label, 'Ghunna');
    assert.ok(full.tafsirs.some((x) => x.slug === P + 'tf'));
    assert.equal(nextAya(full.verses, 1, true), 2); assert.equal(nextAya(full.verses, 2, true), null);
    step('GET /quran/suras/1 : arabe, traduction, phonétique, mot à mot et tajwid comme l\'application les demande');

    const bare = await api.get<SuraData>('/quran/suras/1', suraQuery('fr', readPrefs({ translation: 'none', ph: false })), false);
    assert.equal('tr' in bare.verses[0], false); assert.equal('ph' in bare.verses[0], false); assert.equal(bare.words, undefined);
    step('réglages « sans traduction » et « sans phonétique » respectés');

    const tf = await api.get<{ items: { aya: number; text: string }[] }>(`/quran/tafsir/${P}tf/1`, undefined, false);
    assert.equal(tf.items[0].text, 'Commentaire un');
    const rcs = await api.get<Reciter[]>('/quran/reciters', undefined, false);
    const r = rcs.find((x) => x.slug === P + 'rc')!;
    assert.equal(reciterUrl(r.urlTemplate, 1, 2), 'https://audio.example.org/001002.mp3');
    step('tafsir et récitateur (adresse du verset construite par l\'application)');

    const hits = await api.get<{ results: SearchHit[] }>('/quran/search', { q: 'Exemple', lang: 'fr' }, false);
    assert.ok(hits.results.some((h) => h.sura === 18 && h.aya === 1));
    step('GET /quran/search : trouvé dans la traduction');

    const juzs = await api.get<Juz[]>('/quran/juzs', undefined, false);
    assert.equal(juzs.length, 30); assert.match(juzRange(juzs[0], 'fr'), /→/);
    const reg = await api.post<{ token: string; user: User }>('/auth/register', { email: `m2-${Date.now()}@test.local`, password: 'Passw0rd-m2-test', locale: 'fr' });
    token = reg.token;
    assert.equal((await api.get<{ plan: QuranPlan }>('/quran/plan')).plan, null);
    let p = (await api.post<{ plan: QuranPlan }>('/quran/plan/start', {})).plan!;
    assert.equal(p.day, 1); assert.equal(p.todayJuz, 1);
    p = (await api.put<{ plan: QuranPlan }>('/quran/plan/juz/1', { read: true })).plan!;
    assert.deepEqual(p.reads, [1]);
    p = (await api.put<{ plan: QuranPlan }>('/quran/plan/prefs', { remindHour: 20 })).plan!;
    assert.equal(p.remindHour, 20);
    p = (await api.put<{ plan: QuranPlan }>('/quran/plan/juz/1', { read: false })).plan!;
    assert.deepEqual(p.reads, []);
    assert.equal((await api.del<{ plan: QuranPlan }>('/quran/plan')).plan, null);
    step('programme 30 jours : commencer, cocher, rappel 20 h, décocher, arrêter');
  } finally {
    token = adm.token;
    for (const id of ids) await api.del(`/admin/quran/resources/${id}`).catch(() => {});
    await api.del(`/admin/quran/reciters/${rc.id}`).catch(() => {});
    step('données fictives supprimées');
  }
  console.log('M2 : contrat OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
