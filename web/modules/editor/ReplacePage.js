'use client';
// Studio → Éditeur → « Remplacer la vidéo publiée » (étape E4b, maquette « Studio v2 », écran 5).
//   Avant / après (durée, son, habillage), ce qui sera mis à jour (sous-titres, recherche, notes et reprises, quiz à revoir, version
//   française), « Conserver mes corrections », original protégé (gardé N jours puis archivé), étapes du remplacement, puis suivi en direct.
//   Choix d'Epok (19/10) : la bascule a lieu dès que la nouvelle vidéo est prête ; sous-titres, quiz et notes sont recalés à cet instant,
//   la nouvelle transcription, les traductions et les résumés suivent en arrière-plan.
//   Après la bascule : « Restaurer l'original » (annule le dernier remplacement, même après l'archivage de l'original).
// Adresse : /studio/editor/<projet>/replace?render=<rendu final>
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { fmtBytes } from '../../lib/format';

export function durTxt(s, t) {
  const v = Math.round(Math.abs(Number(s) || 0));
  const h = Math.floor(v / 3600); const m = Math.floor((v % 3600) / 60); const sec = v % 60;
  if (h) return `${h} ${t('mtxUnitH')} ${String(m).padStart(2, '0')} ${t('mtxUnitMin')}`;
  if (m) return `${m} ${t('mtxUnitMin')} ${String(sec).padStart(2, '0')} ${t('mtxUnitS')}`;
  return `${sec} ${t('mtxUnitS')}`;
}

const DRESS_KEYS = { title: 'mtxDressTitle', banner: 'mtxDressBanner', logo: 'mtxDressLogo', music: 'mtxDressMusic', cards: 'mtxDressCards', transitions: 'mtxDressTransitions', subs: 'mtxDressSubs' };

// Étapes affichées : état de chacune selon l'opération en cours ou la dernière faite.
function steps(rep, keep, t) {
  const st = (done, cur) => (done ? 'done' : cur ? 'cur' : 'todo');
  if (rep?.kind === 'restore') {
    const sw = rep.status === 'switched';
    return [
      ['mtxStepOriginal', st(rep.status !== 'waiting_original', rep.status === 'waiting_original')],
      ['mtxStepPrepare', st(sw || rep.status === 'converted', rep.status === 'converting'), rep.status === 'converting' && rep.progress ? `${rep.progress} %` : null],
      ['mtxStepSwitchBack', st(sw, rep.status === 'converted')],
    ].map(([k, s, x]) => ({ k, s, x }));
  }
  const sw = rep?.status === 'switched' || rep?.status === 'restored';
  const f = rep?.follow;
  const redo = rep ? !rep.keepCorrections : !keep;
  return [
    { k: 'mtxStepRender', s: 'done' },
    { k: 'mtxStepPrepare', s: st(sw || rep?.status === 'converted', rep?.status === 'converting'), x: rep?.status === 'converting' && rep.progress ? `${rep.progress} %` : null },
    { k: 'mtxStepSwitch', s: st(sw, rep?.status === 'converted') },
    { k: redo ? 'mtxStepTranscript' : 'mtxStepTranscriptKeep', s: st(sw && f !== 'transcript', sw && f === 'transcript') },
    { k: redo ? 'mtxStepInsights' : 'mtxStepInsightsKeep', s: st(sw && f === 'done', sw && f === 'translations') },
  ].map((x) => ({ ...x, label: t(x.k) }));
}

