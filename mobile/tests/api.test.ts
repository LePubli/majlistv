// Client d'API : jeton, erreurs, 204, délai, déconnexion sur 401, requêtes construites correctement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, absoluteUrl, buildQuery, createApi } from '../src/lib/api';

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<{ status: number; body?: unknown } | 'hang' | 'throw'>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r === 'throw') throw new TypeError('Network request failed');
    if (r === 'hang') return new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const res = r ?? { status: 200, body: {} };
    return new Response(res.status === 204 ? null : JSON.stringify(res.body ?? {}), { status: res.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test('absoluteUrl : chemin relatif, adresse complète, barres en trop', () => {
  assert.equal(absoluteUrl('https://api.x.fr/', '/hls/1/master.m3u8?t=a'), 'https://api.x.fr/hls/1/master.m3u8?t=a');
  assert.equal(absoluteUrl('https://api.x.fr', 'hls/1'), 'https://api.x.fr/hls/1');
  assert.equal(absoluteUrl('https://api.x.fr', 'https://cdn.y/z.mp4'), 'https://cdn.y/z.mp4');
});

test('buildQuery : ignore les valeurs vides, encode le reste', () => {
  assert.equal(buildQuery({ q: 'foi & vie', limit: 20, category: undefined, x: null, y: '' }), '?q=foi%20%26%20vie&limit=20');
  assert.equal(buildQuery(), '');
  assert.equal(buildQuery({ a: undefined }), '');
});

test('GET : envoie le jeton Bearer et renvoie le JSON', async () => {
  const f = fakeFetch([{ status: 200, body: [{ id: '1' }] }]);
  const api = createApi({ baseUrl: 'https://api.x.fr', getToken: () => 'tok', fetchImpl: f.impl });
  const out = await api.get<{ id: string }[]>('/talks', { limit: 5 });
  assert.deepEqual(out, [{ id: '1' }]);
  assert.equal(f.calls[0].url, 'https://api.x.fr/talks?limit=5');
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok');
});

test('sans jeton : pas d’en-tête Authorization ; auth=false l’omet même connecté', async () => {
  const f = fakeFetch([{ status: 200 }, { status: 200 }]);
  const a1 = createApi({ baseUrl: 'https://a', getToken: () => null, fetchImpl: f.impl });
  await a1.get('/home');
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, undefined);
  const a2 = createApi({ baseUrl: 'https://a', getToken: () => 'tok', fetchImpl: f.impl });
  await a2.get('/home', undefined, false);
  assert.equal((f.calls[1].init.headers as Record<string, string>).Authorization, undefined);
});

test('POST/PUT : corps JSON et Content-Type ; 204 renvoie undefined', async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200, body: { token: 't' } }]);
  const api = createApi({ baseUrl: 'https://a', getToken: () => 'tok', fetchImpl: f.impl });
  assert.equal(await api.put('/me/progress/1', { positionMs: 5000, durationMs: 9000 }), undefined);
  assert.equal(f.calls[0].init.method, 'PUT');
  assert.equal(f.calls[0].init.body, JSON.stringify({ positionMs: 5000, durationMs: 9000 }));
  assert.equal((f.calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.deepEqual(await api.post('/auth/login', { email: 'a@b.c', password: 'x' }), { token: 't' });
});

test('erreur serveur : message, statut et code de l’API', async () => {
  const f = fakeFetch([{ status: 409, body: { error: 'Email déjà utilisé', code: 'dup' } }]);
  const api = createApi({ baseUrl: 'https://a', getToken: () => null, fetchImpl: f.impl });
  await assert.rejects(api.post('/auth/register', {}), (e: ApiError) => e instanceof ApiError && e.status === 409 && e.code === 'dup' && e.message === 'Email déjà utilisé');
});

test('401 avec jeton : onUnauthorized appelé ; sans jeton : non', async () => {
  let n = 0;
  const f = fakeFetch([{ status: 401, body: { error: 'x' } }, { status: 401, body: { error: 'x' } }]);
  const withTok = createApi({ baseUrl: 'https://a', getToken: () => 'tok', onUnauthorized: () => { n++; }, fetchImpl: f.impl });
  await assert.rejects(withTok.get('/me/continue'));
  assert.equal(n, 1);
  const noTok = createApi({ baseUrl: 'https://a', getToken: () => null, onUnauthorized: () => { n++; }, fetchImpl: f.impl });
  await assert.rejects(noTok.post('/auth/login', {}));
  assert.equal(n, 1); // un mauvais mot de passe ne déconnecte pas
});

test('réseau coupé : ApiError statut 0 « network »', async () => {
  const f = fakeFetch(['throw']);
  const api = createApi({ baseUrl: 'https://a', getToken: () => null, fetchImpl: f.impl });
  await assert.rejects(api.get('/home'), (e: ApiError) => e.status === 0 && e.code === 'network');
});

test('délai dépassé : ApiError statut 0 « timeout »', async () => {
  const f = fakeFetch(['hang']);
  const api = createApi({ baseUrl: 'https://a', getToken: () => null, fetchImpl: f.impl, timeoutMs: 30 });
  await assert.rejects(api.get('/home'), (e: ApiError) => e.status === 0 && e.code === 'timeout');
});

test('réponse non JSON en erreur : message HTTP par défaut', async () => {
  const impl = (async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch;
  const api = createApi({ baseUrl: 'https://a', getToken: () => null, fetchImpl: impl });
  await assert.rejects(api.get('/home'), (e: ApiError) => e.status === 502 && e.message === 'HTTP 502');
});
