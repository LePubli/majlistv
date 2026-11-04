'use client';
// Coran (refonte 45B3) : une seule recherche (nom ou numéro de sourate, et mot dans le texte), tri, « Reprendre » (dernière sourate lue, gardée sur l'appareil),
// lecture en 30 jours dans une colonne latérale. Liste des 114 sourates et recherche (texte arabe, traduction, phonétique). Utilisée par la page /coran et par l'onglet « Coran » de la page Apprendre.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import QuranPlan from './QuranPlan';

export default function QuranIndex({ embedded = false }) {
  const { t, locale, call, feat } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [sort, setSort] = useState('order');
  const [last, setLast] = useState(null);
  useEffect(() => { try { const x = JSON.parse(localStorage.getItem('qr-last') || 'null'); if (x?.n >= 1 && x.n <= 114) setLast(x); } catch { /* stockage indisponible */ } }, []);
  useEffect(() => { call('/quran/suras', {}, null).then((r) => setD(r.ok ? r.data : { ready: false, suras: [], off: true })); }, [call]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setRes(null); return undefined; }
    const h = setTimeout(() => { call(`/quran/search?q=${encodeURIComponent(s)}&lang=${locale}`, {}, null).then((r) => setRes(r.ok ? r.data.results : [])); }, 350);
    return () => clearTimeout(h);
  }, [q, call, locale]);
  if (!d) return <p className="meta">…</p>;
  const f = q.trim();
  let list = d.suras.filter((s) => !f || s.en.toLowerCase().includes(f.toLowerCase()) || s.ar.includes(f) || String(s.n) === f);
  if (sort === 'short') list = [...list].sort((a, b) => (a.verses ?? 1e9) - (b.verses ?? 1e9));
  if (sort === 'long') list = [...list].sort((a, b) => (b.verses ?? 0) - (a.verses ?? 0));
  const lastSura = last && d.suras.find((s) => s.n === last.n);
  return (
    <>
      <section className="series-listhead">{embedded ? <h2>{t('qrTitle')}</h2> : <h1>{t('qrTitle')}</h1>}<p className="meta">{t('qrIntro')}</p></section>
      {(d.off || !d.ready) && <p className="soon">{t('qrSoon')}</p>}
      {d.ready && (
        <div className="qr-layout">
          <div className="qr-main">
            <label className="qr-search"><span className="sr-only">{t('qrSearch')}</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('qrSearch')} maxLength={80} /></label>
            {res && (
              <section aria-live="polite" className="qr-results">
                {res.length === 0 ? <p className="meta">{t('qrNoResult')}</p> : res.map((x) => (
                  <Link key={`${x.sura}:${x.aya}`} href={`/coran/${x.sura}#v${x.aya}`} className="qr-hit">
                    <span className="meta small">{x.name} · {x.sura}:{x.aya}</span>
                    <span className="qr-ar" lang="ar" dir="rtl">{x.ar}</span>
                    {x.tr && <span>{x.tr}</span>}
                  </Link>
                ))}
              </section>
            )}
            {lastSura && !f && (
              <Link href={`/coran/${last.n}${last.aya > 1 ? `#v${last.aya}` : ''}`} className="qr-resume">
                <span><span className="qr-resume-k">{t('qrResume')}</span><b>{lastSura.en}{last.aya > 1 ? ` · ${t('qrVerse')} ${last.aya}` : ''}</b></span>
                <span className="qr-ar" lang="ar" dir="rtl">{lastSura.ar}</span>
              </Link>
            )}
            <div className="qr-listhead">
              <h3>{t('qrAllSuras')}</h3>
              <div className="qr-sorts" role="group" aria-label={t('qrSort')}>
                {[['order', 'qrSortOrder'], ['short', 'qrSortShort'], ['long', 'qrSortLong']].map(([k, l]) => <button key={k} type="button" className={sort === k ? 'on' : ''} aria-pressed={sort === k} onClick={() => setSort(k)}>{t(l)}</button>)}
              </div>
            </div>
            <ul className="qr-grid">
              {list.map((s) => (
                <li key={s.n}>
                  <Link href={`/coran/${s.n}`} className="qr-card">
                    <span className="qr-num">{s.n}</span>
                    <span className="qr-names"><b>{s.en}</b><span className="meta small">{s.verses ? t('qrVerses').replace('{n}', s.verses) : '—'}</span></span>
                    <span className="qr-ar qr-name-ar" lang="ar" dir="rtl">{s.ar}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {feat('quranplan') && <aside className="qr-side"><QuranPlan /></aside>}
        </div>
      )}
    </>
  );
}
