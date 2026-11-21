'use client';
// Studio → Tableau de bord (maquette « Studio v2 », écran 1) — étape S3. Aucune donnée inventée : tout vient de l'API.
//   GET /me/talks        : mes vidéos (dernière publiée, choses à faire du socle)
//   GET /studio/overview : chiffres des modules (statistiques, chaînes, doublage, stockage) + production en cours
// Un bloc dont le module est absent ou désactivé n'apparaît pas.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import useMyTalks from '../../components/useMyTalks';
import { hasWebModule } from '../../lib/modules';
import { fmtBytes } from '../../lib/format';
import { taskLabel } from '../../lib/activity';
import BoKpis from '../../components/backoffice/BoKpis';
import { Page as BmPage, Btn as BmBtn, Badge as BmBadge, Metrics as BmMetrics, Panel as BmPanel, Cols as BmCols, Table as BmTable, Progress as BmProgress, AxRow as BmAxRow, I as BmI, c as bmc } from '../../components/backoffice/Kit';

const clock = (s) => { const m = Math.round((s || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

function Row({ label, value, extra }) {
  return <div><dt>{label}</dt><dd>{value}{extra}</dd></div>;
}

export default function StudioDash() {
  const { t, call, feat, locale, modUsable, skin } = useApp();
  const pm = skin === 'premium';
  const { rows, loaded } = useMyTalks();
  const [ov, setOv] = useState(null);
  useEffect(() => { call('/studio/overview?days=28').then((r) => r.ok && setOv(r.data)); }, [call]);

  const nf = new Intl.NumberFormat(locale);
  const on = (id) => hasWebModule(id) && feat(id) && modUsable(id);
  const lastRow = ov?.last ? rows.find((r) => r.id === ov.last.id) : null;
  const last = ov?.last || null;
  const st = ov?.stats; const ch = ov?.channel; const dub = ov?.dubbing; const sto = ov?.storage;
  const n = (k) => rows.filter((r) => r.kind === k).length;
  const pct = (v) => (v == null ? '—' : `${v} %`);

  // À faire : doublage (module), puis le socle (erreurs, brouillons, relecture avant mise en ligne), puis l'activité.
  const todo = [];
  if (dub) {
    const d = dub.todo;
    if (d.reviews) todo.push(['rev', t('sdTodoDubReview').replace('{n}', d.reviews), d.firstReview ? `/studio/dubbing/${d.firstReview}` : '/studio/dubbing']);
    if (d.segments) todo.push(['seg', t('sdTodoSegments').replace('{n}', d.segments), d.firstSegments ? `/studio/dubbing/${d.firstSegments}` : '/studio/dubbing']);
    if (d.requests) todo.push(['req', t('sdTodoRequests').replace('{n}', d.requests), '/studio/dubbing', true]);
  }
  if (n('err')) todo.push(['err', t('sdTodoErr').replace('{n}', n('err')), '/studio/contents?filter=err']);
  if (n('review')) todo.push(['review', t('sdTodoReview').replace('{n}', n('review')), '/studio/contents?filter=modreview']);
  if (n('draft') + n('sched')) todo.push(['draft', t('sdTodoDraft').replace('{n}', n('draft') + n('sched')), '/studio/contents?filter=draft', true]);
  if (ov?.failedTasks) todo.push(['task', t('sdTodoTasks').replace('{n}', ov.failedTasks), '/studio/activity']);

  if (pm) {
    const prod = ov?.production || [];
    return (
      <main className="studio-page">
      <BmPage title={t('sdPmTitle')} sub={t('sdPmSub')}
        actions={<>{on('editor') && <BmBtn primary={false} href="/studio/editor">{t('sdOpenEditor')}</BmBtn>}<BmBtn href="/studio/new">+ {t('newTalk')}</BmBtn></>}>
        <BmMetrics items={loaded ? [
          { icon: 'video', label: t('bqKAll'), value: rows.length },
          { icon: 'film', label: t('bqKRun'), value: n('run') },
          { icon: 'file', tone: 'amber', label: t('bqKReview'), value: n('review') },
          { icon: 'check', tone: 'green', label: t('bqKLive'), value: n('live') },
        ] : []} />
        <BmCols kind="two-main">
          <BmPanel title={t('sdRunning')} extra={ov && ov.productionCount ? `${ov.productionCount}` : ''}>
            <div className={bmc('task-cards')}>
              {ov && prod.length === 0 && <p style={{ padding: 4, color: 'var(--muted)' }}>{t('sdRunningNone')}</p>}
              {prod.slice(0, 4).map((x) => (
                <div key={`${x.queue}:${x.ref}`} className={bmc('task-progress')}>
                  <b dir="auto">{x.title}</b><small>{taskLabel(x, t)}</small>
                  <div><BmProgress value={x.status === 'running' ? x.progress || 0 : 0} /><b>{x.status === 'running' ? `${x.progress || 0} %` : ''}</b></div>
                </div>
              ))}
            </div>
            <p style={{ padding: '4px 18px 14px' }}><Link className={bmc('linkish')} href="/studio/activity">{t('sdSeeActivity')}{ov?.productionCount > 3 ? ` (${ov.productionCount})` : ''} →</Link></p>
          </BmPanel>
          <BmPanel title={t('sdTodo')} extra={todo.length ? `${todo.length}` : ''}>
            <div className={bmc('task-cards')}>
              {loaded && ov && todo.length === 0 && <p style={{ padding: 4, color: 'var(--muted)' }}>{t('sdTodoNone')}</p>}
              {todo.map(([k, label, href]) => (
                <Link key={k} href={href} className={bmc('ax-row')} style={{ textDecoration: 'none' }}>
                  <span className={bmc('square-icon')}><BmI name={k === 'err' || k === 'task' ? 'alert' : k === 'draft' ? 'edit' : 'file'} size={18} /></span>
                  <span><b>{label}</b></span><span>{t('sdSee')} →</span>
                </Link>
              ))}
            </div>
          </BmPanel>
        </BmCols>
        <BmCols kind="equal">
          <BmPanel title={t('bqPageTitle')} extra={<Link className={bmc('linkish')} href="/studio/contents">{t('sdContents')} →</Link>}>
            <BmTable empty={loaded ? t('studioEmpty') : '…'} headers={[t('pdColTalk'), t('bqDuration')]}
              rows={rows.slice(0, 5).map((r) => [<Link key="l" href={`/studio/${r.id}`} dir="auto">{r.title}</Link>, clock(r.durationSeconds)])} />
          </BmPanel>
          <BmPanel title={t('sdLast')} extra={ch && ch.channels > 0 ? `${t('sdFollowers')} : ${nf.format(ch.followers)}` : ''}>
            <div style={{ padding: '0 18px 18px' }}>
              {ov && !last && <p style={{ color: 'var(--muted)' }}>{t('sdLastNone')}</p>}
              {last && (
                <>
                  <Link href={`/studio/${last.id}`} dir="auto"><b>{last.title}</b></Link>
                  <dl className={bmc('metadata')}>
                    {st && <div><dt>{t('sdViewsSince')}</dt><dd>{st.last ? nf.format(st.last.views) : '—'}</dd></div>}
                    {st && <div><dt>{t('sdAvgWatch')}</dt><dd>{pct(st.last?.avgWatchPct)}</dd></div>}
                    {dub && <div><dt>{t('sdFrListened')}</dt><dd>{pct(dub.lastFrPct)}</dd></div>}
                    {st && <div><dt>{t('sdViews')}</dt><dd>{nf.format(st.views)}</dd></div>}
                    {st && <div><dt>{t('sdHours')}</dt><dd>{nf.format(Math.round(st.minutes / 60))} h</dd></div>}
                    {sto && <div><dt>{t('sgKpiGarage')}</dt><dd>{sto.space.usedBytes == null ? '—' : `${fmtBytes(sto.space.usedBytes, locale)} / ${fmtBytes(sto.space.capacityBytes, locale)}`}</dd></div>}
                  </dl>
                  {sto && <BmProgress value={sto.space.usedPct || 0} />}
                </>
              )}
            </div>
          </BmPanel>
        </BmCols>
        {on('editor') && (
          <Link href="/studio/editor" className={bmc('shorts-cta')}>
            <span className={bmc('shorts-cta-icon')}><BmI name="smartphone" size={34} /></span>
            <span><strong>{t('sdOpenEditor')}</strong><small>{t('sdPmSub')}</small></span>
            <span className={bmc('shorts-cta-arrow')}>→</span>
          </Link>
        )}
      </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page sd-dash">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}><Link href="/studio">{t('dbStudio')}</Link> / <span>{t('sdDash')}</span></nav>
      <div className="studio-head">
        <h1 className="studio-title">{pm ? t('sdPmTitle') : t('sdDashTitle')}</h1>
        <div className="sd-head-actions">
          {on('editor') && <Link href="/studio/editor" className="btn ghost sd-pill">{t('sdOpenEditor')}</Link>}
          <Link href="/studio/new" className="btn sd-pill">+ {t('newTalk')}</Link>
        </div>
      </div>

      {pm && <p className="bo-sub">{t('sdPmSub')}</p>}
      <BoKpis items={loaded ? [
        { icon: 'film', tone: 'blue', label: t('bqKAll'), value: rows.length },
        { icon: 'pulse', tone: 'blue', label: t('bqKRun'), value: n('run') },
        { icon: 'doc', tone: 'blue', label: t('bqKReview'), value: n('review') },
        { icon: 'check', tone: 'green', label: t('bqKLive'), value: n('live') },
      ] : []} />

      <div className="sd-row sd-row-top">
        <section className="sd-card" aria-labelledby="sd-last">
          <h2 id="sd-last">{t('sdLast')}</h2>
          {(!loaded || !ov) && <p className="meta" role="status">…</p>}
          {ov && !last && <p className="meta">{t('sdLastNone')} <Link className="link u" href="/studio/new">{t('newTalk')}</Link></p>}
          {last && (
            <>
              <div className="sd-last">
                <Link href={`/studio/${last.id}`} className="sd-poster" style={lastRow?.posterUrl ? { backgroundImage: `url(${lastRow.posterUrl})` } : undefined} aria-label={last.title}>
                  <span className="sd-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
                  {last.durationSeconds > 0 && <span className="sd-dur">{clock(last.durationSeconds)}</span>}
                </Link>
                <div className="sd-last-info">
                  <b dir="auto">{last.title}</b>
                  <dl className="sd-dl sd-lines">
                    {st && <Row label={t('sdViewsSince')} value={st.last ? nf.format(st.last.views) : '—'} />}
                    {st && <Row label={t('sdAvgWatch')} value={pct(st.last?.avgWatchPct)} />}
                    {dub && <Row label={t('sdFrListened')} value={pct(dub.lastFrPct)} />}
                    {!st && !dub && <Row label={t('sdPublishedOn')} value={new Date(last.publishedAt).toLocaleDateString(locale, { dateStyle: 'medium' })} />}
                  </dl>
                </div>
              </div>
              <div className="sd-actions">
                {on('stats') && <Link href={`/studio/stats?talk=${last.id}`} className="btn ghost sd-chipbtn">{t('sdAnalytics')}</Link>}
                {on('dubbing') && <Link href={`/studio/dubbing/${last.id}`} className="btn ghost sd-chipbtn">{t('sdDub')}</Link>}
                <Link href={`/studio/${last.id}`} className="btn ghost sd-chipbtn">{t('manage')}</Link>
                {on('editor') && last.source === 'upload' && <Link href={`/studio/editor?talk=${last.id}`} className="btn ghost sd-chipbtn">{t('sdEditInEditor')}</Link>}
              </div>
            </>
          )}
        </section>

        <section className="sd-card" aria-labelledby="sd-ch">
          <div className="sd-card-head"><h2 id="sd-ch">{t('sdChannel')}</h2><span className="meta small">{t('sdLastDays').replace('{n}', ov?.days || 28)}</span></div>
          {ch && ch.channels > 0 && (
            <div className="sd-followers">
              <span className="meta">{t('sdFollowers')}</span>
              <strong className="sd-big">{nf.format(ch.followers)}</strong>
              {ch.followersWeek > 0 && <small className="sd-up">{t('sdThisWeek').replace('{n}', nf.format(ch.followersWeek))}</small>}
            </div>
          )}
          {(st || dub) && (
            <dl className="sd-dl sd-lines">
              {st && <Row label={t('sdViews')} value={nf.format(st.views)} extra={st.viewsChangePct != null && <small className={st.viewsChangePct >= 0 ? 'sd-up' : 'sd-down'}> {st.viewsChangePct >= 0 ? '+' : ''}{st.viewsChangePct} %</small>} />}
              {st && <Row label={t('sdHours')} value={`${nf.format(Math.round(st.minutes / 60))} h`} />}
              {dub && <Row label={t('sdFrListening')} value={pct(dub.frPct)} />}
            </dl>
          )}
          {ov && !st && !dub && !(ch && ch.channels > 0) && <p className="meta">{t('sdNoData')}</p>}
          {on('stats') && <Link href="/studio/stats" className="sd-more">{t('sdMoreData')} →</Link>}
        </section>
      </div>

      <div className={`sd-row sd-row-3${sto ? '' : ' two'}`}>
        <section className="sd-card" aria-labelledby="sd-run">
          <h2 id="sd-run">{t('sdRunning')}</h2>
          {ov && ov.production.length === 0 && <p className="meta">{t('sdRunningNone')}</p>}
          {(ov?.production || []).slice(0, 3).map((x) => (
            <div key={`${x.queue}:${x.ref}`} className={`sd-job ${x.status}`}>
              <div><b dir="auto">{x.title}</b><span>{taskLabel(x, t)}</span></div>
              <div className="sd-bar" aria-hidden="true"><i style={{ width: `${x.status === 'running' ? x.progress || 0 : 0}%` }} /></div>
            </div>
          ))}
          <Link href="/studio/activity" className="sd-more">{t('sdSeeActivity')}{ov?.productionCount > 3 ? ` (${ov.productionCount})` : ''} →</Link>
        </section>

        <section className="sd-card" aria-labelledby="sd-todo">
          <h2 id="sd-todo">{t('sdTodo')}</h2>
          {loaded && ov && todo.length === 0 && <p className="meta">{t('sdTodoNone')}</p>}
          {todo.map(([k, label, href, grey]) => (
            <div key={k} className={`sd-todo${grey ? ' grey' : ''}`}><i aria-hidden="true" /><span>{label}</span><Link href={href} className="sd-see">{t('sdSee')}</Link></div>
          ))}
        </section>

        {sto && (
          <section className="sd-card" aria-labelledby="sd-sto">
            <h2 id="sd-sto">{t('sdStorage')}</h2>
            <div className="sd-meter">
              <div><span className="meta">{t('sgKpiGarage')}</span><b>{sto.space.usedBytes == null ? '—' : `${fmtBytes(sto.space.usedBytes, locale)} / ${fmtBytes(sto.space.capacityBytes, locale)}`}</b></div>
              <span className="sd-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, sto.space.usedPct || 0)}%` }} /></span>
            </div>
            <div className="sd-meter">
              <div><span className="meta">{t('sdArchivesAt').replace('{p}', t(`sgProv_${sto.provider}`))}</span><b>{fmtBytes(sto.archives.bytes, locale)}</b></div>
            </div>
            {sto.space.alert && <p className="sd-note warn">{t('sgSpaceAlert').replace('{p}', sto.space.freePct.toLocaleString(locale)).replace('{s}', sto.space.alertPct)}</p>}
            {!sto.space.alert && sto.archives.count > 0 && <p className="sd-note">{t('sdArchivedFiles').replace('{n}', sto.archives.count)}</p>}
            <Link href="/studio/settings/storage" className="sd-more">{t('sdManageStorage')} →</Link>
          </section>
        )}
      </div>
    </main>
  );
}
