'use client';
// Module « Doublage français », étape D3c — panneau « Intervenants » de Studio → Audio et doublage :
// détection des voix (service de transcription), nom, voix de base / voix cible et hauteur de chaque intervenant, propositions de voix,
// attribution d'une plage de phrases, écoute rapide d'une hauteur.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtDuration, fmtNum, tf } from './shared';

export const SPK_COLORS = ['#e6a739', '#5aa9e6', '#7bd389', '#e6739f', '#b08cff', '#4fd1c5', '#f08a5d', '#c0c46c', '#9aa5b1', '#d4a5ff'];
export const spkColor = (n) => SPK_COLORS[(Math.max(1, n) - 1) % SPK_COLORS.length];
export const fmtPitch = (v, locale, t) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), locale, 1)} ${t('dbUnitSemi')}`;

// « 12:30 » ou « 1:02:30 » ou « 90 » (secondes) → millisecondes ; null si invalide.
export function parseClock(text) {
  const s = String(text || '').trim();
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  if (parts.slice(1).some((x) => x > 59)) return null;
  return parts.reduce((acc, x) => acc * 60 + x, 0) * 1000;
}

function SpeakerCard({ s, d, state, audio, segs, onSave }) {
  const { t, locale, call } = useApp();
  const eff = d.effective;
  const voices = state.voices;
  const bases = voices.filter((v) => v.kind === 'base');
  const targets = voices.filter((v) => v.kind === 'target');
  const own = Boolean(s.baseVoice || s.targetVoice);
  const nameOf = (id) => voices.find((v) => v.id === id)?.name;
  const baseName = nameOf(own ? (s.baseVoice || eff.baseVoice) : eff.baseVoice);
  const targetName = own ? nameOf(s.targetVoice) : nameOf(eff.targetVoice);
  const pitchEff = s.pitch != null ? Number(s.pitch) : Number(eff.pitch ?? 0);
  const [label, setLabel] = useState(s.label);
  const [pv, setPv] = useState(pitchEff);
  const [err, setErr] = useState('');
  const timer = useRef(null);
  const audioEl = useRef(null);
  const [url, setUrl] = useState(null);
  useEffect(() => { setLabel(s.label); }, [s.label]);
  useEffect(() => { setPv(pitchEff); }, [pitchEff]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async (body) => { setErr(''); const r = await onSave(s.n, body); if (!r.ok) setErr(r.data?.error || t('dbError')); return r.ok; };
  const movePitch = (v) => {
    setPv(v); clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ pitch: v }), 500);
  };
  const gender = s.guess ? t(`spkG_${s.guess}`) : '';
  const listen = async () => {
    setErr('');
    const r = await call(`/studio/dubbing/jobs/${audio.jobId}/audio?which=voice`);
    if (!r.ok) { setErr(r.data?.code === 'archived' ? t('dbArchived') : (r.data?.error || t('dbError'))); return; }
    setUrl(r.data.url);
  };
  // Aperçu rapide : on rejoue la voix déjà fabriquée en changeant sa vitesse de lecture SANS garder la hauteur (la vitesse change aussi).
  useEffect(() => {
    const a = audioEl.current;
    if (!url || !a) return;
    const first = segs.find((x) => x.speaker === s.n && !x.keep);
    a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
    a.playbackRate = Math.pow(2, (pv - audio.pitchOf(s.n)) / 12);
    const start = () => { a.currentTime = Math.max(0, (first ? first.startMs / 1000 : 0) - audio.offsetS); a.play().catch(() => {}); };
    if (a.readyState >= 1) start(); else a.addEventListener('loadedmetadata', start, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const retune = () => { const a = audioEl.current; if (a) a.playbackRate = Math.pow(2, (pv - audio.pitchOf(s.n)) / 12); };
  useEffect(retune, [pv]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <li className="spk-card" style={{ '--spk': spkColor(s.n) }}>
      <div className="spk-head">
        <span className="spk-dot" aria-hidden="true" />
        <label className="fld spk-name"><span className="sr-only">{t('spkName')}</span>
          <input value={label} maxLength={40} aria-label={`${t('spkName')} ${s.n}`} onChange={(e) => setLabel(e.target.value)}
            onBlur={() => { if (label.trim() && label.trim() !== s.label) save({ label: label.trim() }); else setLabel(s.label); }} />
        </label>
        <span className="meta small">{tf(t('spkStats'), { s: fmtDuration(s.seconds, t), n: s.phrases })}</span>
      </div>
      <p className="meta small">
        {s.f0 ? tf(t('spkHz'), { hz: Math.round(s.f0) }) : ''}{s.f0 && gender ? ' · ' : ''}{gender ? tf(t('spkGuess'), { c: gender }) : ''}
      </p>
      <div className="spk-voices">
        <label className="fld"><span>{t('spkBase')}</span>
          <select value={s.baseVoice || ''} onChange={(e) => save({ baseVoice: e.target.value || null })}>
            <option value="">{t('spkSame')}</option>
            {bases.map((v) => <option key={v.id} value={v.id}>{v.name}{v.gender ? ` · ${t('dbG_' + v.gender)}` : ''}</option>)}
          </select>
        </label>
        <label className="fld"><span>{t('spkTarget')}</span>
          <select value={s.targetVoice || ''} onChange={(e) => save({ targetVoice: e.target.value || null })}>
            <option value="">{s.baseVoice ? t('spkNoConv') : t('spkSame')}</option>
            {['female', 'male', 'child', ''].map((g) => [g, targets.filter((v) => (v.gender || '') === g)]).filter(([, l]) => l.length).map(([g, l]) => (
              <optgroup key={g || 'x'} label={g ? t('dbG_' + g) : t('dbGUnknown')}>
                {l.map((v) => <option key={v.id} value={v.id}>{v.name}{v.synthetic ? ` · ${t('dbSyntheticTag')}` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <p className="spk-final"><strong>{tf(t('spkFinal'), { v: `${baseName || '—'}${targetName ? ` → ${targetName}` : ''}` })}</strong></p>
      <div className="db-slider">
        <div className="db-slider-top">
          <label htmlFor={`spk-p-${s.n}`}>{t('spkPitch')}</label>
          <output htmlFor={`spk-p-${s.n}`}>{fmtPitch(pv, locale, t)}</output>
        </div>
        <input id={`spk-p-${s.n}`} type="range" min={-4} max={4} step={0.5} value={pv} onChange={(e) => movePitch(Number(e.target.value))} />
        <div className="spk-pitch-foot">
          {s.pitch != null
            ? <button type="button" className="db-link" onClick={() => save({ pitch: null })}>{tf(t('spkPitchSame'), { v: fmtPitch(Number(eff.pitch ?? 0), locale, t) })}</button>
            : <small className="meta">{tf(t('spkPitchSame'), { v: fmtPitch(Number(eff.pitch ?? 0), locale, t) })}</small>}
          {audio
            ? <button type="button" className="btn ghost" onClick={listen}>{t('spkListen')}</button>
            : <small className="meta">{t('spkListenNone')}</small>}
        </div>
        {url && <audio ref={audioEl} className="db-audio" controls src={url} />}
        {url && <small className="meta">{t('spkListenNote')}</small>}
      </div>
      {err && <p className="error small" role="alert">{err}</p>}
    </li>
  );
}

export default function Speakers({ id, d, state, setD, load, segs, audio }) {
  const { t, call } = useApp();
  const sp = d.speakers;
  const list = sp.list;
  const job = sp.job;
  const running = Boolean(job && ['pending', 'processing'].includes(job.status));
  const [max, setMax] = useState(6);
  const [msg, setMsg] = useState(null);
  const [range, setRange] = useState({ from: '', to: '', speaker: 1 });
  const setSp = (patch) => setD((cur) => ({ ...cur, speakers: { ...cur.speakers, ...patch } }));
  const fail = (r) => setMsg({ ok: false, text: r.data?.error || t('dbError') });

  const detect = async () => {
    if (list.length && !window.confirm(t('spkConfirmAgain'))) return;
    setMsg(null);
    const r = await call(`/studio/dubbing/talks/${id}/speakers/detect`, { method: 'POST', body: JSON.stringify({ maxSpeakers: max }) });
    if (r.ok) setSp({ job: r.data.job }); else fail(r);
  };
  const cancel = async () => {
    const r = await call(`/studio/dubbing/talks/${id}/speakers/cancel`, { method: 'POST' });
    if (r.ok) setSp({ job: r.data.job }); else fail(r);
    load();
  };
  const clear = async () => {
    if (!window.confirm(t('spkConfirmClear'))) return;
    const r = await call(`/studio/dubbing/talks/${id}/speakers`, { method: 'DELETE' });
    if (r.ok) { setSp({ list: [], job: null }); load(); } else fail(r);
  };
  const suggest = async () => {
    const r = await call(`/studio/dubbing/talks/${id}/speakers/suggest`, { method: 'POST' });
    if (!r.ok) { fail(r); return; }
    setSp({ list: r.data.speakers });
    const name = (n) => list.find((x) => x.n === n)?.label || `${t('spkColSpeaker')} ${n}`;
    const parts = [];
    if (r.data.done.length) parts.push({ ok: true, text: tf(t('spkSuggested'), { l: r.data.done.map((x) => `${name(x.n)} → ${x.voice}`).join(', ') }) });
    if (r.data.missing.length) parts.push({ ok: false, text: tf(t('spkNoneFor'), { l: r.data.missing.map((x) => `${name(x.n)} (${t('spkG_' + x.category)})`).join(', ') }) });
    setMsg(parts.length ? { ok: !r.data.missing.length, text: parts.map((p) => p.text).join(' ') } : { ok: true, text: t('spkNothingToSuggest') });
  };
  const saveSpeaker = async (n, body) => {
    const r = await call(`/studio/dubbing/talks/${id}/speakers/${n}`, { method: 'PUT', body: JSON.stringify(body) });
    if (r.ok) setSp({ list: r.data.speakers });
    return r;
  };
  const assign = async (e) => {
    e.preventDefault(); setMsg(null);
    const a = parseClock(range.from); const b = parseClock(range.to);
    if (a == null || b == null || b < a) { setMsg({ ok: false, text: t('spkRangeBad') }); return; }
    const inRange = segs.filter((x) => x.startMs >= a && x.startMs <= b);
    if (!inRange.length) { setMsg({ ok: false, text: t('spkRangeBad') }); return; }
    const r = await call(`/studio/dubbing/talks/${id}/speakers/assign`, { method: 'POST', body: JSON.stringify({ from: inRange[0].idx, to: inRange[inRange.length - 1].idx, speaker: Number(range.speaker) }) });
    if (r.ok) { setMsg({ ok: true, text: tf(t('spkRangeDone'), { n: r.data.changed }) }); setSp({ list: r.data.speakers }); load(); } else fail(r);
  };

  return (
    <section className="sd-card spk-panel" aria-labelledby="spk-title">
      <div className="sd-card-head">
        <h2 id="spk-title">{t('spkTitle')}</h2>
        {list.length > 0 && <span className="db-tag on">{tf(t('spkDone'), { n: list.length })}</span>}
      </div>
      <p className="meta small">{t('spkIntro')}</p>
      {!sp.canDetect && <p className="db-note" role="note">{t('spkExternal')}</p>}
      {!d.phrases && <p className="db-note" role="note">{t('spkNeedFrench')}</p>}
      {job?.status === 'pending' && <p role="status">{t('spkPending')}</p>}
      {job?.status === 'processing' && (
        <div className="db-job">
          <div className="db-job-top"><strong>{tf(t('spkRunning'), { n: job.progress })}</strong></div>
          <div className="db-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><i style={{ width: `${job.progress}%` }} /></div>
        </div>
      )}
      {running && <button type="button" className="btn ghost" onClick={cancel} disabled={job.cancelRequested}>{job.cancelRequested ? t('spkCancelling') : t('spkCancel')}</button>}
      {job?.status === 'failed' && <p className="error small" role="alert">{tf(t('spkFailed'), { e: job.error || '' })}</p>}
      {job?.status === 'canceled' && !list.length && <p className="meta small">{t('spkCanceled')}</p>}
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}

      <div className="db-actions spk-actions">
        {sp.canDetect && d.phrases > 0 && !running && (
          <>
            <label className="fld spk-max"><span>{t('spkMax')}</span>
              <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" className="btn" onClick={detect}>{list.length ? t('spkDetectAgain') : t('spkDetect')}</button>
          </>
        )}
        {list.length > 0 && !running && (
          <>
            <button type="button" className="btn ghost" onClick={suggest}>{t('spkSuggest')}</button>
            <button type="button" className="btn ghost" onClick={clear}>{t('spkClear')}</button>
          </>
        )}
      </div>

      {list.length > 0 && (
        <>
          <ul className="spk-list">
            {list.map((s) => <SpeakerCard key={s.n} s={s} d={d} state={state} audio={audio} segs={segs} onSave={saveSpeaker} />)}
          </ul>
          <form className="spk-range" onSubmit={assign}>
            <strong>{t('spkRangeTitle')}</strong>
            <small className="meta">{t('spkRangeHelp')}</small>
            <div className="spk-range-row">
              <label className="fld"><span>{t('spkRangeFrom')}</span><input value={range.from} inputMode="numeric" placeholder="12:30" maxLength={9} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
              <label className="fld"><span>{t('spkRangeTo')}</span><input value={range.to} inputMode="numeric" placeholder="15:10" maxLength={9} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
              <label className="fld"><span>{t('spkColSpeaker')}</span>
                <select value={range.speaker} onChange={(e) => setRange({ ...range, speaker: Number(e.target.value) })}>
                  {list.map((s) => <option key={s.n} value={s.n}>{s.label}</option>)}
                </select>
              </label>
              <button type="submit" className="btn ghost">{t('spkRangeGo')}</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
