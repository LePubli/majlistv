// Proxy same-origin vers l'API (adresse lue au runtime via API_URL) : évite CORS et le rebuild.
export const dynamic = 'force-dynamic';
const API = process.env.API_URL || 'http://localhost:3000';

async function handler(req, { params }) {
  const url = `${API}/${params.path.join('/')}${new URL(req.url).search}`;
  const headers = {};
  for (const h of ['content-type', 'authorization']) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
  try {
    // Les redirections ne sont pas suivies ici : elles sont renvoyées au navigateur (vignettes à adresse stable /seo/poster/…).
    const res = await fetch(url, { method: req.method, headers, body, cache: 'no-store', redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      return new Response(null, { status: res.status, headers: { location: res.headers.get('location'), 'cache-control': res.headers.get('cache-control') || 'no-store' } });
    }
    // 204 / 205 / 304 : une réponse sans contenu ne doit pas porter de corps (sinon erreur -> 502, ex. favoris).
    const noBody = [204, 205, 304].includes(res.status);
    // Corps relayé en octets (PDF des ouvrages) ; le nom de fichier du téléchargement et l'interdiction de cache sont conservés.
    const out = { 'content-type': res.headers.get('content-type') || 'application/json' };
    for (const h of ['content-disposition', 'cache-control']) if (res.headers.get(h)) out[h] = res.headers.get(h);
    return new Response(noBody ? null : await res.arrayBuffer(), { status: res.status, headers: out });
  } catch {
    return Response.json({ error: 'API indisponible' }, { status: 502 });
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
