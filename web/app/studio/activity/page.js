'use client';
// Studio → Activité — étape S3 : toutes les tâches de fond (conversion vidéo, transcription, traduction des sous-titres,
// doublage, archivage) dans l'ordre où les services vont les prendre, avec pause / reprise, priorité, pause générale des
// tâches lourdes et plage horaire. L'administrateur agit ; un organisateur voit les tâches de ses vidéos.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import useMyTalks from '../../../components/useMyTalks';
import TalkSteps from '../../../components/TalkSteps';
import { taskName } from '../../../lib/activity';
import { importLabel } from '../../../components/ImportVideoPanel';
import { Page as BmPage, Btn as BmBtn, Badge as BmBadge, Metrics as BmMetrics, Panel as BmPanel, Table as BmTable, Progress as BmProgress } from '../../../components/backoffice/Kit';

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
        {x.canceling && <small className="meta">{t('jbCanceling')}</small>}
        {x.canCancel && st !== 'failed' && <button type="button" className="btn ghost ac-btn" disabled={busy} onClick={() => onAct(x, 'cancel', {})} data-act="task-cancel">{t('jbCancel')}</button>}
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

// Journal des imports (étape Import) : qui a copié quelle vidéo, quand, depuis quelle adresse, avec quelle déclaration des droits.
function ImportJournal({ pm }) {
  const { t, locale, call } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { call('/studio/imports').then((r) => setList(r.ok ? r.data.imports : false)); }, [call]);
  if (list === false || list === null) return null; // fonction désactivée ou chargement
  const when = (x) => new Date(x).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (pm) {
    return (
      <BmPanel title={t('impJournal')} extra={<span>{list.length}</span>}>
        <p className="meta small" style={{ padding: '0 18px' }}>{t('impJournalHelp')}</p>
        <BmTable headers={[t('colTalk'), t('acColBy'), t('acColDate'), t('colState')]} empty={t('impJournalEmpty')}
          rows={list.map((m) => [<span key="t"><Link href={`/studio/${m.talkId}`} dir="auto"><b>{m.title}</b></Link><small dir="auto" style={{ display: 'block' }}>{m.sourceUrl}</small>{m.error && <small className="error" dir="auto" style={{ display: 'block' }}>{m.error}</small>}<details><summary className="meta small">{t('impDeclaration')} ({when(m.rightsConfirmedAt)})</summary><small dir="auto">{m.rightsText}</small></details></span>, m.requestedByName, when(m.createdAt), <BmBadge key="s" tone={m.status === 'failed' ? 'red' : 'blue'}>{m.active ? importLabel(m, t) : t(`impSt_${m.status}`)}</BmBadge>])} />
      </BmPanel>
    );
  }
  return (
    <section aria-labelledby="ac-imports" className="ac-section">
      <h2 id="ac-imports" className="sd-h2">{t('impJournal')} <span className="ac-count">{list.length}</span></h2>
      <p className="meta small">{t('impJournalHelp')}</p>
      {list.length === 0 && <p className="meta">{t('impJournalEmpty')}</p>}
      <ul className="ac-list">
        {list.map((m) => (
          <li key={m.id} className={`ac-task ${m.status === 'failed' ? 'failed' : ''}`}>
            <div className="ac-main">
              <Link href={`/studio/${m.talkId}`} className="ac-title" dir="auto">{m.title}</Link>
              <small className="meta" dir="auto">{m.sourceUrl}</small>
              <small className="meta">{when(m.createdAt)} · {t('impBy')} {m.requestedByName}</small>
              {m.error && <small className="error" dir="auto">{m.error}</small>}
              <details>
                <summary className="meta small">{t('impDeclaration')} ({when(m.rightsConfirmedAt)})</summary>
                <small className="meta" dir="auto">{m.rightsText}</small>
              </details>
            </div>
            <div className="ac-side"><span className={`ac-state ${m.status}`}>{m.active ? importLabel(m, t) : t(`impSt_${m.status}`)}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HeavyControls({ s, onSave, pm }) {
  const { t } = useApp();
  const [start, setStart] = useState(s.windowStart);
  const [end, setEnd] = useState(s.windowEnd);
  const [win, setWin] = useState(s.windowEnabled);
  useEffect(() => { setStart(s.windowStart); setEnd(s.windowEnd); setWin(s.windowEnabled); }, [s]);
  const dirty = win !== s.windowEnabled || Number(start) !== s.windowStart || Number(end) !== s.windowEnd;
  const state = s.pauseAll ? 'paused' : s.heavyAllowed ? 'on' : 'window';
  return (
    <section className={pm ? 'ac-heavy' : 'sd-card ac-heavy'} aria-labelledby="ac-heavy">
      {pm ? <p><span className={`ac-chip ${state}`}>{t(`acChip_${state}`)}</span></p> : (
      <div className="sd-card-head">
        <h2 id="ac-heavy">{t('acHeavy')}</h2>
        <span className={`ac-chip ${state}`}>{t(`acChip_${state}`)}</span>
      </div>)}
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
  const { t, locale, call, skin } = useApp();
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
    setMsg(r.ok ? { ok: true, text: t(what === 'cancel' ? 'jbCanceledMsg' : what === 'pause' ? (body.paused ? 'acPausedMsg' : 'acResumedMsg') : (body.priority ? 'acPrioMsg' : 'acPrioOffMsg')) } : { ok: false, text: r.data?.error || t('dbError') });
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

  if (skin === 'premium') {
    const tone = { running: 'blue', waiting: 'amber', blocked: 'amber', paused: 'amber', failed: 'red' };
    const counts = { running: by('running').length, waiting: by('waiting').length, paused: by('paused').length, failed: by('failed').length };
    const btn = (label, onClick, extra = {}) => <BmBtn primary={false} disabled={busy} onClick={onClick} {...extra}>{label}</BmBtn>;
    const taskRows = (list, st) => list.map((x, i) => {
      const link = x.link || (x.talkId ? `/studio/${x.talkId}` : null);
      return [
        <b key="n">{st === 'waiting' ? `${i + 1}. ` : ''}{taskName(x, t)}{x.priority > 0 ? ` · ${t('acPrio')}` : ''}</b>,
        link ? <Link key="l" href={link} dir="auto">{x.title}</Link> : <span key="l" dir="auto">{x.title}</span>,
        <span key="d">{date(x.createdAt)}{x.status === 'blocked' ? ` · ${t(`taskBlocked_${x.blockedBy || 'other'}`)}` : ''}{x.status === 'failed' && x.error ? <small className="error" dir="auto" style={{ display: 'block' }}>{x.error}</small> : null}</span>,
        x.status === 'running'
          ? <div key="s" style={{ minWidth: 120 }}><BmProgress value={x.progress ?? 0} /><small>{x.progress != null ? `${x.progress} %` : t('acSt_running')}</small></div>
          : <BmBadge key="s" tone={tone[x.status] || 'blue'}>{t(`acSt_${x.status}`)}</BmBadge>,
        <span key="a" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {x.canceling && <small>{t('jbCanceling')}</small>}
          {x.canCancel && x.status !== 'failed' && btn(t('jbCancel'), () => act(x, 'cancel', {}))}
          {d.canControl && x.status !== 'failed' && (x.status === 'paused'
            ? btn(t('acResume'), () => act(x, 'pause', { paused: false }))
            : (x.status !== 'running' || x.canPauseRunning) && btn(t('acPause'), () => act(x, 'pause', { paused: true })))}
          {d.canControl && x.status !== 'failed' && x.status !== 'running' && (x.priority > 0
            ? btn(t('acPrioOff'), () => act(x, 'priority', { priority: 0 }))
            : btn(t('acPrioOn'), () => act(x, 'priority', { priority: 10 })))}
        </span>,
      ];
    });
    return (
      <main className="studio-page">
        <BmPage title={t('sdActivity')} sub={t(d?.canControl ? 'acIntroAdmin' : 'acIntro')}>
          {d && <BmMetrics cols="four" items={[
            { icon: 'activity', tone: 'blue', label: t('acRunning'), value: counts.running },
            { icon: 'clock', tone: 'amber', label: t('acWaiting'), value: counts.waiting },
            { icon: 'toggle', label: t('acPaused'), value: counts.paused },
            { icon: 'alert', tone: counts.failed ? 'red' : 'green', label: t('acFailed'), value: counts.failed },
          ]} />}
          {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
          {!d && <p className="meta">{t('dbLoading')}</p>}
          {d?.canControl && <BmPanel title={t('acHeavy')}><div className="bm-form" style={{ padding: '0 18px 18px' }}><HeavyControls s={d.settings} onSave={saveSettings} pm /></div></BmPanel>}
          {d && !d.canControl && (d.settings.pauseAll || !d.settings.heavyAllowed) && <p className="sd-note">{t(d.settings.pauseAll ? 'acHeavy_paused' : 'acHeavy_window')}</p>}
          {d && SECTIONS.map(([st, key]) => {
            const list = by(st);
            if (!list.length && st !== 'running' && st !== 'waiting') return null;
            return (
              <BmPanel key={st} title={t(key)} extra={<span>{list.length}</span>}>
                <BmTable headers={[t('acColTask'), t('colTalk'), t('acColSince'), t('colState'), '']} rows={taskRows(list, st)} empty={t(st === 'running' ? 'acNoneRunning' : 'acNoneWaiting')} />
                {st === 'waiting' && list.length > 1 && <p className="meta small" style={{ padding: '0 18px 14px' }}>{t('acOrderNote')}</p>}
              </BmPanel>
            );
          })}
          <ImportJournal pm />
          <BmPanel title={t('sdActRecent')} extra={<span>{recent.length}</span>}>
            <BmTable headers={[t('colTalk'), t('acColDate'), t('colState')]} empty={loaded && recent.length === 0 ? t('sdLastNone') : null}
              rows={recent.map((r) => [<Link key="t" href={`/studio/${r.id}`} dir="auto"><b>{r.title}</b></Link>, date(r.created_at), <TalkSteps key="s" steps={r.steps} />])} />
            <p className="meta small" style={{ padding: '0 18px 14px' }}>{t('stepsLegend')}</p>
          </BmPanel>
        </BmPage>
      </main>
    );
  }

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
      <ImportJournal />
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
