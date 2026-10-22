// fetch avec nouvelles tentatives (publication depuis GitHub vers notre serveur : un délai de connexion ou une réponse 502/503/504 passagère
// ne doit pas faire échouer toute la publication). Attente : 3 s, 6 s, 12 s… jusqu'à `tries` essais.
export async function fetchRetry(url, opts = {}, tries = 6) {
  let last;
  for (let i = 1; i <= tries; i += 1) {
    try {
      const r = await fetch(url, opts);
      if (![502, 503, 504].includes(r.status) || i === tries) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
    const wait = 3000 * 2 ** (i - 1);
    console.log(`Connexion à ${new URL(url).host} impossible (${last?.cause?.code || last?.message}) — nouvel essai ${i + 1}/${tries} dans ${wait / 1000} s`);
    await new Promise((r) => setTimeout(r, Math.min(wait, 30000)));
  }
  throw last;
}
