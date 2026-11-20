'use client';
// Rangée de cartes de chiffres de la maquette (thème Premium seulement) : icône, libellé, valeur réelle.
// items : [{ icon (clé de ICONS), tone, label, value, hint? , href? }] ; une valeur absente (null) n'affiche pas la carte.
import Link from 'next/link';
import { useApp } from '../Providers';
import { ICONS, Icon } from '../ManageShell';

export default function BoKpis({ items }) {
  const { skin } = useApp();
  if (skin !== 'premium') return null;
  const shown = items.filter((i) => i.value != null);
  if (!shown.length) return null;
  return (
    <div className="admin-cards bo-kpis">
      {shown.map((i) => {
        const body = (<><span className={`bo-kpi-ico ${i.tone || 'blue'}`} aria-hidden="true"><Icon d={ICONS[i.icon]} /></span><strong>{i.value}</strong><span>{i.label}</span>{i.hint && <small className="meta">{i.hint}</small>}</>);
        return i.href ? <Link key={i.label} className="admin-card kpi" href={i.href}>{body}</Link> : <div key={i.label} className="admin-card kpi">{body}</div>;
      })}
    </div>
  );
}
