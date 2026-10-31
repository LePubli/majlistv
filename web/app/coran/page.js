'use client';
// Coran (étape 45B) : liste des 114 sourates et recherche (texte arabe, traduction, phonétique).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';

export default function QuranHome() {
  const { t, locale, call, feat } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { call('/quran/suras', {}, null).then((r) => setD(r.ok ? r.data : { ready: false, suras: [], off: true })); }, [call]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setRes(null); return undefined; }
    const h = setTimeout(() => { call(`/quran/search?q=${encodeURIComponent(s)}&lang=${locale}`, {}, null).then((r) => setRes(r.ok ? r.data.results : [])); }, 350);
    return () => clearTimeout(h);
  }, [q, call, locale]);
  if (!d) return <main className="page"><p className="meta">…</p></main>;
  const list = d.suras.filter((s) => !filter || s.en.toLowerCase().includes(filter.toLowerCase()) || s.ar.includes(filter) || String(s.n) === filter.trim());
  return (
    <main className="page qr-page">
      <section className="series-listhead"><h1>{t('qrTitle')}</h1><p className="meta">{t('qrIntro')}</p></section>
      {(d.off || !d.ready) && <p className="soon">{t('qrSoon')}</p>}
      {d.ready && (
        <>
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
          <label className="qr-search"><span className="sr-only">{t('qrFilter')}</span>
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('qrFilter')} maxLength={40} /></label>
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
        </>
      )}
    </main>
  );
}