export default function ReplacePage({ projectId }) {
  const { t, call, locale } = useApp();
  const [renderId, setRenderId] = useState(null);
  const [pv, setPv] = useState(null);
  const [talkId, setTalkId] = useState(null);
  const [reps, setReps] = useState(null);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('render');
    if (r && /^[0-9a-f-]{36}$/i.test(r)) setRenderId(r);
    else {
      // Sans rendu choisi : on suit l'état des remplacements de la conférence du projet.
      call(`/studio/editor/projects/${projectId}`).then((x) => { if (x.ok) setTalkId(x.data.project.talk.id); else setMsg({ ok: false, text: x.data?.error || t('dbError') }); });
    }
  }, [call, projectId, t]);
  const loadPv = useCallback(async () => {
    if (!renderId) return;
    const r = await call(`/studio/editor/renders/${renderId}/replace-preview`);
    if (r.ok) { setPv(r.data); setTalkId(r.data.talk.id); setReps(r.data.replacements); } else setMsg({ ok: false, text: r.data?.error || t('dbError') });
  }, [call, renderId, t]);
  useEffect(() => { loadPv(); }, [loadPv]);
  const loadReps = useCallback(async () => {
    if (!talkId) return;
    const r = await call(`/studio/editor/talks/${talkId}/replacements`);
    if (r.ok) setReps(r.data);
  }, [call, talkId]);
  useEffect(() => { if (!renderId) loadReps(); }, [renderId, loadReps]);
  // Suivi en direct tant qu'une opération est en cours (préparation, bascule, transcription, traductions).
  const live = reps?.active || (reps?.history?.[0]?.status === 'switched' && ['transcript', 'translations'].includes(reps.history[0].follow));
  useEffect(() => {
    if (!live) return undefined;
    const h = setTimeout(() => { loadReps(); }, 3000);
    return () => clearTimeout(h);
  }, [live, reps, loadReps]);

  const start = async () => {
    if (!window.confirm(t('mtxConfirm'))) return;
    setBusy(true); setMsg(null);
    const r = await call(`/studio/editor/renders/${renderId}/replace`, { method: 'POST', body: JSON.stringify({ keepCorrections: keep }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    setMsg({ ok: true, text: t('mtxStarted') });
    loadReps();
  };
  const cancel = async (rep) => {
    const r = await call(`/studio/editor/replacements/${rep.id}/cancel`, { method: 'POST', body: '{}' });
    setMsg(r.ok ? { ok: true, text: t('mtxCanceled') } : { ok: false, text: r.data?.error || t('dbError') });
    loadReps();
  };
  const restore = async (rep) => {
    if (!window.confirm(t('mtxRestoreConfirm'))) return;
    setBusy(true);
    const r = await call(`/studio/editor/replacements/${rep.id}/restore`, { method: 'POST', body: '{}' });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t(r.data.fromArchive ? 'mtxRestoreArchive' : 'mtxRestoreStarted') } : { ok: false, text: r.data?.error || t('dbError') });
    loadReps();
  };

  const day = (x) => new Date(x).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const active = reps?.active || null;
  const last = reps?.history?.find((r) => ['switched', 'restored'].includes(r.status)) || null;
  const shown = active || (last && ['transcript', 'translations'].includes(last.follow) ? last : null);
  const im = pv?.impact;
  const before = pv?.talk?.duration; const after = pv?.render?.duration;
  const diff = before && after ? after - before : 0;
  const canStart = pv && !pv.blocked && !active;

  return (
    <main className="studio-page mx-page">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}>
        <Link href="/studio">{t('dbStudio')}</Link> / <Link href={`/studio/editor/${projectId}`}>{t('sdEditor')}</Link> / <span>{t('mtxTitle')}</span>
      </nav>
      <div className="studio-head"><h1 className="studio-title">{t('mtxTitle')}</h1></div>
      <p className="mx-lead">{t('mtxLead')}</p>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {!pv && renderId && !msg && <p className="meta">{t('dbLoading')}</p>}
      {!renderId && <p className="sd-note">{t('mtxNoRender')}</p>}

      {pv && (
        <div className="mx-compare">
          <section className="sd-card mx-side" aria-labelledby="mx-before">
            <h2 id="mx-before" className="mx-cap">{t('mtxBefore')}</h2>
            <div className="mx-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {pv.talk.posterUrl ? <img src={pv.talk.posterUrl} alt="" /> : <span className="mx-ph" aria-hidden="true" />}
            </div>
            <dl className="mx-rows">
              <div><dt>{t('mtxDuration')}</dt><dd>{durTxt(before, t)}</dd></div>
              <div><dt>{t('mtxAudio')}</dt><dd>{t('mtxAudioOrig')}</dd></div>
              <div><dt>{t('mtxDress')}</dt><dd>{t('mtxDressNone')}</dd></div>
            </dl>
          </section>
          <section className="sd-card mx-side mx-after" aria-labelledby="mx-after">
            <h2 id="mx-after" className="mx-cap">{t('mtxAfter')}</h2>
            <div className="mx-media">
              {pv.render.url ? <video src={pv.render.url} poster={pv.talk.posterUrl || undefined} controls playsInline preload="metadata" aria-label={t('mtrVideo')} />
                : <span className="mx-ph" aria-hidden="true" />}
              {pv.talk.speaker && <span className="mx-banner" dir="auto">{pv.talk.speaker}</span>}
            </div>
            <dl className="mx-rows">
              <div><dt>{t('mtxDuration')}</dt><dd>{durTxt(after, t)}{diff ? <span className="mx-diff"> ({diff < 0 ? '−' : '+'}{durTxt(diff, t)})</span> : null}</dd></div>
              <div><dt>{t('mtxAudio')}</dt><dd>{t(pv.render.dub ? 'mtxAudioOrigFr' : 'mtxAudioOrig')}</dd></div>
              <div><dt>{t('mtxDress')}</dt><dd>{pv.render.dress.length ? pv.render.dress.map((k) => t(DRESS_KEYS[k])).join(', ') : t('mtxDressNone')}</dd></div>
            </dl>
          </section>
        </div>
      )}
      {pv?.blocked && <p className="sd-note warn" role="alert">{pv.blocked.error}</p>}
      {pv && !pv.render.upToDate && !pv.blocked && <p className="sd-note">{t('mtxOutdated')}</p>}
      {pv?.render.dub && <p className="sd-note warn">{t('mtxDubInside')}</p>}

      {pv && !shown && (
        <section className="sd-card" aria-labelledby="mx-what">
          <h2 id="mx-what">{t('mtxWhat')}</h2>
          <ul className="mx-checks">
            <li><span className="mx-tick" aria-hidden="true">✓</span><span><b>{t('mtxWhatTranscript')}</b><small className="meta">{t(keep ? 'mtxWhatTranscriptKeep' : 'mtxWhatTranscriptRedo')}{im.langs.length ? ` · ${im.langs.map((l) => l.toUpperCase()).join(', ')}` : ''}</small></span></li>
            <li><span className="mx-tick" aria-hidden="true">✓</span><span><b>{t('mtxWhatSearch')}</b><small className="meta">{t('mtxWhatSearchHelp')}</small></span></li>
            <li><span className="mx-tick" aria-hidden="true">✓</span><span><b>{t('mtxWhatNotes')}</b><small className="meta">{t('mtxWhatNotesHelp').replace('{n}', im.notes).replace('{p}', im.progress)}</small></span></li>
            {im.dubTrack && <li className="mx-warn"><span className="mx-bang" aria-hidden="true">!</span><span><b>{t('mtxWhatDub')}</b><small className="meta">{t('mtxWhatDubHelp')}</small></span></li>}
            {im.quiz.review + im.practiceReview > 0 && (
              <li className="mx-warn" data-quiz-review={im.quiz.review}>
                <span className="mx-bang" aria-hidden="true">!</span>
                <span><b>{t('mtxQuizReview').replace('{n}', im.quiz.review).replace('{t}', im.quiz.total)}</b><small className="meta">{t('mtxQuizReviewHelp')}{im.practiceReview ? ` ${t('mtxPracticeReview').replace('{n}', im.practiceReview)}` : ''}</small></span>
                <Link href="/studio/quiz" className="mx-link">{t('mtxSeeQuestions')}</Link>
              </li>
            )}
          </ul>
          <label className="mx-keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} disabled={Boolean(active)} data-act="keep" />
            <span>{t('mtxKeep')}<small className="meta">{t('mtxKeepHelp')}</small></span>
          </label>
        </section>
      )}

      <div className="mx-two">
        {pv && (
          <section className="sd-card" aria-labelledby="mx-orig">
            <h2 id="mx-orig">{t('mtxOriginal')}</h2>
            <p className="meta">{t(pv.original.archiving ? 'mtxOriginalHelp' : 'mtxOriginalHelpNoArchive').replace('{n}', pv.original.keepDays)}</p>
            {pv.original.bytes != null && <p className="mx-row"><span>{t('mtxSpace').replace('{n}', pv.original.keepDays)}</span><b>+ {fmtBytes(pv.original.bytes, locale)}</b></p>}
          </section>
        )}
        <section className="sd-card" aria-labelledby="mx-steps">
          <h2 id="mx-steps">{t(shown?.kind === 'restore' ? 'mtxStepsRestore' : 'mtxSteps')}</h2>
          <ol className="mx-steps">
            {steps(shown, keep, t).map((s) => (
              <li key={s.k} className={`st-${s.s}`} data-step={s.k} data-state={s.s}><span className="mx-dot" aria-hidden="true" />{t(s.k)}{s.x ? <small className="meta"> · {s.x}</small> : null}</li>
            ))}
          </ol>
          {shown?.status === 'waiting_original' && <p className="meta small">{t('mtxWaitingArchive')}</p>}
          {shown && ['converting', 'waiting_original'].includes(shown.status) && !shown.cancelRequested && (
            <button type="button" className="btn ghost sd-pill" onClick={() => cancel(shown)} data-act="cancel">{t('mtxCancel')}</button>
          )}
        </section>
      </div>

      {last && (
        <section className="sd-card mx-done" aria-labelledby="mx-last" data-status={last.status} data-kind={last.kind}>
          <h2 id="mx-last">{t(last.kind === 'restore' ? 'mtxDoneRestore' : last.status === 'restored' ? 'mtxDoneUndone' : 'mtxDone').replace('{d}', day(last.switchedAt))}</h2>
          {last.kind === 'replace' && last.report && (
            <p className="meta">{t('mtxReport').replace('{s}', last.report.segmentsKept ?? 0).replace('{q}', last.report.quizReview ?? 0).replace('{n}', last.report.notes ?? 0).replace('{p}', last.report.progress ?? 0)}</p>
          )}
          {reps?.restorable && reps.restorable.id === last.id && (
            <>
              <p className="meta">{t(last.originalState === 'archived' ? 'mtxOriginalArchived' : 'mtxOriginalKept').replace('{d}', last.keepUntil ? day(last.keepUntil) : '—')}</p>
              <button type="button" className="btn ghost sd-pill" onClick={() => restore(last)} disabled={busy || Boolean(active)} data-act="restore">{t('mtxRestore')}</button>
            </>
          )}
        </section>
      )}

      <div className="mx-actions">
        {pv && <button type="button" className="btn sd-pill" onClick={start} disabled={!canStart || busy} data-act="replace">{busy ? t('mtrStarting') : t('mtxGo')}</button>}
        <Link href={`/studio/editor/${projectId}`} className="btn ghost sd-pill">{t('mtxBack')}</Link>
        {pv && <small className="meta">{t('mtxGoNote')}</small>}
      </div>
    </main>
  );
}
