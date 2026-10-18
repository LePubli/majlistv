'use client';
// Éditeur de montage (étape E2) — panneau « Piste sélectionnée » des pistes son (maquette « Studio v2 », écran 4) :
//   Voix d'origine : volume, coupée, fondu aux raccords, réduction du bruit (avec écoute de 10 s avant / après), niveau mesuré.
//   Voix française : utilisée ou non, volume, voix d'origine sous la voix française (%), fondu d'entrée / sortie.
//   Musique        : liste des musiques du montage ; une musique : volume, début, durée, fondus, boucle, baisse automatique.
//   Pour toutes    : niveau sonore homogène au rendu (LUFS visés).
// Un réglage tiré au curseur compte pour un seul geste dans Annuler / Rétablir.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtTime, parseTime, trimMusic, moveMusic } from './ops';

const fmtDb = (v, locale) => `${v > 0 ? '+' : ''}${Number(v).toLocaleString(locale, { maximumFractionDigits: 1 })} dB`;

function Slider({ id, label, value, min, max, step = 1, shown, onChange, disabled }) {
  return (
    <div className="mt-slider">
      <label htmlFor={id}><span>{label}</span><b dir="ltr">{shown}</b></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} />
    </div>
  );
}
function Check({ id, label, checked, onChange, disabled }) {
  return <label className="db-check mt-check" htmlFor={id}><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

// Écoute de 10 s de la voix d'origine avec / sans réduction du bruit (préparée par l'API avec FFmpeg).
function DenoiseTry({ projectId, at, level }) {
  const { t } = useApp();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const audio = useRef(null);
  useEffect(() => () => { if (audio.current) { audio.current.pause(); URL.revokeObjectURL(audio.current.src); } }, []);
  const play = async (lv) => {
    setBusy(lv); setErr('');
    let tok = null;
    try { tok = localStorage.getItem('token'); } catch { tok = null; }
    try {
      const r = await fetch(`/api/studio/editor/projects/${projectId}/denoise-sample`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify({ at, level: lv }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || t('dbError')); }
      const url = URL.createObjectURL(await r.blob());
      if (audio.current) { audio.current.pause(); URL.revokeObjectURL(audio.current.src); }
      audio.current = new Audio(url);
      audio.current.dataset.level = lv;
      await audio.current.play().catch(() => {});
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="mt-try">
      <span className="meta small">{t('mtTryAt').replace('{s}', fmtTime(at))}</span>
      <div className="mt-actions">
        <button type="button" className="btn ghost sd-pill" disabled={Boolean(busy)} onClick={() => play('off')} data-try="off">{busy === 'off' ? t('dbLoading') : t('mtTryOff')}</button>
        <button type="button" className="btn ghost sd-pill" disabled={Boolean(busy) || level === 'off'} onClick={() => play(level)} data-try="on">{busy && busy !== 'off' ? t('dbLoading') : t('mtTryOn')}</button>
      </div>
      {err && <p className="error small" role="alert">{err}</p>}
    </div>
  );
}

function Measured({ wave, label }) {
  const { t, locale } = useApp();
  if (!wave) return null;
  if (wave.status === 'ready') return <div className="mt-kv"><span>{label}</span><b dir="ltr">{wave.lufs == null ? '—' : `${wave.lufs.toLocaleString(locale, { maximumFractionDigits: 1 })} LUFS`}</b></div>;
  if (wave.status === 'failed') return <p className="mt-hint warn">{t('mtWaveFailed')}{wave.error ? ` (${wave.error})` : ''}</p>;
  return <p className="meta small" role="status">{t('mtWaveRunning')}</p>;
}

function FinalMix({ audio, setAudio, canEdit }) {
  const { t } = useApp();
  const L = audio.loudness;
  return (
    <div className="mt-final">
      <h4 className="mt-cap">{t('mtFinalMix')}</h4>
      <Check id="mt-loud" label={t('mtLoudness')} checked={L.on} disabled={!canEdit} onChange={(v) => setAudio({ ...audio, loudness: { ...L, on: v } })} />
      <div className="mt-field">
        <label htmlFor="mt-loud-target">{t('mtLoudTarget')}</label>
        <select id="mt-loud-target" value={L.target} disabled={!canEdit || !L.on} onChange={(e) => setAudio({ ...audio, loudness: { ...L, target: Number(e.target.value) } })}>
          {[-14, -16, -18, -23].map((v) => <option key={v} value={v}>{t(`mtLufs_${-v}`)}</option>)}
        </select>
      </div>
      <p className="meta small">{t('mtAppliedAtRender')}</p>
    </div>
  );
}

export default function AudioPanel({ sel, setSel, audio, setAudio, canEdit, dub, hasDub, waves, musicInfo, totalS, setT, projectId, srcAt, onAddMusic }) {
  const { t, locale, user } = useApp();
  const O = audio.orig; const D = audio.dub;
  const setO = (k, v, key) => setAudio({ ...audio, orig: { ...O, [k]: v } }, key);
  const setD = (k, v, key) => setAudio({ ...audio, dub: { ...D, [k]: v } }, key);
  const [startV, setStartV] = useState(''); const [lenV, setLenV] = useState('');
  const item = sel.track === 'music' ? audio.music.find((m) => m.id === sel.id) : null;
  useEffect(() => { if (item) { setStartV(fmtTime(item.start, { tenths: true })); setLenV(fmtTime(item.len, { tenths: true })); } }, [item?.id, item?.start, item?.len]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sel.track === 'orig') {
    return (
      <div className="mt-panel">
        <h3 id="mt-sel-title">{t('mtTrOrig')}</h3>
        <Slider id="mt-o-gain" label={t('mtVolume')} value={O.gainDb} min={-40} max={12} step={0.5} shown={fmtDb(O.gainDb, locale)} disabled={!canEdit || O.mute} onChange={(v) => setO('gainDb', v, 'o-gain')} />
        <Check id="mt-o-mute" label={t('mtMute')} checked={O.mute} disabled={!canEdit} onChange={(v) => setO('mute', v)} />
        <Slider id="mt-o-join" label={t('mtJoinFade')} value={O.joinFadeMs} min={0} max={500} step={10} shown={`${O.joinFadeMs} ms`} disabled={!canEdit} onChange={(v) => setO('joinFadeMs', v, 'o-join')} />
        <div className="mt-field">
          <label htmlFor="mt-o-denoise">{t('mtDenoise')}</label>
          <select id="mt-o-denoise" value={O.denoise} disabled={!canEdit} onChange={(e) => setO('denoise', e.target.value)}>
            {['off', 'light', 'strong'].map((v) => <option key={v} value={v}>{t(`mtDenoise_${v}`)}</option>)}
          </select>
        </div>
        <DenoiseTry projectId={projectId} at={srcAt} level={O.denoise} />
        <Measured wave={waves.orig} label={t('mtMeasured')} />
        {hasDub && D.use && <p className="mt-hint">{t('mtOrigDucked').replace('{p}', Math.round(D.duck))}</p>}
        <FinalMix audio={audio} setAudio={setAudio} canEdit={canEdit} />
      </div>
    );
  }

  if (sel.track === 'dub') {
    if (!dub || !hasDub) {
      return (
        <div className="mt-panel">
          <h3 id="mt-sel-title">{t('mtTrDub')}</h3>
          <p className="mt-hint">{t('mtNoDubHint')}</p>
          {dub?.link && <a className="btn ghost sd-pill" href={dub.link}>{t('mtOpenDub')}</a>}
        </div>
      );
    }
    return (
      <div className="mt-panel">
        <h3 id="mt-sel-title">{t('mtTrDub')}</h3>
        <Check id="mt-d-use" label={t('mtDubUse')} checked={D.use} disabled={!canEdit} onChange={(v) => setD('use', v)} />
        <Slider id="mt-d-gain" label={t('mtVolume')} value={D.gainDb} min={-40} max={12} step={0.5} shown={fmtDb(D.gainDb, locale)} disabled={!canEdit || !D.use} onChange={(v) => setD('gainDb', v, 'd-gain')} />
        <Slider id="mt-d-duck" label={t('mtDuck')} value={D.duck} min={0} max={100} step={1} shown={`${Math.round(D.duck)} %`} disabled={!canEdit || !D.use} onChange={(v) => setD('duck', v, 'd-duck')} />
        <Slider id="mt-d-fade" label={t('mtFade')} value={D.fade} min={0} max={3} step={0.1} shown={`${D.fade.toLocaleString(locale)} s`} disabled={!canEdit || !D.use} onChange={(v) => setD('fade', v, 'd-fade')} />
        <Measured wave={waves.dub} label={t('mtMeasured')} />
        <p className="mt-hint">{t('mtDubHint').replace('{n}', dub.segments.length).replace('{k}', dub.segments.filter((s) => s.keep).length)}</p>
        <FinalMix audio={audio} setAudio={setAudio} canEdit={canEdit} />
      </div>
    );
  }

  // Musique : liste, ou réglages de la musique sélectionnée.
  if (!item) {
    return (
      <div className="mt-panel">
        <h3 id="mt-sel-title">{t('mtTrMusic')}</h3>
        {audio.music.length === 0 && <p className="mt-hint">{t('mtMusicEmpty')}</p>}
        <ul className="mt-mlist">
          {audio.music.map((m) => (
            <li key={m.id}><button type="button" className="mt-add" onClick={() => setSel({ track: 'music', id: m.id })}>
              <span dir="auto">{musicInfo[m.asset]?.title || '…'}</span><em dir="ltr">{fmtTime(m.start)}</em></button></li>
          ))}
        </ul>
        <button type="button" className="btn ghost sd-pill" onClick={onAddMusic} disabled={!canEdit}>{t('mtAddMusicBtn')}</button>
        <p className="meta small">{user?.role === 'admin' ? t('mtMusicAdminNote') : t('mtMusicOrgaNote')}</p>
        <FinalMix audio={audio} setAudio={setAudio} canEdit={canEdit} />
      </div>
    );
  }
  const info = musicInfo[item.asset] || {};
  const dur = info.durationS || 0;
  const setM = (patch, key) => setAudio({ ...audio, music: audio.music.map((m) => (m.id === item.id ? { ...m, ...patch } : m)) }, key);
  const applyStart = (str) => { const v = parseTime(str); if (!Number.isNaN(v)) setAudio({ ...audio, music: moveMusic(audio.music, item.id, Math.min(v, Math.max(0, totalS - 0.2))) }); };
  const applyLen = (str) => { const v = parseTime(str); if (!Number.isNaN(v)) setAudio({ ...audio, music: trimMusic(audio.music, item.id, 'out', item.start + v, dur) }); };
  const maxFade = Math.max(0, Math.min(10, item.len / 2));
  return (
    <div className="mt-panel">
      <h3 id="mt-sel-title" dir="auto">{info.title || t('mtTrMusic')}</h3>
      {info.license && <p className="meta small" dir="auto">{info.license}</p>}
      {info.missing && <p className="mt-hint warn">{t('mtMusicMissing')}</p>}
      <Slider id="mt-m-gain" label={t('mtVolume')} value={item.gainDb} min={-40} max={12} step={0.5} shown={fmtDb(item.gainDb, locale)} disabled={!canEdit} onChange={(v) => setM({ gainDb: v }, `m-gain-${item.id}`)} />
      <div className="mt-two">
        <div className="mt-field"><label htmlFor="mt-m-start">{t('mtMusicStart')}</label>
          <input id="mt-m-start" dir="ltr" value={startV} disabled={!canEdit} onChange={(e) => setStartV(e.target.value)} onBlur={(e) => applyStart(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyStart(e.currentTarget.value); }} /></div>
        <div className="mt-field"><label htmlFor="mt-m-len">{t('mtMusicLen')}</label>
          <input id="mt-m-len" dir="ltr" value={lenV} disabled={!canEdit} onChange={(e) => setLenV(e.target.value)} onBlur={(e) => applyLen(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyLen(e.currentTarget.value); }} /></div>
      </div>
      <Slider id="mt-m-fin" label={t('mtFadeIn')} value={Math.min(item.fadeIn, maxFade)} min={0} max={maxFade || 0.1} step={0.1} shown={`${item.fadeIn.toLocaleString(locale)} s`} disabled={!canEdit} onChange={(v) => setM({ fadeIn: v }, `m-fin-${item.id}`)} />
      <Slider id="mt-m-fout" label={t('mtFadeOut')} value={Math.min(item.fadeOut, maxFade)} min={0} max={maxFade || 0.1} step={0.1} shown={`${item.fadeOut.toLocaleString(locale)} s`} disabled={!canEdit} onChange={(v) => setM({ fadeOut: v }, `m-fout-${item.id}`)} />
      <Check id="mt-m-loop" label={t('mtLoop')} checked={item.loop} disabled={!canEdit} onChange={(v) => {
        // Sans boucle, la musique ne peut pas durer plus longtemps que son fichier.
        const len = !v && dur > 0 ? Math.min(item.len, dur - item.offset) : item.len;
        setM({ loop: v, len, fadeIn: Math.min(item.fadeIn, len / 2), fadeOut: Math.min(item.fadeOut, len / 2) });
      }} />
      <Check id="mt-m-duck" label={t('mtAutoDuckLabel')} checked={item.duck} disabled={!canEdit} onChange={(v) => setM({ duck: v })} />
      <Slider id="mt-m-duckdb" label={t('mtDuckDb')} value={item.duckDb} min={-40} max={0} step={1} shown={fmtDb(item.duckDb, locale)} disabled={!canEdit || !item.duck} onChange={(v) => setM({ duckDb: v }, `m-duck-${item.id}`)} />
      {dur > 0 && <div className="mt-kv"><span>{t('mtMusicFile')}</span><b dir="ltr">{fmtTime(dur)}{info.lufs != null ? ` · ${info.lufs.toLocaleString(locale, { maximumFractionDigits: 1 })} LUFS` : ''}</b></div>}
      <div className="mt-actions">
        <button type="button" className="btn ghost sd-pill" onClick={() => setT(item.start)}>{t('mtGoStart')}</button>
        <button type="button" className="btn ghost sd-pill" disabled={!canEdit} onClick={() => { setAudio({ ...audio, music: audio.music.filter((m) => m.id !== item.id) }); setSel({ track: 'music', id: null }); }}>{t('mtMusicRemove')}</button>
      </div>
    </div>
  );
}
