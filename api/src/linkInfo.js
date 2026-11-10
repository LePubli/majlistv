// Lecture des informations d'une vidéo à partir de son adresse (titre, intervenant, description), pour pré-remplir « Nouvelle vidéo ».
//   YouTube, Vimeo, Dailymotion : service « oEmbed » public de la plateforme (titre + nom de la chaîne) ;
//     + la description : Vimeo la donne ; YouTube : lecture de la page de la vidéo (au mieux) ; sinon elle est reprise après l'enregistrement
//     par le transcripteur, comme avant.
//   archive.org : API de métadonnées (titre, auteur, description) ;
//   autre site : titre et description de la page (balises Open Graph), auteur si la page le dit.
// Tout est « au mieux » : une erreur ne bloque jamais l'ajout, les champs restent à saisir. Adresses publiques seulement.
import dns from 'node:dns/promises';
import { isPrivateHost, classifyUrl } from './mediaImport.js';

const MAX_PAGE = 600 * 1024;
const UA = 'Mozilla/5.0 (compatible; MejlissTV-linkinfo)';
// Adresses des services : modifiables pour les tests (faux serveur local).
const BASES = () => ({
  youtube: process.env.LINKINFO_YOUTUBE_OEMBED || 'https://www.youtube.com/oembed',
  vimeo: process.env.LINKINFO_VIMEO_OEMBED || 'https://vimeo.com/api/oembed.json',
  dailymotion: process.env.LINKINFO_DAILYMOTION_OEMBED || 'https://www.dailymotion.com/services/oembed',
  archive: (process.env.ARCHIVE_BASE_URL || 'https://archive.org').replace(/\/$/, ''),
});

// ---------- Nettoyage ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—' };
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const strip = (s) => decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, ''));
const oneLine = (s, max) => strip(s).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const multiLine = (s, max) => strip(s).replace(/\r/g, '').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const first = (v) => (Array.isArray(v) ? v[0] : v);

export const finish = (o) => ({
  title: oneLine(o.title, 200), speaker: oneLine(o.speaker, 200), description: multiLine(o.description, 5000),
});

// ---------- Lecture des services (fonctions pures, testées avec des exemples) ----------
export function fromOembed(j) {
  return finish({ title: j?.title, speaker: j?.author_name, description: j?.description });
}
export function fromArchive(j) {
  const m = j?.metadata || {};
  return finish({ title: first(m.title), speaker: first(m.creator), description: first(m.description) });
}
function metaContent(html, names) {
  for (const n of names) {
    const re = new RegExp(`<meta\\s[^>]*?(?:property|name)\\s*=\\s*["']${n}["'][^>]*?>`, 'i');
    const tag = html.match(re)?.[0];
    if (!tag) continue;
    const c = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (c && (c[1] || c[2])) return c[1] || c[2];
  }
  return '';
}
export function fromHtml(html) {
  const head = String(html || '').slice(0, MAX_PAGE);
  const title = metaContent(head, ['og:title', 'twitter:title']) || head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const author = metaContent(head, ['author', 'article:author']);
  return finish({
    title,
    speaker: /^https?:/i.test(author) ? '' : author,
    description: metaContent(head, ['og:description', 'twitter:description', 'description']),
  });
}
// Description complète d'une page YouTube (champ « shortDescription » de la page), sinon la balise og:description.
export function youtubeDescription(html) {
  const m = String(html || '').match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return JSON.parse(`"${m[1]}"`); } catch { /* repli ci-dessous */ } }
  return metaContent(String(html || ''), ['og:description']);
}

// Page YouTube demandée dans la langue de la vidéo : si YouTube a une version localisée (traduction du créateur, doublage
// automatique), son titre diffère de celui d'oEmbed (toujours l'original) : on prend alors le titre et le résumé localisés.
export function youtubeLocalized(html, oembed) {
  const ogTitle = oneLine(metaContent(String(html || ''), ['og:title']), 200);
  const localized = Boolean(ogTitle && oembed.title && ogTitle !== oembed.title);
  const ogDesc = multiLine(metaContent(String(html || ''), ['og:description']), 5000);
  const full = multiLine(youtubeDescription(html), 5000);
  return { title: localized ? ogTitle : oembed.title, description: localized ? (ogDesc || full) : full, localized };
}

// ---------- Téléchargement sûr : adresses publiques, 3 redirections, durée et taille limitées ----------
async function assertPublic(u) {
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('adresse non acceptée');
  if (process.env.LINKINFO_ALLOW_PRIVATE === '1') return; // tests seulement
  if (isPrivateHost(u.hostname)) throw new Error('adresse non publique');
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) throw new Error('adresse non publique');
}
async function getText(raw, { accept = '*/*', headers = {} } = {}) {
  let u = new URL(raw);
  const signal = AbortSignal.timeout(6000);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const res = await fetch(u, { redirect: 'manual', signal, headers: { 'user-agent': UA, accept, 'accept-language': 'fr,en;q=0.8', ...headers } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
    if (!res.ok) throw new Error(`réponse ${res.status}`);
    const chunks = []; let size = 0;
    for await (const c of res.body) {
      size += c.length; chunks.push(c);
      if (size > MAX_PAGE) break; // le titre et les balises sont en tête de page : inutile de tout lire
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('trop de redirections');
}
const getJson = async (url) => JSON.parse(await getText(url, { accept: 'application/json' }));

// ---------- Point d'entrée ----------
// Retourne { origin, title, speaker, description } (champs vides si inconnus) ou { error, code }.
export async function linkInfo(rawUrl, lang = '') {
  let c = classifyUrl(rawUrl);
  if (c.error && c.code === 'private_url' && process.env.LINKINFO_ALLOW_PRIVATE === '1') c = { url: String(rawUrl).trim(), origin: 'web', archive: null }; // tests seulement
  if (c.error) return c;
  const B = BASES();
  let info = { title: '', speaker: '', description: '' };
  try {
    if (c.origin === 'youtube') {
      info = fromOembed(await getJson(`${B.youtube}?format=json&url=${encodeURIComponent(c.url)}`));
      // Titre / description : page de la vidéo demandée dans la langue choisie (au mieux ; sinon reprise après l'enregistrement).
      try {
        const code = /^[a-z]{2,3}$/.test(lang) ? lang : 'fr';
        const page = new URL(c.url); page.searchParams.set('hl', code);
        const html = await getText(page.toString(), { accept: 'text/html', headers: { cookie: 'CONSENT=YES+1; SOCS=CAI', 'accept-language': `${code},en;q=0.5` } });
        const y = youtubeLocalized(html, info);
        info.title = y.title || info.title;
        info.description = y.description;
      } catch { /* sans description : le transcripteur la reprendra après l'enregistrement */ }
    } else if (c.origin === 'vimeo') {
      info = fromOembed(await getJson(`${B.vimeo}?url=${encodeURIComponent(c.url)}`));
    } else if (c.origin === 'dailymotion') {
      info = fromOembed(await getJson(`${B.dailymotion}?format=json&url=${encodeURIComponent(c.url)}`));
    } else if (c.origin === 'archive' && c.archive) {
      info = fromArchive(await getJson(`${B.archive}/metadata/${encodeURIComponent(c.archive.ref)}`));
    } else {
      info = fromHtml(await getText(c.url, { accept: 'text/html,application/xhtml+xml' }));
    }
  } catch (e) {
    return { origin: c.origin, ...info, found: false, reason: String(e.message || e).slice(0, 120) };
  }
  return { origin: c.origin, ...info, found: Boolean(info.title || info.speaker || info.description) };
}
