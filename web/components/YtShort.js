'use client';
// Short lu depuis YouTube (lecteur intégré, sans cookies) : plein cadre 9:16, en boucle, muet par défaut (exigence des navigateurs).
// L'iframe ne reçoit pas les gestes (pointer-events: none) pour que le balayage vertical continue de faire défiler le fil.
export default function YtShort({ id, muted = true, title = '', className = '' }) {
  if (!/^[\w-]{6,20}$/.test(String(id || ''))) return null;
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0`;
  return (
    <iframe key={`${id}-${muted ? 'm' : 's'}`} className={className} src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
      style={{ border: 0, width: '100%', height: '100%', pointerEvents: 'none', background: '#000' }} />
  );
}
