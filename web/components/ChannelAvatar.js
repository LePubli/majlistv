// Image de profil d'une chaîne (étape E2) : l'image envoyée, sinon la première lettre du nom sur fond de couleur.
export default function ChannelAvatar({ name, url, size = '' }) {
  const cls = `ch-avatar${size ? ` ch-avatar-${size}` : ''}`;
  if (url) return <img className={`${cls} ch-avatar-img`} src={url} alt="" width="72" height="72" loading="lazy" />;
  return <span className={cls} aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}
