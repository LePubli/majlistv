'use client';
// Studio → Tableau de bord (maquette « Studio – Tableau de bord »). Aucune donnée inventée : tout vient de l'API
// (mes conférences, statistiques des 30 derniers jours si le module est actif, abonnés de ma chaîne si le module est actif).
// Le bloc « Espace de stockage » de la maquette n'est pas repris : l'API n'expose pas encore l'occupation du stockage.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import useMyTalks from '../../components/useMyTalks';
import { hasWebModule } from '../../lib/modules';

export default function StudioDash() {
  const { t, call, feat, locale, user } = useApp();
  const { rows, loaded } = useMyTalks();
  const [stats, setStats] = useState(null);
  const [followers, setFollowers] = useState(null);
  const useStats = hasWebModule('stats') && feat('stats') && user && user.role !== 'moderator';
  const useChannels = hasWebModule('channels') && feat('channels');
  useEffect(() => { if (useStats) call('/studio/stats?days=30&audience=web').then((r) => r.ok && setStats(r.data)); }, [useStats, call]);
  useEffect(() => {
    if (useChannels) call('/studio/channels').then((r) => r.ok && setFollowers(r.data.channels.filter((c) => c.mine).reduce((a, c) => a + (c.followers || 0), 0)));
  }, [useChannels, call]);

  const nf = new Intl.NumberFormat(locale);
  const last = rows.filter((r) => r.kind === 'live').sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const lastStat = last && stats ? stats.top.find((x) => x.id === last.id) : null;
  const running = rows.filter((r) => r.kind === 'run');
  const n = (k) => rows.filter((r) => r.kind === k).length;
  const todo = [
    ['err', n('err'), t('sdTodoErr')],
    ['review', n('review'), t('sdTodoReview')],
    ['draft', n('draft') + n('sched'), t('sdTodoDraft')],
  ].filter(([, c]) => c > 0);

  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('sdDashTitle')}</h1>
        <Link href="/studio/new" className="btn">+ {t('newTalk')}</Link>
      </div>

      <div className="sd-grid">
        <section className="sd-card sd-wide" aria-label={t('sdLast')}>
          <h2>{t('sdLast')}</h2>
          {!loaded && <p className="meta" role="status">…</p>}
          {loaded && !last && <p className="meta">{t('sdLastNone')} <Link className="link u" href="/studio/new">{t('newTalk')}</Link></p>}
          {last && (
            <div className="sd-last">
              <Link href={`/studio/${last.id}`} className="sd-poster" style={last.posterUrl ? { backgroundImage: `url(${last.posterUrl})` } : undefined} aria-label={last.title} />
              <div className="sd-last-info">
                <b>{last.title}</b>
                <dl className="sd-dl">
                  <div><dt>{t('sdViews30')}</dt><dd>{lastStat ? nf.format(lastStat.views) : '—'}</dd></div>
                  <div><dt>{t('sdAvgWatch')}</dt><dd>{lastStat && lastStat.avgWatchPct != null ? `${lastStat.avgWatchPct} %` : '—'}</dd></div>
                </dl>
                <Link href={`/studio/${last.id}`} className="link u">{t('manage')}</Link>
              </div>
            </div>
          )}
        </section>

        <section className="sd-card" aria-label={t('sdChannel')}>
          <div className="sd-card-head"><h2>{t('sdChannel')}</h2><span className="meta small">{t('sdLast30')}</span></div>
          {followers !== null && (<><span className="meta">{t('sdFollowers')}</span><strong className="sd-big">{nf.format(followers)}</strong></>)}
          {useStats && (
            <dl className="sd-dl">
              <div><dt>{t('sdViews')}</dt><dd>{stats ? nf.format(stats.totals.views) : '…'}</dd></div>
              <div><dt>{t('sdHours')}</dt><dd>{stats ? nf.format(Math.round(stats.totals.minutes / 60)) : '…'}</dd></div>
            </dl>
          )}
          {!useStats && followers === null && <p className="meta">{t('sdNoData')}</p>}
          {useStats && <Link href="/studio/stats" className="link u">{t('sdMoreData')} →</Link>}
        </section>

        <section className="sd-card sd-wide" aria-label={t('sdRunning')}>
          <h2>{t('sdRunning')}</h2>
          {loaded && running.length === 0 && <p className="meta">{t('sdRunningNone')}</p>}
          {running.slice(0, 4).map((r) => (
            <div key={r.id} className="sd-job">
              <div><b>{r.title}</b><span>{r.pct != null ? `${r.pct} %` : t('state_run')}</span></div>
              <div className="sd-bar" aria-hidden="true"><i style={{ width: `${r.pct || 0}%` }} /></div>
            </div>
          ))}
          <Link href="/studio/activity" className="link u">{t('sdSeeActivity')} →</Link>
        </section>

        <section className="sd-card" aria-label={t('sdTodo')}>
          <h2>{t('sdTodo')}</h2>
          {loaded && todo.length === 0 && <p className="meta">{t('sdTodoNone')}</p>}
          {todo.map(([k, c, label]) => (
            <div key={k} className="sd-todo"><i aria-hidden="true" /><span>{label.replace('{n}', c)}</span><Link href={`/studio/contents?filter=${k}`} className="link u">{t('sdSee')}</Link></div>
          ))}
        </section>
      </div>
    </main>
  );
}
