'use client';
// Fiche d'un ouvrage : couverture, présentation, éditions par langue (PDF réservé à l'Apprentissage, liens boutique), conférences et séries liées.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import { langName } from '../../../../components/Transcript';

const size = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${n / 1048576 >= 10 ? Math.round(n / 1048576) : (n / 1048576).toFixed(1).replace(/\.0$/, '')} Mo`);

export default function BookPage({ initial = null }) {
  const { id } = useParams();
  const { t, call, ready, user, locale } = useApp();
  const [b, setB] = useState(undefined);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (ready) call(`/books/${id}`).then((r) => setB(r.ok ? r.data : null)); }, [id, call, ready, user]);

  if (b === undefined) {
    if (!initial) return null;
    return <main className="page bk-page"><h1>{initial.title}</h1>{initial.author && <p className="meta">{t('bkBy').replace('{a}', initial.author)}</p>}<p className="series-desc">{initial.description}</p></main>;
  }
  if (b === null) return <main className="page"><p>{t('bkMissing')}</p><Link href="/books">{t('bkTitle')}</Link></main>;

  const download = async (lang) => {
    setBusy(lang); setMsg(null);
    const r = await call(`/books/${id}/download-link`, { method: 'POST', body: JSON.stringify({ lang }) });
    setBusy('');
    if (!r.ok) { setMsg(r.data?.code === 'daily_limit' ? t('bkErrLimit') : (r.data?.error || t('errGeneric'))); return; }
    window.location.href = `/api${r.data.url}`; // le PDF filigrané arrive en téléchargement
  };
  const hasPdf = b.editions.some((e) => e.pdf);
  const hasShop = b.editions.some((e) => e.links.length);

  return (
    <main className="page bk-page">
      <div className="bk-head">
        <span className="bk-cover big" style={b.coverUrl ? { backgroundImage: `url(${b.coverUrl})` } : undefined} aria-hidden="true">{!b.coverUrl && <span>📖</span>}</span>
        <div>
          <p className="eyebrow">{t('bkTag')}</p>
          <h1>{b.title}</h1>
          {b.author && <p className="meta">{t('bkBy').replace('{a}', b.author)}</p>}
          {b.description && <p className="series-desc bk-desc">{b.description}</p>}
        </div>
      </div>

      {msg && <p className="error" role="alert">{msg}</p>}
      <section className="bk-eds" aria-label={t('bkEditions')}>
        {b.editions.map((e) => (
          <article key={e.lang} className="bk-ed">
            <h2>{langName(e.lang, locale)}</h2>
            {e.pdf && (
              <div className="bk-pdf">
                <span className="meta small">PDF · {t('bkPages').replace('{n}', e.pdf.pages)}{e.pdf.sizeBytes ? ` · ${size(e.pdf.sizeBytes)}` : ''}</span>
                {b.canDownload ? (
                  <button type="button" className="btn" disabled={busy === e.lang} onClick={() => download(e.lang)}>{t('bkDownload')}</button>
                ) : user ? (
                  <p className="meta small">{t('bkLocked')} <Link className="link u" href="/pricing">{t('bkSeePlans')}</Link></p>
                ) : (
                  <p className="meta small">{t('bkLocked')} <Link className="link u" href="/login">{t('login')}</Link> · <Link className="link u" href="/pricing">{t('bkSeePlans')}</Link></p>
                )}
              </div>
            )}
            {e.links.length > 0 && (
              <div className="bk-shop">
                <span className="meta small">{t('bkShopLinks')}</span>
                <ul>{e.links.map((l) => <li key={l.id}><a className="btn ghost" href={l.url} target="_blank" rel="sponsored nofollow noopener noreferrer">{l.label} ↗</a></li>)}</ul>
              </div>
            )}
          </article>
        ))}
      </section>
      {hasPdf && b.canDownload && <p className="meta small">{t('bkWatermark')}</p>}
      {hasShop && <p className="meta small">{t('bkAffiliate')}</p>}

      {b.talks.length > 0 && <section className="bk-links"><h2>{t('bkLinkedTalks')}</h2><ul>{b.talks.map((x) => <li key={x.id}><Link href={`/talks/${x.id}`}>{x.title}</Link></li>)}</ul></section>}
      {b.series.length > 0 && <section className="bk-links"><h2>{t('bkLinkedSeries')}</h2><ul>{b.series.map((x) => <li key={x.id}><Link href={`/series/${x.id}`}>{x.title}</Link></li>)}</ul></section>}
    </main>
  );
}
