'use client';
import { useEffect, useState } from 'react';
import { BlocksView } from '../../components/PageBlocks';
import { useApp } from '../../components/Providers';
import { DIR } from '../../lib/i18n';

// Messages attendus :
//   { type: 'pb-content', zones: { main | before | after: [blocs] }, locale, pickedId }   (pages en blocs)
//   { type: 'pb-layout', nav, zones: { topbar, footerTop }, viewAs }                      (En-tête, menus et pied de page : le vrai en-tête, les vrais menus et le vrai pied de page se redessinent)
export default function PreviewClient() {
  const { setLayoutPreview, setViewAs } = useApp();
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return; // seulement l'éditeur, sur le même site
      if (e.data?.type === 'pb-layout') {
        setLayoutPreview({ nav: e.data.nav || null, zones: { topbar: e.data.zones?.topbar || [], footerTop: e.data.zones?.footerTop || [] }, targeted: false });
        setViewAs(e.data.viewAs === 'visitor' ? 'visitor' : null);
        setMsg({ layout: true });
        return;
      }
      if (e.data?.type !== 'pb-content') return;
      setMsg(e.data);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'pb-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, [setLayoutPreview, setViewAs]);
  // Un clic sur un bloc de l'aperçu le sélectionne dans l'éditeur.
  const pick = (id) => window.parent?.postMessage({ type: 'pb-pick', id }, window.location.origin);
  if (!msg) return <main className="pb-page"><p className="meta" role="status">Aperçu en préparation…</p></main>;
  if (msg.layout) return <main className="pb-page"><p className="meta">Contenu de la page (l’en-tête, les menus et le pied de page ci-dessus et ci-dessous sont ceux de votre brouillon).</p></main>;
  const locale = msg.locale || 'fr';
  const order = msg.zones?.main ? ['main'] : ['before', 'after'];
  return (
    <main className="pb-page" lang={locale} dir={DIR[locale] || 'ltr'}>
      {order.map((z) => (
        <div key={z} className={`pb-zone pb-${z}`}>
          {order.length > 1 && <p className="pb-zone-label">{z === 'before' ? 'Avant le contenu de la page' : 'Après le contenu de la page'}</p>}
          <BlocksView blocks={msg.zones?.[z] || []} locale={locale} preview onPick={pick} pickedId={msg.pickedId} />
          {order.length > 1 && z === 'before' && <p className="pb-zone-label">▼ Contenu habituel de la page ▼</p>}
        </div>
      ))}
    </main>
  );
}
