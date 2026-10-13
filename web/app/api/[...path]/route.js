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
    const res = await fetch(url, { method: req.method, headers, body, cache: 'no-store' });
    // 204 / 205 / 304 : une réponse sans contenu ne doit pas porter de corps (sinon erreur -> 502, ex. favoris).
    const noBody = [204, 205, 304].includes(res.status);
    return new Response(noBody ? null : await res.text(), {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch {
    return Response.json({ error: 'API indisponible' }, { status: 502 });
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
