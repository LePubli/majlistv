'use client';
// Studio → Activité — étape S3 : toutes les tâches de fond (conversion vidéo, transcription, traduction des sous-titres,
// doublage, archivage) dans l'ordre où les services vont les prendre, avec pause / reprise, priorité, pause générale des
// tâches lourdes et plage horaire. L'administrateur agit ; un organisateur voit les tâches de ses conférences.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import useMyTalks from '../../../components/useMyTalks';
import TalkSteps from '../../../components/TalkSteps';
import { taskName } from '../../../lib/activity';

const SECTIONS = [['running', 'acRunning'], ['waiting', 'acWaiting'], ['paused', 'acPaused'], ['failed', 'acFailed']];

function Task({ x, can, onAct, busy, pos }) {
  const { t, locale } = useApp();
  const when = new Date(x.createdAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const link = x.link || (x.talkId ? `/studio/${x.talkId}` : null);
  const st = x.status;
  return (
    <li className={`ac-task ${st}`}>
      <div className="ac-main">
        <span className="ac-kind">{pos != null && <span className="ac-pos">{pos}</span>}{taskName(x, t)}{x.priority > 0 && <span className="ac-prio">{t('acPrio')}</span>}{x.light && <span className="ac-light">{t('acLight')}</span>}</span>
        {link ? <Link href={link} className="ac-title" dir="auto">{x.title}</Link> : <span className="ac-title" dir="auto">{x.title}</span>}
        <small className="meta">{t('acSince').replace('{d}', when)}{st === 'blocked' ? ` · ${t(`taskBlocked_${x.blockedBy || 'other'}`)}` : ''}</small>
        {st === 'running' && (
          <span className="ac-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={x.progress ?? 0} aria-label={taskName(x, t)}>
            <i style={{ width: `${x.progress ?? 0}%` }} />
          </span>
        )}
        {st === 'failed' && x.error && <small className="error" dir="auto">{x.error}</small>}
      </div>
      <div className="ac-side">
        <span className={`ac-state ${st}`}>{st === 'running' && x.progress != null ? `${x.progress} %` : t(`acSt_${st}`)}</span>
        {can && st !== 'failed' && (
          <div className="ac-actions">
            {st === 'paused'
              ? <button type="button" className="btn ghost ac-btn" disabled={busy} onClick={() => onAct(x, 'pause', { paused: false })}>{t('acResume')}</button>
              : (st !== 'running' || x.canPauseRunning) && <button type="button" className="btn ghost ac-btn" disabled={busy} onClick={() => onAct(x, 'pause', { paused: true })}>{t('acPause')}</button>}
            {st !== 'running' && (x.priority > 0
              ? <button type="button" className="btn ghost ac-btn" disabled={busy} onClick={() => onAct(x, 'priority', { priority: 0 })}>{t('acPrioOff')}</button>
              : <button type="button" className="btn ghost ac-btn" disabled={busy} onClick={() => onAct(x, 'priority', { priority: 10 })}>{t('acPrioOn')}</button>)}
          </div>
        )}
      </div>
    </li>
  );
}

function HeavyControls({ s, onSave }) {
  const { t } = useApp();
  const [start, setStart] = useState(s.windowStart);
  const [end, setEnd] = useState(s.windowEnd);
  const [win, setWin] = useState(s.windowEnabled);
  useEffect(() => { setStart(s.windowStart); setEnd(s.windowEnd); setWin(s.windowEnabled); }, [s]);
  const dirty = win !== s.windowEnabled || Number(start) !== s.windowStart || Number(end) !== s.windowEnd;
  const state = s.pauseAll ? 'paused' : s.heavyAllowed ? 'on' : 'window';
  return (
    <section className="sd-card ac-heavy" aria-labelledby="ac-heavy">
      <div className="sd-card-head">
        <h2 id="ac-heavy">{t('acHeavy')}</h2>
        <span className={`ac-chip ${state}`}>{t(`acChip_${state}`)}</span>
      </div>
      {state !== 'on' && <p className="sd-note warn" role="status">{t(`acHeavy_${state}`)}</p>}
      <p className="meta">{t('acHeavyHelp')}</p>
      <div className="ac-heavy-row">
        <button type="button" className={`btn ${s.pauseAll ? '' : 'ghost'} sd-pill`} onClick={() => onSave({ pauseAll: !s.pauseAll })}>{t(s.pauseAll ? 'acResumeAll' : 'acPauseAll')}</button>
      </div>
      <div className="ac-window">
        <label className="db-check"><input type="checkbox" checked={win} onChange={(e) => setWin(e.target.checked)} /><span>{t('acWindow')}</span></label>
        <span className="ac-hours">
          <label><span className="sr-only">{t('acFrom')}</span>{t('acFrom')} <input type="number" min={0} max={23} value={start} disabled={!win} onChange={(e) => setStart(e.target.value)} /> h</label>
          <label><span className="sr-only">{t('acTo')}</span>{t('acTo')} <input type="number" min={0} max={23} value={end} disabled={!win} onChange={(e) => setEnd(e.target.value)} /> h</label>
        </span>
        <button type="button" className="btn sd-pill" disabled={!dirty} onClick={() => onSave({ windowEnabled: win, windowStart: Number(start), windowEnd: Number(end) })}>{t('dbSave')}</button>
      </div>
      <small className="meta">{t('acWindowNote')}</small>
    </section>
  );
}

export default function StudioActivity() {
  const { t, locale, call } = useApp();
  const { rows, loaded } = useMyTalks();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('/studio/activity').then((r) => { if (r.ok) setD(r.data); }), [call]);
  useEffect(() => { load(); }, [load]);
  const moving = (d?.tasks || []).some((x) => ['running', 'waiting'].includes(x.status));
  useEffect(() => {
    if (!moving) return undefined;
    const h = setInterval(load, 5000);
    return () => clearInterval(h);
  }, [moving, load]);

  const act = async (x, what, body) => {
    setBusy(true);
    const r = await call(`/studio/activity/${x.queue}/${encodeURIComponent(x.ref)}/${what}`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t(what === 'pause' ? (body.paused ? 'acPausedMsg' : 'acResumedMsg') : (body.priority ? 'acPrioMsg' : 'acPrioOffMsg')) } : { ok: false, text: r.data?.error || t('dbError') });
    load();
  };
  const saveSettings = async (body) => {
    const r = await call('/studio/activity/settings', { method: 'PUT', body: JSON.stringify(body) });
    if (r.ok) setD({ ...d, settings: r.data.settings });
    setMsg(r.ok ? { ok: true, text: t('dbSaved') } : { ok: false, text: r.data?.error || t('dbError') });
  };

  const recent = rows.filter((r) => r.kind === 'live').slice(0, 8);
  const date = (x) => new Date(x).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const by = (st) => (d?.tasks || []).filter((x) => (st === 'waiting' ? ['waiting', 'blocked'].includes(x.status) : x.status === st));

  return (
    <main className="studio-page ac-page">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}><Link href="/studio">{t('dbStudio')}</Link> / <span>{t('sdActivity')}</span></nav>
      <div className="studio-head"><h1 className="studio-title">{t('sdActivity')}</h1></div>
      <p className="meta">{t(d?.canControl ? 'acIntroAdmin' : 'acIntro')}</p>
      {d?.canControl && <HeavyControls s={d.settings} onSave={saveSettings} />}
      {!d?.canControl && d && (d.settings.pauseAll || !d.settings.heavyAllowed) && <p className="sd-note">{t(d.settings.pauseAll ? 'acHeavy_paused' : 'acHeavy_window')}</p>}
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      {!d && <p className="meta">{t('dbLoading')}</p>}
      {d && SECTIONS.map(([st, key]) => {
        const list = by(st);
        if (!list.length && st !== 'running' && st !== 'waiting') return null;
        return (
          <section key={st} aria-labelledby={`ac-${st}`} className="ac-section">
            <h2 id={`ac-${st}`} className="sd-h2">{t(key)} <span className="ac-count">{list.length}</span></h2>
            {list.length === 0 && <p className="meta">{t(st === 'running' ? 'acNoneRunning' : 'acNoneWaiting')}</p>}
            {st === 'waiting' && list.length > 1 && <p className="meta small">{t('acOrderNote')}</p>}
            <ul className="ac-list">{list.map((x, i) => <Task key={`${x.queue}:${x.ref}`} x={x} can={d.canControl} onAct={act} busy={busy} pos={st === 'waiting' ? i + 1 : null} />)}</ul>
          </section>
        );
      })}
      <section aria-labelledby="act-recent" className="ac-section">
        <h2 id="act-recent" className="sd-h2">{t('sdActRecent')}</h2>
        {loaded && recent.length === 0 && <p className="meta">{t('sdLastNone')}</p>}
        <ul className="sd-list">
          {recent.map((r) => (
            <li key={r.id} className="sd-act">
              <Link href={`/studio/${r.id}`} className="sd-act-title"><b dir="auto">{r.title}</b><small>{date(r.created_at)}</small></Link>
              <TalkSteps steps={r.steps} />
            </li>
          ))}
        </ul>
        <p className="meta small">{t('stepsLegend')}</p>
      </section>
    </main>
  );
}
