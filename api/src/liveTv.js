// TV en direct (fonction « livetv ») : chaînes YouTube diffusées 24 h/24 (ex. La Mecque, Médine).
// Indépendante du module « Événements en direct » depuis le 14/11 : table créée par la migration 120 du socle.

// Identifiant d'une vidéo / d'un direct YouTube dans un lien (youtu.be, /watch?v=, /live/, /embed/, /shorts/), ou null.
function youtubeVideoId(u) {
  const host = u.hostname.replace(/^(www|m)\./, '');
  const yt = /^[\w-]{11}$/;
  if (host === 'youtu.be') { const id = u.pathname.slice(1); return yt.test(id) ? id : null; }
  if (host !== 'youtube.com') return null;
  const m = u.pathname.match(/^\/(?:embed|live|shorts)\/([\w-]{11})/);
  const id = m ? m[1] : u.searchParams.get('v');
  return id && yt.test(id) ? id : null;
}

// Chaîne TV en direct : lien YouTube accepté (chaîne @nom, /channel/UC…, /c/…, /user/…, ou un direct /watch?v=…, youtu.be, /live/…).
// Renvoie l'adresse normalisée (https://www.youtube.com/…) ou null. Le transcripteur retrouve le direct en cours depuis cette adresse.
export function parseChannelUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const vid = youtubeVideoId(u);
  if (vid) return `https://www.youtube.com/watch?v=${vid}`;
  if (host !== 'youtube.com') return null;
  const p = u.pathname.replace(/\/+$/, '');
  let m = p.match(/^\/(@[\w.-]{2,60})(?:\/(?:live|streams|videos|featured))?$/);
  if (m) return `https://www.youtube.com/${m[1]}`;
  m = p.match(/^\/channel\/(UC[\w-]{22})(?:\/(?:live|streams|videos|featured))?$/);
  if (m) return `https://www.youtube.com/channel/${m[1]}`;
  m = p.match(/^\/(c|user)\/([\w.-]{2,60})(?:\/(?:live|streams|videos|featured))?$/);
  if (m) return `https://www.youtube.com/${m[1]}/${m[2]}`;
  return null;
}

export const liveChannelShape = (r) => ({
  id: r.id, name: r.name, live: Boolean(r.live && r.video_id), video: r.video_id ? { source: 'youtube', ref: r.video_id } : null, title: r.title || '',
});
