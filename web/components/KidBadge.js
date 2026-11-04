// Badge enfant : illustration vectorielle (public/kids/badges/<code>.svg, version « rosace dorée » validée par Epok le 04/11).
// Décorative : le nom du badge est toujours écrit à côté. Code inconnu : l'ancienne icône emoji sert de secours.
import { BADGE_ICON } from '../lib/kids';

export default function KidBadge({ code, size = 56 }) {
  if (!BADGE_ICON[code]) return <span aria-hidden="true">🏅</span>;
  return <img className="kd-badge-img" src={`/kids/badges/${code}.svg`} width={size} height={size} alt="" loading="lazy" decoding="async" />;
}
