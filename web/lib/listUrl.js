// Reconnaît une adresse de LISTE (playlist, chaîne, compte, album, collection) collée là où l'on attend une seule vidéo.
// Sert à orienter vers « Importer une playlist ou une chaîne » au lieu d'un message d'erreur.
export function isListUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return false; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const seg = path.split('/').filter(Boolean);
  if (host === 'youtube.com') {
    if (path === '/playlist') return /^(PL|UU|OL|FL)/.test(u.searchParams.get('list') || '');
    if (/^\/(show|browse)\/VL/.test(path)) return true;
    return /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(\/(videos|streams|playlists))?$/.test(path);
  }
  if (host === 'vimeo.com') {
    if (['album', 'showcase', 'channels'].includes(seg[0])) return seg.length >= 2;
    return seg.length >= 1 && !/^\d+$/.test(seg[0]) && !['channels', 'groups', 'categories', 'search', 'watch'].includes(seg[0]) && seg.length === 1;
  }
  if (host === 'dailymotion.com') {
    if (seg[0] === 'playlist') return true;
    return seg.length === 1 && !['video', 'embed', 'search', 'playlist'].includes(seg[0]);
  }
  if (host === 'archive.org') return path.startsWith('/search') || /^\/details\/@/.test(path);
  return false;
}
