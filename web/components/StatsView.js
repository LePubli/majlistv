'use client';
// Tableau de bord des statistiques d'audience (étape 18), partagé par Administration (tout le site) et Studio (ses conférences).
// Chiffres anonymes uniquement. Graphiques en SVG simple (aucune bibliothèque) avec un tableau équivalent pour la lecture au clavier / lecteur d'écran.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

const RANGES = [7, 30, 90, 365];

// Variation par rapport à la période précédente.
function Delta({ cur, prev, t }) {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur > 0 ? <small className="st-delta up">{t('stNew')}</small> : null;
  const p = Math.round((100 * (cur - prev)) / prev);
  if (p === 0) return <small className="st-delta">0 %</small>;
  return <small className={'st-delta ' + (p > 0 ? 'up' : 'down')}>{p > 0 ? '▲ +' : '▼ '}{p} %</small>;
}

function Kpi({ label, value, cur, prev, t, hint }) {
  return (
    <div className="admin-card kpi st-kpi">
      <strong>{value}</strong><span>{label}</span>
      <Delta cur={cur} prev={prev} t={t} />
      {hint && <small className="meta">{hint}</small>}
    </div>
  );
}

// Histogramme par jour. data : [{ day, v }].
function Bars({ data, label, locale }) {
  const W = 720, H = 190, L = 40, B = 24, T = 8;
  const max = Math.max(1, ...data.map((d) => d.v));
  const nice = max <= 4 ? Math.ceil(max) : Math.ceil(max / 4) * 4;
  const bw = (W - L) / data.length;
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  const fmtDay = (s) => new Date(s + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const total = data.reduce((a, d) => a + d.v, 0);
  const ticks = nice <= 4 ? Array.from({ length: nice + 1 }, (_, i) => i) : [0, nice / 4, nice / 2, (3 * nice) / 4, nice];
  const xl = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  return (
    <svg className="st-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} : ${total}`} preserveAspectRatio="none">
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={L} x2={W} y1={y(tk)} y2={y(tk)} className="st-grid" />
          <text x={L - 6} y={y(tk) + 4} textAnchor="end" className="st-axis">{Math.round(tk)}</text>
        </g>
      ))}
      {data.map((d, i) => d.v > 0 && (
        <rect key={d.day} x={L + i * bw + (bw > 6 ? 1 : 0)} y={y(d.v)} width={Math.max(1, bw - (bw > 6 ? 2 : 0))} height={y(0) - y(d.v)} rx={bw > 8 ? 2 : 0} className="st-bar">
          <title>{fmtDay(d.day)} : {d.v}</title>
        </rect>
      ))}
      {xl.map((i, k) => <text key={k} x={L + i * bw + bw / 2} y={H - 6} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} className="st-axis">{fmtDay(data[i].day)}</text>)}
    </svg>
  );
}

// Liste de barres horizontales (provenance, appareils…). rows : [{ label, n }].
function HBars({ title, rows, note }) {
  if (!rows || !rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const sum = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <section className="st-card">
      <h4>{title}</h4>
      <ul className="st-hbars">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="st-hl">{r.label}</span>
            <span className="st-ht"><i style={{ width: `${Math.max(2, (100 * r.n) / max)}%` }} /></span>
            <span className="st-hv">{r.n} <small className="meta">({Math.round((100 * r.n) / sum)} %)</small></span>
          </li>
        ))}
      </ul>
      {note && <p className="meta st-note">{note}</p>}
    </section>
  );
}

