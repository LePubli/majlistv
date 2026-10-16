'use client';
// Studio → Audio et doublage (module « Doublage français », étape S1) : conférences à doubler, réglages par défaut,
// bibliothèque de voix, langue d'écoute. La génération de la piste arrive à l'étape D1a : aucun bouton ne fait semblant.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { langName } from '../../components/Transcript';
import ParamsForm from './ParamsForm';
import Voices from './Voices';
import { useDubbing, Gate, EngineNote, jobLabel, fmtDuration, fmtNum, tf } from './shared';

const TABS = ['talks', 'defaults', 'voices', 'listening'];

// File d'attente du service : demandes en attente et en cours, toutes conférences confondues.
function Queue() {
  const { t, call } = useApp();
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    let h;
    const load = () => call('/studio/dubbing/jobs').then((r) => {
      if (!r.ok) return;
      setJobs(r.data.jobs);
      clearTimeout(h);
      if (r.data.jobs.length) h = setTimeout(load, 8000);
    });
    load();
    return () => clearTimeout(h);
  }, [call]);
  if (!jobs || !jobs.length) return null;
  return (
    <section className="sd-card db-queue">
      <h2>{t('dbQueueTitle')}</h2>
      <ul>
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/studio/dubbing/${j.talkId}`}>{j.title}</Link>
            <span className="db-tag">{t(j.kind === 'full' ? 'dbKindFull' : 'dbKindPreview')}</span>
            <span className="meta">{jobLabel(j, t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Talks() {
  const { t, locale, call } = useApp();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const h = setTimeout(() => call(`/studio/dubbing/talks?q=${encodeURIComponent(q.trim())}`).then((r) => r.ok && setRows(r.data.talks)), 250);
    return () => clearTimeout(h);
  }, [q, call]);
  const lname = (l) => langName(String(l || '').split('-')[0], locale) || l || '—';
  return (
    <>
      <Queue />
      <div className="studio-tools">
        <label className="studio-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr-only">{t('search')}</span>
          <input type="search" placeholder={t('studioSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {rows && !rows.length && <p className="meta">{t('dbNoTalks')}</p>}
      {rows && rows.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table db-table">
            <thead><tr><th>{t('dbColTalk')}</th><th>{t('dbColLang')}</th><th>{t('dbColFrench')}</th><th>{t('dbColEstimate')}</th><th>{t('dbColTrack')}</th><th>{t('dbColSettings')}</th><th><span className="sr-only">{t('dbOpen')}</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.title}</strong>{r.speaker && <div className="meta small">{r.speaker}</div>}</td>
                  <td>{lname(r.lang)}</td>
                  <td>{r.phrases ? tf(t('dbPhrases'), { n: r.phrases }) : <span className="db-tag warn">{t('dbNoFrench')}</span>}</td>
                  <td>{r.estimate.seconds != null ? `≈ ${fmtDuration(r.estimate.seconds, t)}` : '—'}{r.estimate.rtf != null && <div className="meta small">{tf(t('dbRtfShort'), { r: fmtNum(r.estimate.rtf, locale) })}</div>}</td>
                  <td>{r.activeJob ? <span className="db-tag on">{jobLabel({ phase: '', ...r.activeJob }, t)}</span> : r.hasTrack ? <span className="db-tag ok">{t('dbTrackReady')}</span> : <span className="meta">—</span>}</td>
                  <td>{r.hasOverride ? <span className="db-tag on">{t('dbOwnSettings')}</span> : <span className="meta">{t('dbDefaultSettings')}</span>}</td>
                  <td className="end"><Link className="btn ghost" href={`/studio/dubbing/${r.id}`}>{t('dbOpen')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Defaults({ state, setState }) {
  const { t, call } = useApp();
  const [v, setV] = useState(state.defaults);
  const [msg, setMsg] = useState(null);
  const save = async () => {
    const r = await call('/studio/dubbing/defaults', { method: 'PUT', body: JSON.stringify({ params: v }) });
    if (r.ok) { setState(r.data); setV(r.data.defaults); }
    setMsg(r.ok ? { ok: true, text: t('dbSaved') } : { ok: false, text: r.data?.error || t('dbError') });
  };
  return (
    <section className="sd-card db-defaults">
      <h2>{t('dbDefaultsTitle')}</h2>
      <p className="meta">{t('dbDefaultsIntro')}</p>
      <ParamsForm state={state} value={v} reference={state.builtin} onChange={(p) => { setV({ ...v, ...p }); setMsg(null); }} />
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      <div className="db-actions">
        <button type="button" className="btn" onClick={save}>{t('dbSave')}</button>
        <button type="button" className="btn ghost" onClick={() => setV({ ...v, ...state.builtin })}>{t('dbBackToBuiltin')}</button>
      </div>
    </section>
  );
}

function Listening() {
  const { t, call } = useApp();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  useEffect(() => { call(`/studio/dubbing/listening?days=${days}`).then((r) => r.ok && setD(r.data)); }, [days, call]);
  const total = d ? d.totals.orig + d.totals.fr : 0;
  const pct = (x) => (total ? Math.round((x / total) * 100) : 0);
  return (
    <>
      <div className="pills" role="group" aria-label={t('dbPeriod')}>
        {[7, 30, 90].map((n) => <button key={n} type="button" className={`pill${days === n ? ' on' : ''}`} aria-pressed={days === n} onClick={() => setDays(n)}>{tf(t('dbDays'), { n })}</button>)}
      </div>
      {d && (
        <>
          <div className="db-kpis">
            <div className="sd-card"><span className="meta">{t('dbAudioOrig')}</span><strong className="db-kpi">{fmtDuration(d.totals.orig, t)}</strong><small className="meta">{pct(d.totals.orig)} %</small></div>
            <div className="sd-card"><span className="meta">{t('dbAudioFr')}</span><strong className="db-kpi">{fmtDuration(d.totals.fr, t)}</strong><small className="meta">{pct(d.totals.fr)} %</small></div>
          </div>
          <p className="meta">{t('dbListenNote')}</p>
          {d.talks.length > 0 && (
            <div className="studio-table-wrap">
              <table className="studio-table db-table">
                <thead><tr><th>{t('dbColTalk')}</th><th>{t('dbAudioOrig')}</th><th>{t('dbAudioFr')}</th></tr></thead>
                <tbody>{d.talks.map((r) => <tr key={r.id}><td>{r.title}</td><td>{fmtDuration(r.orig, t)}</td><td>{fmtDuration(r.fr, t)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function DubbingHome() {
  const { t, user } = useApp();
  const { d, setD, err, load } = useDubbing('/studio/dubbing/state');
  const [tab, setTab] = useState('talks');
  // Onglet demandé dans l'adresse (#voices…), par exemple depuis la fiche d'une conférence.
  useEffect(() => { const h = window.location.hash.slice(1); if (TABS.includes(h)) setTab(h); }, []);
  return (
    <Gate user={user} err={err}>
      <main className="studio-page db-page">
        <div className="studio-head"><h1 className="studio-title">{t('sdDub')}</h1></div>
        <EngineNote engine={d?.engine} />
        <nav className="st-tabs" aria-label={t('sdDub')}>
          {TABS.map((k) => <a key={k} href={`#${k}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setTab(k); window.history.replaceState(null, '', `#${k}`); }}>{t(`dbTab_${k}`)}</a>)}
        </nav>
        {!d ? <p className="meta">{t('dbLoading')}</p> : (
          <>
            {tab === 'talks' && <Talks />}
            {tab === 'defaults' && <Defaults state={d} setState={setD} />}
            {tab === 'voices' && <Voices state={d} reload={load} />}
            {tab === 'listening' && <Listening />}
          </>
        )}
      </main>
    </Gate>
  );
}
