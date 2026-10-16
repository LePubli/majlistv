'use client';
// Studio → Contenus → [conférence] → Audio et doublage (maquette « Studio v2 », écran 3) — étape S1.
// Voix du doublage, réglages propres à la conférence, piste française (estimation), phrases à doubler.
// « Écouter 60 secondes » et « Lancer le doublage » restent désactivés jusqu'au moteur de doublage (étape D1a).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import { langName } from '../../components/Transcript';
import ParamsForm from './ParamsForm';
import { useDubbing, Gate, EngineNote, fmtDuration, fmtNum, fmtClock, fmtDay, tf } from './shared';

const PAGE = 200;

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

export default function DubbingTalk() {
  const { t, locale, user, call } = useApp();
  const { id } = useParams();
  const st = useDubbing('/studio/dubbing/state');
  const tk = useDubbing(`/studio/dubbing/talks/${id}`);
  const [edit, setEdit] = useState(null); // réglages en cours de modification
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const d = tk.d; const state = st.d;
  const value = edit || d?.effective;
  const segs = useMemo(() => (d?.segments || []).map((s) => ({ ...s, kept: /^\s*#/.test(s.text) })), [d]);
  const shown = segs.filter((s) => filter === 'all' || (filter === 'kept' ? s.kept : !s.kept));

  const change = (p) => { setEdit({ ...(edit || d.effective), ...p }); setMsg(null); };
  const save = async (params) => {
    const r = await call(`/studio/dubbing/talks/${id}`, { method: 'PUT', body: JSON.stringify({ params }) });
    if (r.ok) { tk.setD(r.data); setEdit(null); }
    setMsg(r.ok ? { ok: true, text: t('dbSaved') } : { ok: false, text: r.data?.error || t('dbError') });
  };

  if (tk.err === 'missing') return <main className="studio-page"><p className="error">{t('dbTalkMissing')}</p><Link href="/studio/dubbing" className="btn ghost">{t('dbBack')}</Link></main>;
  const lang = d ? langName(String(d.talk.transcriptLanguage || d.talk.language || '').split('-')[0], locale) || d.talk.language : '';
  const dirty = Boolean(edit);
  const own = d && Object.keys(d.override || {}).length > 0;

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
                <button type="button" className="btn ghost" disabled title={t('dbNeedsEngine')}>{t('dbListen60')}</button>
                <button type="button" className="btn" disabled title={t('dbNeedsEngine')}>{t('dbLaunch')}</button>
              </div>
            </div>
            <nav className="st-tabs" aria-label={d.talk.title}>
              <Link href={`/studio/${id}`}>{t('dbTabDetails')}</Link>
              <Link href={`/studio/dubbing/${id}`} className="on" aria-current="page">{t('sdDub')}</Link>
              <Link href="/studio/editor">{t('dbTabEditing')}</Link>
            </nav>
            <EngineNote engine={d.engine} />

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
                <div className="db-row"><span>{t('dbReview')}</span><span className="db-soon">{t('dbSoonD1b')}</span></div>
                <div className="db-row"><span>{t('dbGlossary')}</span><span className="db-soon">{t('dbSoonD1b')}</span></div>
                {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
                <div className="db-actions">
                  <button type="button" className="btn" disabled={!dirty} onClick={() => save(diff(value, state.defaults))}>{t('dbSave')}</button>
                  {dirty && <button type="button" className="btn ghost" onClick={() => { setEdit(null); setMsg(null); }}>{t('dbCancel')}</button>}
                  {own && !dirty && <button type="button" className="btn ghost" onClick={() => save(null)}>{t('dbUseDefaults')}</button>}
                </div>
              </section>
            </div>

            <section className="sd-card">
              <div className="sd-card-head"><h2>{t('dbTrackTitle')}</h2><span className="db-status">{t('dbNoTrack')}</span></div>
              {d.phrases ? (
                <p>{tf(t('dbEstimateLine'), { d: fmtDuration(d.estimate.seconds, t), s: fmtDuration(d.estimate.speechSeconds, t), r: fmtNum(d.estimate.rtf, locale) })}</p>
              ) : (
                <p>{t('dbNeedFrench')} <Link href={`/studio/${id}`}>{t('dbOpenTalk')}</Link></p>
              )}
              <small className="meta">{t('dbEstimateNote')}</small>
            </section>

            {d.phrases > 0 && (
              <section className="sd-card db-segs">
                <div className="sd-card-head">
                  <h2>{t('dbSegments')}</h2>
                  <div className="pills" role="group" aria-label={t('filterBy')}>
                    {[['all', segs.length], ['dub', segs.length - d.kept], ['kept', d.kept]].map(([k, n]) => (
                      <button key={k} type="button" className={`pill${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}>{t(`dbSeg_${k}`)} ({n})</button>
                    ))}
                  </div>
                </div>
                <div className="studio-table-wrap">
                  <table className="studio-table db-table">
                    <thead><tr><th>{t('dbColStart')}</th><th>{t('dbColText')}</th><th>{t('dbColPron')}</th><th>{t('dbColSlot')}</th><th>{t('dbColState')}</th></tr></thead>
                    <tbody>
                      {shown.slice(0, limit).map((s) => (
                        <tr key={s.idx} className={s.kept ? 'kept' : ''}>
                          <td className="db-mono">{fmtClock(s.startMs)}</td>
                          <td className="db-text">{s.kept ? s.text.replace(/^\s*#\s*/, '') : s.text}</td>
                          <td>{s.kept ? t('dbSubtitledFr') : '—'}</td>
                          <td className="db-mono">{fmtNum((s.endMs - s.startMs) / 1000, locale, 1)} s</td>
                          <td>{s.kept ? <span className="db-st kept">{t('dbStKept')}</span> : <span className="db-st todo">{t('dbStTodo')}</span>}</td>
                        </tr>
                      ))}
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
