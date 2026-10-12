'use client';
// Studio → fiche d'une conférence : état des 4 étapes et actions (relancer, langues, résumé, suppression).
// (Modification des informations, transcription corrigée et chronologie : étapes 10.4 à 10.6.)
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { langName } from '../../../components/Transcript';
import { talkSteps, talkKind, talkProgress, sourceLabel } from '../../../lib/talkState';
import TalkEditor from '../../../components/TalkEditor';

const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const base = (c) => String(c || '').split('-')[0].toLowerCase();

export default function ManageTalk() {
  const { id } = useParams();
  const { t, call, locale } = useApp();
  const router = useRouter();
  const [x, setX] = useState(undefined);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => call('/me/talks').then((r) => { if (r.ok) setX(r.data.find((d) => d.id === id) || null); }), [call, id]);
  useEffect(() => { load(); }, [load]);

  const steps = x ? talkSteps(x) : null;
  const kind = x ? talkKind(x, steps) : null;
  useEffect(() => {
    if (kind !== 'run') return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [kind, load]);

  const act = async (path, opts, after) => {
    setMsg(null);
    const r = await call(path, opts);
    if (!r.ok) setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    else if (after) setMsg({ ok: true, text: after });
    load();
  };
  const transcribe = () => {
    if (x.source !== 'upload' && !x.rightsConfirmed && !window.confirm(t('rightsConfirm'))) return;
    act(`/talks/${id}/transcribe`, { method: 'POST', body: JSON.stringify({ rightsConfirmed: x.source !== 'upload' }) });
  };
  const addTr = (lang) => lang && act(`/talks/${id}/translations`, { method: 'POST', body: JSON.stringify({ lang }) });
  const removeTr = (lang) => act(`/talks/${id}/translations/${lang}`, { method: 'DELETE' });
  const regen = () => act(`/talks/${id}/insights/regenerate`, { method: 'POST' }, t('regenStarted'));
  const remove = async () => {
    if (!window.confirm(t('confirmDelete'))) return;
    const r = await call('/talks/' + id, { method: 'DELETE' });
    if (r.ok) router.push('/studio'); else setMsg({ ok: false, text: t('errGeneric') });
  };

  if (x === undefined) return <main className="studio-page"><p className="meta">…</p></main>;
  if (x === null) return <main className="studio-page"><p>{t('noTalks')}</p><Link href="/studio" className="link">← {t('myTalks')}</Link></main>;

  const pct = talkProgress(steps);
  const external = x.source !== 'upload';
  const canTranslate = (external ? x.rightsConfirmed : x.status === 'ready') && x.transcriptStatus !== 'unavailable';
  const trLabel = (tr) => (tr.status === 'ready' ? '✓' : tr.status === 'processing' ? `${tr.progress} %` : tr.status === 'failed' ? '⚠' : t('trWaiting'));
  const insErr = (x.insights || []).map((i) => i.error).filter(Boolean)[0];
  const Row = ({ letter, state, title, children }) => (
    <li className={`track track-${state}`}>
      <span className={`step step-${state}`}>{letter}</span>
      <div className="track-body">
        <div className="track-head"><b>{title}</b><span className="track-state">{t('step_' + state)}</span></div>
        {children}
      </div>
    </li>
  );

  return (
    <main className="studio-page">
      <Link href="/studio" className="back">← {t('myTalks')}</Link>
      <div className="manage-head">
        <span className="studio-thumb big" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined} />
        <div className="manage-title">
          <h1 className="studio-title">{x.title}</h1>
          <p className="meta">{[x.speaker, langName(base(x.language), locale), t(x.access), external ? sourceLabel(x.source) : ''].filter(Boolean).join(' · ')}</p>
          <span className={`state state-${kind}`}><i aria-hidden="true" />{t('state_' + kind)}{kind === 'run' && pct != null ? ` ${pct} %` : ''}</span>
          {kind === 'sched' && <span className="meta small"> {t('scheduledFor').replace('{d}', new Date(x.publishAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }))}</span>}
        </div>
        <div className="manage-actions">
          <Link href={`/talks/${x.id}`} className="btn ghost">{t('viewPage')}</Link>
        </div>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'}>{msg.text}</p>}

      <TalkEditor key={x.id} x={x} reload={load} t={t} call={call} />

      <h2 className="panel-title outside">{t('sectProcessing')}</h2>
      <ol className="tracks">
        <Row letter="V" state={steps.video} title={t('stepVideo')}>
          <p className="meta small">
            {external ? t('videoExternal').replace('{s}', sourceLabel(x.source))
              : steps.video === 'err' ? t('convFailed')
              : steps.video === 'run' ? `${t('converting')}${steps.videoPct != null ? ` ${steps.videoPct} %` : ''}` : t('videoReady')}
          </p>
        </Row>
        <Row letter="T" state={steps.transcript} title={t('stepTranscript')}>
          {external && !x.rightsConfirmed ? (
            <p className="meta small">{t('externalNoTranscript')} <button className="link u" onClick={transcribe}>{t('enableTranscript')}</button></p>
          ) : (
            <p className="meta small">
              {steps.transcript === 'run' && `${t('transcribing')}${steps.transcriptPct ? ` ${steps.transcriptPct} %` : ''}`}
              {steps.transcript === 'ok' && `${langName(base(x.transcriptLanguage), locale)}${x.transcriptMethod ? ` · ${t('method_' + x.transcriptMethod)}` : ''}`}
              {steps.transcript === 'err' && <>{x.transcriptError || t('transcriptFailed')} <button className="link u" onClick={transcribe}>{t('retryTr')}</button></>}
              {steps.transcript === 'wait' && t('waitVideo')}
              {steps.transcript === 'none' && t('noSpeech')}
            </p>
          )}
        </Row>
        <Row letter="S" state={steps.subs} title={t('stepSubs')}>
          {canTranslate ? (
            <div className="chips">
              {(x.translations || []).map((tr) => (
                <span key={tr.lang} className={`chip ${tr.status}`}>
                  {langName(tr.lang, locale)} · {trLabel(tr)}
                  {tr.status === 'failed' && <button className="link" onClick={() => addTr(tr.lang)}>{t('retryTr')}</button>}
                  {['ready', 'failed'].includes(tr.status) && <button className="link" aria-label={t('removeTr')} title={t('removeTr')} onClick={() => removeTr(tr.lang)}>×</button>}
                </span>
              ))}
              <select value="" onChange={(e) => addTr(e.target.value)} aria-label={t('addLang')}>
                <option value="">{t('addLang')}</option>
                {TR_LANGS.filter((c) => c !== base(x.transcriptLanguage || x.language) && !(x.translations || []).some((tr) => tr.lang === c))
                  .map((c) => <option key={c} value={c}>{langName(c, locale)}</option>)}
              </select>
            </div>
          ) : <p className="meta small">{t('subsAfter')}</p>}
        </Row>
        <Row letter="R" state={steps.summary} title={t('stepSummary')}>
          <p className="meta small">
            {(x.insights || []).length > 0 && (x.insights || []).map((i) => `${langName(i.lang, locale)} ${i.status === 'ready' ? '✓' : i.status === 'failed' ? '⚠' : '…'}`).join(' · ')}
            {insErr && <span className="error"> {insErr}</span>}
            {!(x.insights || []).length && t('summaryAfter')}
            {['ok', 'err'].includes(steps.summary) && <> <button className="link u" onClick={regen}>{t('regenInsights')}</button></>}
          </p>
        </Row>
      </ol>

      <div className="danger-zone">
        <button className="btn danger" onClick={remove}>{t('delete')}</button>
        <span className="meta small">{t('deleteHelp')}</span>
      </div>
    </main>
  );
}
