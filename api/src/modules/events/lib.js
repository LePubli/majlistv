// Événements en direct : règles pures (phase, adresse de vidéo, fichier agenda .ics). Sans accès base : testable seul.
export const SOURCES = ['youtube', 'vimeo'];
export const STATUSES = ['draft', 'published', 'cancelled'];

// Adresse YouTube (watch, youtu.be, live, embed) ou Vimeo → { source, ref } ; null sinon (pas d'autre plateforme pour un direct).
export function parseLiveUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const yt = /^[\w-]{11}$/;
  if (host === 'youtu.be') { const id = u.pathname.slice(1); return yt.test(id) ? { source: 'youtube', ref: id } : null; }
  if (host === 'youtube.com') {
    const m = u.pathname.match(/^\/(?:embed|live|shorts)\/([\w-]{11})/);
    const id = m ? m[1] : u.searchParams.get('v');
    return id && yt.test(id) ? { source: 'youtube', ref: id } : null;
  }
  if (host === 'vimeo.com') { const m = u.pathname.match(/^\/(\d+)(?:\/|$)/); return m ? { source: 'vimeo', ref: m[1] } : null; }
  return null;
}

// Phase à l'instant `now` : upcoming (annoncé), live (le lecteur est ouvert, jusqu'à la fin prévue), ended.
export function phaseOf(ev, now = new Date(), openMinutes = 10) {
  const start = new Date(ev.starts_at ?? ev.startsAt).getTime(); const dur = Number(ev.duration_minutes ?? ev.durationMinutes) || 60;
  const t = now.getTime();
  if (t >= start + dur * 60000) return 'ended';
  if (t >= start - openMinutes * 60000) return 'live';
  return 'upcoming';
}

const pad = (n) => String(n).padStart(2, '0');
export const icsDate = (d) => { const x = new Date(d); return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}${pad(x.getUTCSeconds())}Z`; };
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lignes de 75 octets au plus (RFC 5545), repliées par « CRLF + espace ».
function fold(line) {
  const out = []; let cur = ''; let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// Fichier agenda d'un événement : heure en UTC, rappel une heure avant, lien vers la fiche.
export function buildIcs(ev, { url = '', appName = 'Mejliss TV', now = new Date() } = {}) {
  const start = new Date(ev.starts_at); const end = new Date(start.getTime() + (Number(ev.duration_minutes) || 60) * 60000);
  const desc = [ev.speaker ? `Intervenant : ${ev.speaker}` : '', ev.description || '', url ? `Lien : ${url}` : ''].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${appName}//Evenements//FR`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${ev.id}@events.majlistv`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(ev.title)}`, `DESCRIPTION:${esc(desc)}`, ...(url ? [`URL:${url}`] : []),
    `STATUS:${ev.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

// Forme publique d'un événement : le lien du direct n'est donné que lorsque le lecteur est ouvert (ou à l'auteur / l'administrateur).
export function publicShape(r, { now = new Date(), openMinutes = 10, privileged = false } = {}) {
  const phase = r.status === 'cancelled' ? 'cancelled' : phaseOf(r, now, openMinutes);
  const out = {
    id: r.id, title: r.title, speaker: r.speaker, description: r.description, language: r.language,
    startsAt: new Date(r.starts_at).toISOString(), durationMinutes: r.duration_minutes, phase,
  };
  if (phase === 'live' || privileged) out.video = { source: r.source, ref: r.video_ref };
  return out;
}

// Chaîne TV en direct : lien YouTube accepté (chaîne @nom, /channel/UC…, /c/…, /user/…, ou un direct /watch?v=…, youtu.be, /live/…).
// Renvoie l'adresse normalisée (https://www.youtube.com/…) ou null. Le transcripteur retrouve le direct en cours depuis cette adresse.
export function parseChannelUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const video = parseLiveUrl(u.href);
  if (video?.source === 'youtube') return `https://www.youtube.com/watch?v=${video.ref}`;
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
