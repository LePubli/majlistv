'use client';
// Bandeau de saison (étape 45) : Ramadan, Hajj, Mawlid, Achoura. Affiché sur l'accueil pendant la période (et quelques jours avant),
// réglé dans Admin → Saisons. Invisible quand aucune saison n'est activée ou que la période est passée.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import Row from './Row';

const ICON = { ramadan: '🌙', hajj: '🕋', mawlid: '✨', ashura: '🌅', eid_fitr: '🎉', rajab: '🌟', dhulqada: '🌟' };

// `onState(true|false)` : prévient l'accueil qu'une saison est (ou non) en cours, pour n'afficher qu'une bande à la fois (N3).
export default function SeasonBand({ onState }) {
  const { t, locale, call, feat } = useApp();
  const [s, setS] = useState(null);
  useEffect(() => {
    call(`/seasons/current?lang=${locale}`, {}, null).then((r) => {
      const season = r.ok ? r.data.season : null;
      setS(season);
      onState?.(Boolean(season));
    });
  }, [call, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const when = s.daysToStart > 0 ? t('seasonIn').replace('{n}', s.daysToStart) : (s.daysLeft === 0 ? t('seasonLast') : t('seasonLeft').replace('{n}', s.daysLeft));
  return (
    <>
      <section className={`ss-band ss-${s.id}`} aria-label={s.name}>
        <span className="ss-icon" aria-hidden="true">{ICON[s.id] || '☪'}</span>
        <div className="ss-body">
          <h2 className="ss-title">{s.title}</h2>
          <p className="ss-text">{s.text}</p>
          <p className="ss-when">{when}</p>
        </div>
        <div className="ss-btns">
          {s.id === 'ramadan' && feat('ramadan') && <Link className="btn" href="/ramadan">{t('rzNav')}</Link>}
          {s.collection && <Link className={s.id === 'ramadan' && feat('ramadan') ? 'btn ghost' : 'btn'} href={`/collections/${s.collection.id}`}>{t('seasonSee')}</Link>}
        </div>
      </section>
      {s.talks.length > 0 && <Row id={`row-season-${s.id}`} title={s.collection?.title || s.title} talks={s.talks} t={t} />}
    </>
  );
}
