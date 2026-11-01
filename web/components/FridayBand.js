'use client';
// Carte du vendredi (étape 45C) : sur l'accueil, uniquement le vendredi (heure de Paris) et si le vendredi est activé dans Admin → Vendredi.
// Lien vers la sourate Al-Kahf (si le Coran est prêt), rappels et rangée « Conférences du vendredi ».
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import Row from './Row';

export default function FridayBand() {
  const { t, locale, call } = useApp();
  const [f, setF] = useState(null);
  useEffect(() => { call(`/friday?lang=${locale}`, {}, null).then((r) => setF(r.ok && r.data.active ? r.data : null)); }, [call, locale]);
  if (!f) return null;
  const ready = f.kahf?.ready;
  return (
    <>
      <section className="fd-band" aria-label={t('fdTitle')}>
        <span className="fd-icon" aria-hidden="true">🕌</span>
        <div className="fd-body">
          <h2 className="fd-title">{t('fdTitle')}</h2>
          {f.ghusl && <p className="fd-text">{f.ghusl}</p>}
          {f.salawat && <p className="fd-text">{f.salawat}</p>}
        </div>
        {ready && <Link className="btn" href={`/coran/${f.kahf.n}`}>{t('fdKahf')}</Link>}
      </section>
      {f.talks.length > 0 && <Row id="row-friday" title={f.collection?.title || t('fdRow')} talks={f.talks} t={t} />}
    </>
  );
}
