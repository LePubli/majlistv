'use client';
// Module « Doublage français » — bibliothèque de voix : voix de base (Piper) et voix cibles (échantillon + consentement daté).
import { useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtDay, tf } from './shared';

const GENDERS = ['', 'male', 'female', 'child'];

function VoiceRow({ v, onChanged, setMsg }) {
  const { t, locale, call } = useApp();
  const [name, setName] = useState(v.name);
  const [audio, setAudio] = useState(null);
  const save = async (patch) => {
    const r = await call(`/studio/dubbing/voices/${v.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setMsg(r.ok ? { ok: true, text: t('dbSaved') } : { ok: false, text: r.data?.error || t('dbError') });
    if (r.ok) onChanged();
  };
  const listen = async () => {
    const r = await call(`/studio/dubbing/voices/${v.id}/sample`);
    if (r.ok) setAudio(r.data.url); else setMsg({ ok: false, text: r.data?.error || t('dbError') });
  };
  const off = async () => {
    if (!window.confirm(tf(t('dbConfirmOff'), { n: v.name }))) return;
    const r = await call(`/studio/dubbing/voices/${v.id}`, { method: 'DELETE' });
    setMsg(r.ok ? { ok: true, text: t('dbVoiceOff') } : { ok: false, text: r.data?.error || t('dbError') });
    if (r.ok) onChanged();
  };
  return (
    <li className={`db-voice${v.active ? '' : ' inactive'}`}>
      <span className={`db-avatar ${v.kind}`} aria-hidden="true" />
      <div className="db-voice-main">
        <div className="db-voice-name">
          <input aria-label={t('dbVoiceName')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== v.name && save({ name })} />
          <span className="db-tag">{t(v.kind === 'base' ? 'dbKindBase' : 'dbKindTarget')}</span>
          {v.gender && <span className="db-tag">{t('dbG_' + v.gender)}</span>}
          {!v.active && <span className="db-tag warn">{t('dbInactive')}</span>}
        </div>
        <p className="meta small">
          {v.kind === 'base'
            ? [v.model, v.speaker != null ? tf(t('dbSpeakerN'), { n: v.speaker }) : ''].filter(Boolean).join(' · ')
            : tf(t('dbConsentLine'), { d: fmtDay(v.consentDate, locale), n: v.consentBy })}
        </p>
        {(v.license || v.notes) && <p className="meta small">{[v.license && `${t('dbLicense')} : ${v.license}`, v.notes].filter(Boolean).join(' — ')}</p>}
        {audio && <audio controls src={audio} className="db-audio" />}
      </div>
      <div className="db-voice-actions">
        {v.hasSample && <button type="button" className="btn ghost" onClick={listen}>{t('dbListenSample')}</button>}
        {v.active
          ? <button type="button" className="btn ghost" onClick={off}>{t('dbDeactivate')}</button>
          : <button type="button" className="btn ghost" onClick={() => save({ active: true })}>{t('dbReactivate')}</button>}
      </div>
    </li>
  );
}

function AddBase({ onDone, setMsg }) {
  const { t, call } = useApp();
  const [f, setF] = useState({ name: '', model: '', speaker: '', gender: '', license: '' });
  const submit = async (e) => {
    e.preventDefault();
    const body = { kind: 'base', name: f.name, model: f.model.trim(), gender: f.gender, license: f.license, speaker: f.speaker === '' ? null : Number(f.speaker) };
    const r = await call('/studio/dubbing/voices', { method: 'POST', body: JSON.stringify(body) });
    setMsg(r.ok ? { ok: true, text: t('dbVoiceAdded') } : { ok: false, text: r.data?.error || t('dbError') });
    if (r.ok) { setF({ name: '', model: '', speaker: '', gender: '', license: '' }); onDone(); }
  };
  return (
    <form className="db-add" onSubmit={submit}>
      <h3>{t('dbAddBase')}</h3>
      <p className="meta small">{t('dbAddBaseHelp')}</p>
      <div className="db-add-grid">
        <label className="fld"><span>{t('dbVoiceName')}</span><input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="fld"><span>{t('dbModel')}</span><input required placeholder="fr_FR-tom-medium" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></label>
        <label className="fld"><span>{t('dbSpeaker')}</span><input type="number" min="0" max="999" value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></label>
        <label className="fld"><span>{t('dbGender')}</span><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>{GENDERS.map((g) => <option key={g} value={g}>{g ? t('dbG_' + g) : t('dbGUnknown')}</option>)}</select></label>
        <label className="fld"><span>{t('dbLicense')}</span><input maxLength={200} value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} /></label>
      </div>
      <button className="btn">{t('dbAdd')}</button>
    </form>
  );
}

function AddTarget({ maxMb, onDone, setMsg }) {
  const { t, call } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const empty = { name: '', file: null, consentDate: today, consentBy: '', consentConfirmed: false, gender: '', license: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.file) return;
    if (f.file.size > maxMb * 1048576) { setMsg({ ok: false, text: tf(t('dbTooBig'), { n: maxMb }) }); return; }
    setBusy(true); setMsg({ ok: true, text: t('dbUploading') });
    try {
      const type = f.file.type || 'audio/mpeg';
      const u = await call('/studio/dubbing/voices/upload-url', { method: 'POST', body: JSON.stringify({ contentType: type, size: f.file.size }) });
      if (!u.ok) { setMsg({ ok: false, text: u.data?.error || t('dbError') }); return; }
      const put = await fetch(u.data.url, { method: 'PUT', body: f.file, headers: { 'content-type': type } });
      if (!put.ok) { setMsg({ ok: false, text: t('dbUploadFailed') }); return; }
      const r = await call('/studio/dubbing/voices', { method: 'POST', body: JSON.stringify({ kind: 'target', name: f.name, sampleKey: u.data.key, consentDate: f.consentDate, consentBy: f.consentBy, consentConfirmed: f.consentConfirmed, gender: f.gender, license: f.license }) });
      setMsg(r.ok ? { ok: true, text: t('dbVoiceAdded') } : { ok: false, text: r.data?.error || t('dbError') });
      if (r.ok) { setF(empty); e.target.reset(); onDone(); }
    } catch {
      setMsg({ ok: false, text: t('dbUploadFailed') });
    } finally { setBusy(false); }
  };
  return (
    <form className="db-add" onSubmit={submit}>
      <h3>{t('dbAddTarget')}</h3>
      <p className="meta small">{tf(t('dbAddTargetHelp'), { n: maxMb })}</p>
      <div className="db-add-grid">
        <label className="fld"><span>{t('dbVoiceName')}</span><input required maxLength={80} placeholder={t('dbMyVoice')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="fld"><span>{t('dbSample')}</span><input required type="file" accept="audio/*" onChange={(e) => setF({ ...f, file: e.target.files?.[0] || null })} /></label>
        <label className="fld"><span>{t('dbConsentDate')}</span><input required type="date" max={today} value={f.consentDate} onChange={(e) => setF({ ...f, consentDate: e.target.value })} /></label>
        <label className="fld"><span>{t('dbConsentBy')}</span><input required minLength={2} maxLength={120} value={f.consentBy} onChange={(e) => setF({ ...f, consentBy: e.target.value })} /></label>
        <label className="fld"><span>{t('dbGender')}</span><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>{GENDERS.map((g) => <option key={g} value={g}>{g ? t('dbG_' + g) : t('dbGUnknown')}</option>)}</select></label>
      </div>
      <label className="db-check"><input type="checkbox" required checked={f.consentConfirmed} onChange={(e) => setF({ ...f, consentConfirmed: e.target.checked })} /> <span>{t('dbConsentCheck')}</span></label>
      <button className="btn" disabled={busy}>{busy ? t('dbUploading') : t('dbAdd')}</button>
    </form>
  );
}

export default function Voices({ state, reload }) {
  const { t, call } = useApp();
  const [all, setAll] = useState(null);
  const [msg, setMsg] = useState(null);
  const refresh = async () => { await reload(); const r = await call('/studio/dubbing/voices?all=1'); if (r.ok) setAll(r.data.voices); };
  const list = all || state.voices;
  return (
    <div className="db-voices">
      <p className="meta">{t('dbVoicesIntro')}</p>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      <ul className="db-voice-list">{list.map((v) => <VoiceRow key={v.id + String(v.active)} v={v} onChanged={refresh} setMsg={setMsg} />)}</ul>
      {!all && <button type="button" className="btn ghost" onClick={refresh}>{t('dbShowInactive')}</button>}
      <div className="db-add-wrap">
        <AddTarget maxMb={state.maxSampleMb} onDone={refresh} setMsg={setMsg} />
        <AddBase onDone={refresh} setMsg={setMsg} />
      </div>
    </div>
  );
}
