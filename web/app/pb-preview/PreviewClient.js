'use client';
import { useEffect, useState } from 'react';
import { BlocksView } from '../../components/PageBlocks';
import { DIR } from '../../lib/i18n';

// Message attendu : { type: 'pb-content', zones: { main | before | after: [blocs] }, locale, pickedId }
export default function PreviewClient() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'pb-content') return; // seulement l'éditeur, sur le même site
      setMsg(e.data);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'pb-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  // Un clic sur un bloc de l'aperçu le sélectionne dans l'éditeur.
  const pick = (id) => window.parent?.postMessage({ type: 'pb-pick', id }, window.location.origin);
  if (!msg) return <main className="pb-page"><p className="meta" role="status">Aperçu en préparation…</p></main>;
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
