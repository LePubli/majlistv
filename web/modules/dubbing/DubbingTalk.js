'use client';
// Studio → Contenus → [conférence] → Audio et doublage (maquette « Studio v2 », écran 3) — étapes S1 et D1a.
// Voix du doublage, réglages propres à la conférence, écoute rapide (60 s) et doublage complet (file du service dubbing/),
// piste française, état de chaque phrase (calée, accélérée, à revoir, voix d'origine).
// Étape D1b : relecture du texte français (correction, case « voix d'origine », « accepter tel quel »), validation de la relecture,
// prononciation venant du glossaire commun à tout le site.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import { langName } from '../../components/Transcript';
import { hasWebModule } from '../../lib/modules';
import ParamsForm from './ParamsForm';
import { useDubbing, Gate, EngineNote, jobLabel, fmtDuration, fmtNum, fmtClock, fmtDay, tf } from './shared';

const PAGE = 200;
const ACTIVE = ['queued', 'running'];

// Valeurs qui diffèrent des réglages par défaut : seules celles-ci sont enregistrées pour la conférence.
function diff(v, defaults) {
  const out = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined && JSON.stringify(x) !== JSON.stringify(defaults[k])) out[k] = x;
  return out;
}

function VoiceCards({ state, value, onPick }) {
  const { t, locale } = useApp();
  const base = state.voices.find((v) => v.id === value.baseVoice);
  const targets = state.voices.filter((v) => v.kind === 'target');
  const Card = ({ id, title, sub, kind }) => {
    const on = (value.targetVoice || null) === id;
    return (
      <button type="button" className={`db-vcard${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onPick(id)}>
        <span className={`db-avatar ${kind}`} aria-hidden="true" />
        <span className="db-vcard-txt"><strong>{title}</strong><small>{sub}</small></span>
        {on && <span className="db-chip">{t('dbSelected')}</span>}
      </button>
    );
  };
  return (
    <div className="db-vcards">
      {targets.map((v) => <Card key={v.id} id={v.id} kind="target" title={v.name} sub={tf(t('dbClonedSub'), { d: fmtDay(v.consentDate, locale) })} />)}
      <Card id={null} kind="base" title={base ? base.name : t('dbBaseVoice')} sub={t('dbBaseOnlySub')} />
      {!targets.length && <p className="meta small">{t('dbNoTargetYet')} <Link href="/studio/dubbing#voices">{t('dbManageVoices')}</Link></p>}
    </div>
  );
}

// Lecteur à la demande : le lien temporaire du fichier n'est demandé qu'au clic.
function Player({ jobId, which = 'mix', label }) {
  const { t, call } = useApp();
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const [archived, setArchived] = useState(null); // étape S2 : fichier envoyé aux archives (module « Stockage et archivage »)
  const open = async () => {
    const r = await call(`/studio/dubbing/jobs/${jobId}/audio?which=${which}`);
    if (r.ok) { setUrl(r.data.url); setArchived(null); setErr(''); } else if (r.data?.code === 'archived') setArchived({ id: r.data.archiveId, status: r.data.status });
    else setErr(r.data?.error || t('dbError'));
  };
  const restore = async () => {
    const r = await call(`/studio/storage/archives/${archived.id}/restore`, { method: 'POST' });
    if (r.ok) setArchived({ ...archived, status: 'restore_queued' }); else setErr(r.data?.error || t('dbError'));
  };
  if (url) return <audio className="db-audio" controls autoPlay src={url} aria-label={label} />;
  if (archived) {
    const pending = ['restore_queued', 'restoring'].includes(archived.status);
    return (
      <span className="db-archived">
        <span className="meta small">{t(pending ? 'dbArchRestoring' : 'dbArchived')}</span>
        {err && <span className="error small">{err}</span>}
        {pending ? <button type="button" className="btn ghost" onClick={open}>{t('dbArchRetryListen')}</button>
          : archived.status === 'archived' ? <button type="button" className="btn ghost" onClick={restore}>{t('sgRestore')}</button> : null}
      </span>
    );
  }
  return <>{err && <span className="error small">{err}</span>}<button type="button" className="btn ghost" onClick={open}>{label}</button></>;
}

const STATE_KEY = { fit: 'dbStFit', sped: 'dbStSped', review: 'dbStReview', kept: 'dbStKept', accepted: 'dbStAccepted' };

// Une ligne du tableau des phrases : texte modifiable, case « voix d'origine », prononciation, contrôle qualité.
function SegRow({ s, cellLen, onPatch }) {
  const { t } = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const shownText = s.keep ? s.text.replace(/^\s*#\s*/, '') : s.text;
  const run = async (body) => {
    setBusy(true); setErr('');
    const r = await onPatch(s.idx, body);
    setBusy(false);
    if (!r.ok) setErr(r.data?.error || t('dbError'));
    return r.ok;
  };
  const stt = s.keep ? 'kept' : s.r?.state === 'review' && s.accepted ? 'accepted' : s.r?.state;
  return (
    <tr className={stt === 'kept' ? 'kept' : stt === 'review' ? 'review' : ''}>
      <td className="db-mono">{fmtClock(s.startMs)}</td>
      <td className="db-text">
        {editing ? (
          <div className="db-edit">
            <textarea dir="auto" value={text} rows={3} maxLength={2000} aria-label={tf(t('dbEditAria'), { t: fmtClock(s.startMs) })} onChange={(e) => setText(e.target.value)} />
            <div className="db-actions">
              <button type="button" className="btn" disabled={busy || !text.trim() || text === s.text} onClick={async () => { if (await run({ text })) setEditing(false); }}>{t('dbSave')}</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setText(s.text); setErr(''); }}>{t('dbCancel')}</button>
            </div>
          </div>
        ) : (
          <div className="db-textcell">
            <span dir="auto">{shownText}</span>
            <button type="button" className="db-link" onClick={() => { setText(s.text); setEditing(true); }}>{t('dbEditText')}</button>
          </div>
        )}
        {err && <p className="error small" role="alert">{err}</p>}
      </td>
      <td>
        {s.keep ? t('dbSubtitledFr') : s.say?.length ? (
          <ul className="db-say" dir="auto">{s.say.map((h) => <li key={h.term}><span>{h.term}</span> → <strong>{h.say}</strong></li>)}</ul>
        ) : '—'}
      </td>
      <td className="db-mono">{cellLen(s)}</td>
      <td>
        <label className="db-check db-keep">
          <input type="checkbox" checked={s.keep} disabled={busy} onChange={(e) => run({ keepOriginal: e.target.checked })} />
          <span>{t('dbKeepOrig')}</span>
        </label>
      </td>
      <td>
        {stt ? <span className={`db-st ${stt}`}>{t(STATE_KEY[stt])}</span> : <span className="db-st todo">{t('dbStTodo')}</span>}
        {s.r?.state === 'review' && !s.keep && (
          <button type="button" className="db-link" disabled={busy} onClick={() => run({ accepted: !s.accepted })}>{t(s.accepted ? 'dbUnaccept' : 'dbAccept')}</button>
        )}
      </td>
    </tr>
  );
}

export default function DubbingTalk() {
  const { t, locale, user, call, feat } = useApp();
  const { id } = useParams();
  const st = useDubbing('/studio/dubbing/state');
  const tk = useDubbing(`/studio/dubbing/talks/${id}`);
  const [edit, setEdit] = useState(null); // réglages en cours de modification
  const [msg, setMsg] = useState(null);
  const [jobMsg, setJobMsg] = useState(null);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const d = tk.d; const state = st.d;
  const value = edit || d?.effective;
  const rep = useMemo(() => new Map((d?.report?.segments || []).map((r) => [r.idx, r])), [d]);
  const segs = useMemo(() => (d?.segments || []).map((s) => ({ ...s, r: rep.get(s.idx) })), [d, rep]);
  const toReview = (s) => !s.keep && s.r?.state === 'review' && !s.accepted;
  const shown = segs.filter((s) => filter === 'all' || (filter === 'kept' ? s.keep : filter === 'review' ? toReview(s) : !s.keep));
  const jobs = d?.jobs || [];
  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const busy = (kind) => active.some((j) => j.kind === kind);
  const lastPreview = jobs.find((j) => j.kind === 'preview' && j.status === 'done' && (j.result?.hasMix || j.result?.hasVoice));
  const lastFail = jobs.find((j) => j.status === 'failed');
  const reviewN = segs.filter(toReview).length;
  const mustReview = Boolean(d?.requireReview && !d?.review?.validated);

  // Pendant qu'une demande attend ou tourne, la page se met à jour toute seule.
  const { load } = tk;
  useEffect(() => {
    if (!active.length) return undefined;
    const h = setInterval(load, 5000);
    return () => clearInterval(h);
  }, [active.length, load]);

  const change = (p) => { setEdit({ ...(edit || d.effective), ...p }); setMsg(null); };
  const save = async (params) => {
    const r = await call(`/studio/dubbing/talks/${id}`, { method: 'PUT', body: JSON.stringify({ params }) });
    if (r.ok) { tk.setD(r.data); setEdit(null); }
    setMsg(r.ok ? { ok: true, text: t('dbSaved') } : { ok: false, text: r.data?.error || t('dbError') });
  };
  const launch = async (kind) => {
    if (edit && !window.confirm(t('dbUnsavedLaunch'))) return;
    const r = await call(`/studio/dubbing/talks/${id}/jobs`, { method: 'POST', body: JSON.stringify({ kind }) });
    setJobMsg(r.ok ? { ok: true, text: t(kind === 'full' ? 'dbFullQueued' : 'dbPreviewQueued') } : { ok: false, text: r.data?.error || t('dbError') });
    load();
  };
  // Une phrase modifiée : on remplace la ligne et les compteurs sans tout recharger.
  const patchSeg = async (idx, body) => {
    const r = await call(`/studio/dubbing/talks/${id}/segments/${idx}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (r.ok) {
      const { segment, review, ...sp } = r.data;
      tk.setD((cur) => ({ ...cur, ...sp, review, segments: cur.segments.map((x) => (x.idx === idx ? segment : x)) }));
    }
    return r;
  };
  const validate = async (validated) => {
    const r = await call(`/studio/dubbing/talks/${id}/review`, { method: 'POST', body: JSON.stringify({ validated }) });
    if (r.ok) tk.setD((cur) => ({ ...cur, review: r.data.review }));
    setMsg(r.ok ? { ok: true, text: t(validated ? 'dbReviewDone' : 'dbReviewUndone') } : { ok: false, text: r.data?.error || t('dbError') });
  };
  const cancel = async (j) => {
    const r = await call(`/studio/dubbing/jobs/${j.id}/cancel`, { method: 'POST' });
    setJobMsg(r.ok ? { ok: true, text: t('dbCancelled') } : { ok: false, text: r.data?.error || t('dbError') });
    load();
  };

  if (tk.err === 'missing') return <main className="studio-page"><p className="error">{t('dbTalkMissing')}</p><Link href="/studio/dubbing" className="btn ghost">{t('dbBack')}</Link></main>;
  const lang = d ? langName(String(d.talk.transcriptLanguage || d.talk.language || '').split('-')[0], locale) || d.talk.language : '';
  const dirty = Boolean(edit);
  const own = d && Object.keys(d.override || {}).length > 0;
  const fullDone = d?.track ? jobs.find((j) => j.id === d.track.jobId) : null;
  const status = active.find((j) => j.kind === 'full') ? jobLabel(active.find((j) => j.kind === 'full'), t)
    : d?.track ? tf(t('dbTrackDone'), { d: fmtDuration(d.track.durationS, t), n: fullDone?.result?.summary?.review ?? 0 }) : t('dbNoTrack');
  const cellLen = (s) => {
    const slot = `${fmtNum((s.endMs - s.startMs) / 1000, locale, 1)} s`;
    return s.r?.speedup ? `${slot} · ×${Number(s.r.speedup).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : slot;
  };

  return (
    <Gate user={user} err={st.err || (tk.err === 'missing' ? null : tk.err)}>
      <main className="studio-page db-page">
        {!d || !state ? <p className="meta">{t('dbLoading')}</p> : (
          <>
            <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}>
              <Link href="/studio">{t('dbStudio')}</Link> / <Link href="/studio/contents">{t('sdContents')}</Link> / <span>{d.talk.title}</span>
            </nav>
            <div className="studio-head">
              <h1 className="studio-title">{t('sdDub')}</h1>
              <div className="db-head-actions">
                <button type="button" className="btn ghost" disabled={!d.phrases || busy('preview')} onClick={() => launch('preview')}>{busy('preview') ? t('dbJobQueued') : t('dbListen60')}</button>
                <button type="button" className="btn" disabled={!d.phrases || busy('full') || mustReview} title={mustReview ? t('dbNeedReview') : undefined} onClick={() => launch('full')}>{busy('full') ? t('dbJobQueuedFull') : t('dbLaunch')}</button>
              </div>
            </div>
            <nav className="st-tabs" aria-label={d.talk.title}>
              <Link href={`/studio/${id}`}>{t('dbTabDetails')}</Link>
              <Link href={`/studio/dubbing/${id}`} className="on" aria-current="page">{t('sdDub')}</Link>
              {hasWebModule('editor') && feat('editor') && d.talk?.source === 'upload' && <Link href={`/studio/editor?talk=${id}`}>{t('dbTabEditing')}</Link>}
            </nav>
            <EngineNote engine={d.engine} />
            {mustReview && d.phrases > 0 && <p className="db-note" role="note">{t('dbNeedReview')}</p>}
            {jobMsg && <p className={jobMsg.ok ? 'ok-msg' : 'error'} role="status">{jobMsg.text}</p>}

            <div className="db-grid">
              <section className="sd-card">
                <h2>{t('dbVoiceTitle')}</h2>
                <VoiceCards state={state} value={value} onPick={(v) => change({ targetVoice: v })} />
                <label className="fld"><span>{t('dbBaseVoice')}</span>
                  <select value={value.baseVoice || ''} onChange={(e) => change({ baseVoice: e.target.value })}>
                    {state.voices.filter((v) => v.kind === 'base').map((v) => <option key={v.id} value={v.id}>{v.name}{v.gender ? ` · ${t('dbG_' + v.gender)}` : ''}</option>)}
                  </select>
                </label>
              </section>

              <section className="sd-card">
                <div className="sd-card-head"><h2>{t('dbSettingsTitle')}</h2>{own && <span className="db-tag on">{t('dbOwnSettings')}</span>}</div>
                <div className="db-row"><span className="meta">{t('dbOrigLang')}</span><strong>{lang || '—'}</strong></div>
                <ParamsForm state={state} value={value} reference={state.defaults} onChange={change} showVoices={false} />
                <div className="db-row db-review">
                  <span>{t('dbReview')}{!d.requireReview && <small className="meta"> · {t('dbReviewOptional')}</small>}</span>
                  {d.review.validated ? (
                    <span className="db-review-state">
                      <span className="db-tag ok">{tf(t('dbReviewedBy'), { n: d.review.reviewedBy || '—', d: new Date(d.review.reviewedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
                      <button type="button" className="db-link" onClick={() => validate(false)}>{t('dbReviewUndo')}</button>
                    </span>
                  ) : (
                    <span className="db-review-state">
                      {d.review.stale && <span className="db-tag warn">{t('dbReviewStale')}</span>}
                      <button type="button" className="btn" disabled={!d.phrases} onClick={() => validate(true)}>{t('dbReviewValidate')}</button>
                    </span>
                  )}
                </div>
                <div className="db-row"><span>{t('dbGlossary')}</span><Link href="/studio/dubbing#glossary">{tf(t('dbGlossaryOpen'), { n: d.glossaryCount })}</Link></div>
                {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
                <div className="db-actions">
                  <button type="button" className="btn" disabled={!dirty} onClick={() => save(diff(value, state.defaults))}>{t('dbSave')}</button>
                  {dirty && <button type="button" className="btn ghost" onClick={() => { setEdit(null); setMsg(null); }}>{t('dbCancel')}</button>}
                  {own && !dirty && <button type="button" className="btn ghost" onClick={() => save(null)}>{t('dbUseDefaults')}</button>}
                </div>
              </section>
            </div>

            <section className="sd-card db-track">
              <div className="sd-card-head"><h2>{t('dbTrackTitle')}</h2><span className="db-status">{status}</span></div>
              {active.map((j) => (
                <div key={j.id} className="db-job">
                  <div className="db-job-top"><strong>{t(j.kind === 'full' ? 'dbKindFull' : 'dbKindPreview')}</strong><span>{jobLabel(j, t)}</span></div>
                  <div className="db-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={j.progress}><i style={{ width: `${j.progress}%` }} /></div>
                  <button type="button" className="btn ghost" onClick={() => cancel(j)} disabled={j.cancelRequested}>{j.cancelRequested ? t('dbCancelling') : t('dbCancelJob')}</button>
                </div>
              ))}
              {d.track && fullDone && (
                <div className="db-listen">
                  <span>{tf(t('dbTrackOf'), { d: new Date(d.track.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
                  <Player jobId={fullDone.id} which="mix" label={d.track.hasMix ? t('dbPlayMix') : t('dbPlayVoice')} />
                  {d.track.hasMix && <Player jobId={fullDone.id} which="voice" label={t('dbPlayVoiceOnly')} />}
                </div>
              )}
              {lastPreview && (
                <div className="db-listen">
                  <span>{tf(t('dbLastPreview'), { d: new Date(lastPreview.finishedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }), r: fmtNum(lastPreview.result?.rtf, locale) })}</span>
                  <Player key={lastPreview.id} jobId={lastPreview.id} which="mix" label={t('dbPlayPreview')} />
                </div>
              )}
              {lastFail && !active.length && <p className="error small">{tf(t('dbLastFail'), { e: lastFail.error || '' })}</p>}
              {d.phrases ? (
                <p>{tf(t('dbEstimateFull'), { d: fmtDuration(d.estimate.seconds, t), s: fmtDuration(d.estimate.speechSeconds, t), r: fmtNum(d.estimate.rtf, locale) })}</p>
              ) : (
                <p>{t('dbNeedFrench')} <Link href={`/studio/${id}`}>{t('dbOpenTalk')}</Link></p>
              )}
              <small className="meta">{d.estimate.measured ? t('dbEstimateMeasured') : t('dbEstimateNote')}</small>
              {d.talk.source && d.talk.source !== 'upload' && <small className="meta">{t('dbExternalNote')}</small>}
              {d.requests > 0 && <p className="db-req">{tf(t(d.requests === 1 ? 'dbReqStudio1' : 'dbReqStudio'), { n: d.requests })}</p>}
            </section>

            {d.phrases > 0 && (
              <section className="sd-card db-segs">
                <div className="sd-card-head">
                  <h2>{t('dbSegments')}</h2>
                  <div className="pills" role="group" aria-label={t('filterBy')}>
                    {[['all', segs.length], ['dub', segs.length - d.kept], ...(d.report ? [['review', reviewN]] : []), ['kept', d.kept]].map(([k, n]) => (
                      <button key={k} type="button" className={`pill${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}>{t(`dbSeg_${k}`)} ({n})</button>
                    ))}
                  </div>
                </div>
                {d.report && <p className="meta small">{t(d.report.kind === 'full' ? 'dbReportFull' : 'dbReportPreview')}</p>}
                <div className="studio-table-wrap">
                  <table className="studio-table db-table">
                    <thead><tr><th>{t('dbColStart')}</th><th>{t('dbColText')}</th><th>{t('dbColPron')}</th><th>{t('dbColSlot')}</th><th>{t('dbColKeep')}</th><th>{t('dbColState')}</th></tr></thead>
                    <tbody>
                      {shown.slice(0, limit).map((s) => <SegRow key={s.idx} s={s} cellLen={cellLen} onPatch={patchSeg} />)}
                    </tbody>
                  </table>
                </div>
                {shown.length > limit && <button type="button" className="btn ghost" onClick={() => setLimit(limit + PAGE)}>{tf(t('dbShowMore'), { n: shown.length - limit })}</button>}
                <small className="meta">{t('dbKeptHelp')}</small>
              </section>
            )}
            <p className="db-mention">{t('dbMention')}</p>
          </>
        )}
      </main>
    </Gate>
  );
}
