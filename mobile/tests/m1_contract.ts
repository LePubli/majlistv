// Étape M1 — essai de bout en bout contre une VRAIE API : thème (/config), bloc « Aujourd'hui » (/me/today),
// « À regarder plus tard » (/me/watchlater). Lancer : API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m1_contract.ts
// Non lancé par « npm test » (il faut une API qui tourne).
import assert from 'node:assert/strict';
import { createApi } from '../src/lib/api';
import { pickSkin } from '../src/lib/theme';
import { todayLabel, todayTarget, type TodayResponse } from '../src/lib/today';
import { translate } from '../src/lib/i18n';
import type { AppConfig, Card, Home, User } from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
let token: string | null = null;
const api = createApi({ baseUrl: URL_, getToken: () => token });
const step = (s: string) => console.log('  ✓ ' + s);

async function main() {
  const cfg = await api.get<AppConfig>('/config', undefined, false);
  assert.ok(cfg.skin, '/config renvoie skin');
  assert.ok(['classique', 'nuit'].includes(cfg.skin!.def));
  assert.equal(typeof cfg.skin!.choice, 'boolean');
  assert.equal(pickSkin(cfg.skin!.def), cfg.skin!.def);
  step(`GET /config : thème ${cfg.skin!.def}, choix des visiteurs ${cfg.skin!.choice}`);

  const email = `m1-${Date.now()}@test.local`;
  const reg = await api.post<{ token: string; user: User }>('/auth/register', { email, password: 'Passw0rd-m1-test', locale: 'fr' });
  token = reg.token;
  step('compte de test créé');

  for (const lang of ['fr', 'en', 'ar'] as const) {
    const d = await api.get<TodayResponse>('/me/today', { lang });
    assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(d.items));
    assert.equal(d.left, d.items.filter((x) => !x.done).length);
    for (const it of d.items) {
      assert.ok(todayLabel(it, (k, v) => translate(lang, k, v)), `ligne connue de l'application : ${it.kind}`);
      const tg = todayTarget(it.href);
      assert.ok('app' in tg || 'web' in tg);
    }
    step(`GET /me/today?lang=${lang} : ${d.items.length} ligne(s) [${d.items.map((x) => x.kind).join(', ')}], toutes affichables`);
  }

  const home = await api.get<Home>('/home');
  const talk = (home.rows ?? []).flatMap((r) => r.talks ?? [])[0];
  assert.ok(talk, 'au moins une conférence sur l\'accueil');
  assert.deepEqual(await api.get<string[]>('/me/watchlater/ids'), []);
  await api.put(`/me/watchlater/${talk.id}`);
  assert.deepEqual(await api.get<string[]>('/me/watchlater/ids'), [talk.id]);
  const list = await api.get<Card[]>('/me/watchlater');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, talk.id);
  assert.ok(list[0].title);
  step('PUT /me/watchlater/:id puis GET /ids et GET liste (vignette complète)');
  await api.put(`/me/watchlater/${talk.id}`); // deux fois : pas de doublon
  assert.equal((await api.get<string[]>('/me/watchlater/ids')).length, 1);
  await api.del(`/me/watchlater/${talk.id}`);
  assert.deepEqual(await api.get<string[]>('/me/watchlater/ids'), []);
  step('ajout en double sans doublon, puis retrait');
  console.log('M1 : contrat OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