export default function StatsView({ endpoint, site }) {
  const { call, t, locale } = useApp();
  const [days, setDays] = useState(30);
  const [audience, setAudience] = useState('web');
  const [talk, setTalk] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [metric, setMetric] = useState(null);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const n = (v) => (v == null ? '—' : nf.format(v));
  const pc = (v) => (v == null ? '—' : `${v} %`);

  const qs = useCallback((extra = {}) => new URLSearchParams({ days, audience, ...(talk ? { talk } : {}), ...extra }).toString(), [days, audience, talk]);
  useEffect(() => {
    let off = false;
    setErr(false);
    call(`${endpoint}?${qs()}`).then((r) => { if (off) return; if (r.ok) setD(r.data); else setErr(true); });
    return () => { off = true; };
  }, [call, endpoint, qs]);
  useEffect(() => { setMetric(null); }, [audience, talk]);

  const exportCsv = async () => {
    const res = await fetch('/api' + endpoint + '?' + qs({ format: 'csv' }), { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
    if (!res.ok) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `statistiques-${audience}-${days}j.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (err && !d) return <p className="error">{t('stLoadErr')}</p>;
  if (!d) return <p className="meta">…</p>;
  const kids = audience === 'kids';
  const T = d.totals, P = d.prev;
  const wide = site && !talk;
  const S = d.site, U = d.kids?.usage, Q = d.kids?.quiz;
  const hasData = T.views + T.plays > 0 || (S && S.totals.pageviews > 0) || (Q && Q.attempts > 0) || (U && U.minutes > 0);

  // Indicateurs : le premier est celui qui compte le plus pour la vue choisie.
  const kpis = [];
  if (kids) {
    if (wide) kpis.push([t('stActiveKids'), n(U?.activeKids), null, null], [t('stKidMinutes'), n(U?.minutes), null, null]);
    kpis.push([t('stViews'), n(T.views), T.views, P.views], [t('stPlays'), n(T.plays), T.plays, P.plays], [t('stMinutes'), n(T.minutes), T.minutes, P.minutes],
      [t('stCompletion'), pc(T.completionRate), null, null], [t('stQuizPlayed'), n(Q?.attempts), null, null]);
    if (!wide) kpis.push([t('stQuizStars'), Q?.avgStars ?? '—', null, null]);
  } else {
    if (wide && S) kpis.push([t('stVisitors'), n(S.totals.visitors), S.totals.visitors, S.prev.visitors], [t('stPageviews'), n(S.totals.pageviews), S.totals.pageviews, S.prev.pageviews]);
    kpis.push([t('stViews'), n(T.views), T.views, P.views]);
    if (!wide) kpis.push([t('stViewers'), n(T.viewers), T.viewers, P.viewers]);
    kpis.push([t('stPlays'), n(T.plays), T.plays, P.plays], [t('stMinutes'), n(T.minutes), T.minutes, P.minutes], [t('stAvgWatch'), pc(T.avgWatchPct), null, null], [t('stCompletion'), pc(T.completionRate), null, null]);
  }

  // Courbes disponibles.
  const metrics = [];
  if (!kids && wide && d.series[0]?.visitors !== undefined) metrics.push(['visitors', t('stVisitors')], ['pageviews', t('stPageviews')]);
  metrics.push(['views', t('stViews')], ['plays', t('stPlays')], ['minutes', t('stMinutes')]);
  if (kids && wide) metrics.unshift(['activeKids', t('stActiveKids')]);
  if (kids) metrics.push(['quiz', t('stQuizPlayed')]);
  const cur = metric && metrics.some((m) => m[0] === metric) ? metric : metrics[0][0];
  const curLabel = metrics.find((m) => m[0] === cur)[1];
  const data = d.series.map((s) => ({ day: s.day, v: s[cur] || 0 }));

  const FN = { views: t('stFnViews'), plays: t('stFnPlays'), q25: t('stFn25'), q50: t('stFn50'), q75: t('stFn75'), completes: t('stFnDone') };
  const maxF = Math.max(1, ...d.funnel.map((f) => f.n));
  const dim = (k, labels) => (d.dims?.[k] || []).map((r) => ({ label: labels ? (labels[r.value] || r.value) : r.value, n: wide ? (r.visitors ?? r.views) : r.views }));
  const SRC = { direct: t('stSrcDirect'), search: t('stSrcSearch'), social: t('stSrcSocial'), other: t('stSrcOther') };
  const DEV = { desktop: t('stDevDesktop'), mobile: t('stDevMobile'), tablet: t('stDevTablet') };
  const LNG = { fr: 'Français', en: 'English', ar: 'العربية', other: t('stLangOther') };

  return (
    <section className="st">
      <div className="st-bar">
        <div className="st-seg" role="group" aria-label={t('stAudience')}>
          {[['web', t('stWeb')], ['kids', t('stKids')]].map(([k, l]) => <button key={k} type="button" className={audience === k ? 'on' : ''} aria-pressed={audience === k} onClick={() => setAudience(k)}>{l}</button>)}
        </div>
        <label className="st-sel"><span className="meta">{t('stPeriod')}</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => <option key={r} value={r}>{r === 365 ? t('stYear') : t('stLastDays').replace('{n}', r)}</option>)}
          </select>
        </label>
        <label className="st-sel"><span className="meta">{t('stTalk')}</span>
          <select value={talk} onChange={(e) => setTalk(e.target.value)}>
            <option value="">{site ? t('stAllTalksSite') : t('stAllTalks')}</option>
            {(d.talks || (d.top || [])).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <button type="button" className="btn st-export" onClick={exportCsv}>{t('stExport')}</button>
      </div>
      <p className="meta st-range">{new Date(d.since + 'T12:00:00').toLocaleDateString(locale)} → {new Date(d.until + 'T12:00:00').toLocaleDateString(locale)}</p>

      {!hasData && <p className="st-empty" role="status">{t('stEmpty')}</p>}

      <div className="admin-cards st-kpis">{kpis.map(([l, v, c, p]) => <Kpi key={l} label={l} value={v} cur={c} prev={p} t={t} />)}</div>

      <section className="st-card">
        <div className="st-head">
          <h4>{curLabel} — {t('stPerDay')}</h4>
          <div className="st-seg small" role="group" aria-label={t('stMetric')}>
            {metrics.map(([k, l]) => <button key={k} type="button" className={cur === k ? 'on' : ''} aria-pressed={cur === k} onClick={() => setMetric(k)}>{l}</button>)}
          </div>
        </div>
        <Bars data={data} label={curLabel} locale={locale} />
        {cur === 'views' && !kids && !wide && <p className="meta st-note">{t('stViewersNote')}</p>}
      </section>

      <div className="st-grid2">
        <section className="st-card">
          <h4>{t('stFunnel')}</h4>
          <ul className="st-hbars">
            {d.funnel.map((f) => (
              <li key={f.key}>
                <span className="st-hl">{FN[f.key]}</span>
                <span className="st-ht"><i style={{ width: `${Math.max(f.n ? 2 : 0, (100 * f.n) / maxF)}%` }} /></span>
                <span className="st-hv">{n(f.n)}</span>
              </li>
            ))}
          </ul>
        </section>
        {!kids && <HBars title={t('stSources')} rows={dim('source', SRC)} />}
        {!kids && wide && <HBars title={t('stReferrers')} rows={dim('referrer')} />}
        {!kids && <HBars title={t('stDevices')} rows={dim('device', DEV)} />}
        {!kids && <HBars title={t('stLangs')} rows={dim('lang', LNG)} />}
        {!kids && wide && <HBars title={t('stCountries')} rows={dim('country')} />}
        <HBars title={t('stCategories')} rows={d.categories.map((c) => ({ label: c.name, n: c.plays || c.views }))} />
        <HBars title={t('stSpeakers')} rows={d.speakers.map((c) => ({ label: c.name, n: c.plays || c.views }))} />
      </div>

      {kids && (
        <div className="st-grid2">
          {Q && (
            <section className="st-card">
              <h4>{t('stKidsQuiz')}</h4>
              <dl className="st-dl">
                <div><dt>{t('stQuizPlayed')}</dt><dd>{n(Q.attempts)}</dd></div>
                <div><dt>{t('stQuizAvg')}</dt><dd>{pc(Q.avgPercent)}</dd></div>
                <div><dt>{t('stQuizStars')}</dt><dd>{Q.avgStars ?? '—'} ⭐</dd></div>
              </dl>
            </section>
          )}
          {U && (
            <section className="st-card">
              <h4>{t('stKidsUsage')}</h4>
              <dl className="st-dl">
                <div><dt>{t('stActiveKids')}</dt><dd>{n(U.activeKids)}</dd></div>
                <div><dt>{t('stKidMinutes')}</dt><dd>{n(U.minutes)}</dd></div>
                <div><dt>{t('stFamilies')}</dt><dd>{n(U.families)}</dd></div>
                <div><dt>{t('stProfiles')}</dt><dd>{n(U.profiles)}</dd></div>
              </dl>
              {U.bands.length > 0 && <HBars title={t('stBands')} rows={U.bands.map((b) => ({ label: b.band, n: b.n }))} />}
            </section>
          )}
        </div>
      )}

      <section className="st-card">
        <h4>{t('stTop')}</h4>
        {d.top.length === 0 ? <p className="meta">{t('stNoTalks')}</p> : (
          <div className="st-tablewrap">
            <table className="st-table">
              <thead><tr><th>{t('stColTalk')}</th><th>{t('stViews')}</th><th>{t('stPlays')}</th><th>{t('stMinutes')}</th><th>{t('stColWatch')}</th><th>{t('stColDone')}</th>{kids && <><th>{t('stQuizPlayed')}</th><th>{t('stQuizStars')}</th></>}</tr></thead>
              <tbody>
                {d.top.map((x) => (
                  <tr key={x.id}>
                    <td><Link href={`/talks/${x.id}`}>{x.title}</Link></td>
                    <td>{n(x.views)}</td><td>{n(x.plays)}</td><td>{n(x.minutes)}</td><td>{pc(x.avgWatchPct)}</td><td>{pc(x.completionRate)}</td>
                    {kids && <><td>{n(x.quizAttempts)}</td><td>{x.quizStars ?? '—'}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="meta st-privacy">{t('stPrivacy')}{kids ? ' ' + t('stKidsNote') : ''}</p>
    </section>
  );
}
