'use client';
// Mejliss Kids — page d'un univers : ses thèmes (puces), ses séries, ses vidéos (24 par page). Tout est filtré par le serveur selon l'âge de l'enfant.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from './Providers';
import { KidCard } from './KidsHome';
import { uniName, countLabel } from './KidUniverses';

export function SeriesCards({ list, t }) {
  return (
    <ul className="kd-grid ku-series">
      {list.map((s) => (
        <li key={s.id}>
          <Link href={`/kids/serie/${s.id}`} className="kd-card" data-series={s.id}>
            <span className="kd-thumb" style={s.posterUrl ? { backgroundImage: `url(${s.posterUrl})` } : undefined}><span className="dur">{t('kuEp').replace('{n}', s.episodes)}</span></span>
            <b className="kd-card-title">{s.title}</b>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function KidUniverse() {
  const { slug } = useParams();
  const sp = useSearchParams();
  const sub = sp.get('sub') || '';
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const { t, call, kid, locale } = useApp();
  const [d, setD] = useState(undefined);
  useEffect(() => {
    if (!kid) return;
    setD(undefined);
    call(`/kids/universes/${slug}?page=${page}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}`).then((r) => setD(r.ok ? r.data : null));
  }, [call, kid, slug, sub, page]);
  if (!kid) return null;
  if (d === undefined) return <main className="page kd-page ku-page" aria-busy="true" />;
  if (d === null) return <main className="page kd-page ku-page"><p><Link href="/kids?tab=watch" className="btn ghost">← {t('kuBack')}</Link></p><p className="soon">{t('kuGone')}</p></main>;
  const u = d.universe;
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const href = (n, s) => `/kids/univers/${u.slug}${s || n > 1 ? '?' : ''}${[s ? `sub=${s}` : '', n > 1 ? `page=${n}` : ''].filter(Boolean).join('&')}`;
  return (
    <main className="page kd-page ku-page" style={u.color ? { '--ku': u.color } : undefined}>
      <p><Link href="/kids?tab=watch" className="btn ghost">← {t('kuBack')}</Link></p>
      <h1 className="ku-title"><span aria-hidden="true">{u.emoji}</span> {uniName(d.sub || u, locale)}</h1>
      {d.subs.length > 0 && (
        <div className="kc-chips" role="group" aria-label={uniName(u, locale)}>
          <Link href={href(1, '')} className={!d.sub ? 'kc-chip on' : 'kc-chip'} aria-current={!d.sub ? 'page' : undefined}>{t('kuAll')}</Link>
          {d.subs.map((s) => (
            <Link key={s.id} href={href(1, s.slug)} data-sub={s.slug} className={d.sub?.id === s.id ? 'kc-chip on' : 'kc-chip'} aria-current={d.sub?.id === s.id ? 'page' : undefined}>{uniName(s, locale)} <small>({s.talks})</small></Link>
          ))}
        </div>
      )}
      {d.series.length > 0 && page === 1 && <section aria-labelledby="ku-se"><h2 id="ku-se">{t('kuSeries')}</h2><SeriesCards list={d.series} t={t} /></section>}
      <section aria-labelledby="ku-vi">
        <h2 id="ku-vi">{t('kuVideos')} <small className="meta">{countLabel(d.total, t)}</small></h2>
        {d.talks.length === 0 ? <p className="soon">{t('kuNone')}</p> : <ul className="kd-grid">{d.talks.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>}
      </section>
      {pages > 1 && (
        <nav className="ku-pager" aria-label={t('kuPage').replace('{n}', page).replace('{m}', pages)}>
          {page > 1 ? <Link className="btn ghost" href={href(page - 1, sub)} rel="prev">{t('kuLess')}</Link> : <span />}
          <span className="meta">{t('kuPage').replace('{n}', page).replace('{m}', pages)}</span>
          {page < pages ? <Link className="btn" href={href(page + 1, sub)} rel="next">{t('kuMore')}</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
