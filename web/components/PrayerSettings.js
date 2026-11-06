'use client';
// Réglages de la prière (étape 23a) : utilisés par la page /priere et par l'onglet « Prière » de Mon compte.
import { useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { searchCities } from '../lib/prayerCities';
import { ADHANS, ADHAN_KEY, adhanUrl, readAdhanPrefs } from '../lib/adhanWeb';
import { METHOD_IDS, PRAYERS, fmtTime, civilDate } from '../lib/prayerTimes';

const nameKey = (id) => 'pry' + id[0].toUpperCase() + id.slice(1);

// Adhan sur ce navigateur : silencieux (par défaut) ou adhan à l'heure de la prière quand le site est ouvert ; choix parmi le catalogue, avec écoute.
function AdhanSettings({ t }) {
  const [p, setP] = useState({ mode: 'silent', id: ADHANS[0].id });
  const [listening, setListening] = useState(null);
  const [perm, setPerm] = useState('default');
  const au = useRef(null);
  useEffect(() => {
    try { setP(readAdhanPrefs(localStorage.getItem(ADHAN_KEY))); } catch { /* stockage indisponible */ }
    try { if ('Notification' in window) setPerm(Notification.permission); else setPerm('unsupported'); } catch { setPerm('unsupported'); }
    return () => { if (au.current) au.current.pause(); };
  }, []);
  const save = (patch) => {
    const n = { ...p, ...patch }; setP(n);
    try { localStorage.setItem(ADHAN_KEY, JSON.stringify(n)); window.dispatchEvent(new Event('adhan-prefs')); } catch { /* ignoré */ }
  };
  const listen = (a) => {
    if (au.current) au.current.pause();
    if (listening === a.id) { setListening(null); return; }
    const x = new Audio(adhanUrl(a)); au.current = x; setListening(a.id);
    x.addEventListener('ended', () => setListening(null));
    x.play().catch(() => setListening(null));
  };
  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch { /* ignoré */ } };
  return (
    <fieldset className="pry-fs">
      <legend>{t('adhTitle')}</legend>
      <p className="meta small">{t('adhHelp')}</p>
      <label className="chk"><input type="radio" name="adh-mode" checked={p.mode === 'silent'} onChange={() => save({ mode: 'silent' })} /> <span>{t('adhSilent')}</span></label>
      <label className="chk"><input type="radio" name="adh-mode" checked={p.mode === 'adhan'} onChange={() => save({ mode: 'adhan' })} /> <span>{t('adhOn')}</span></label>
      {p.mode === 'adhan' && (
        <>
          <p><b>{t('adhChoose')}</b></p>
          {ADHANS.map((a) => (
            <div key={a.id} className="pry-row">
              <label className="chk"><input type="radio" name="adh-id" checked={p.id === a.id} onChange={() => save({ id: a.id })} /> <span>{a.name}</span></label>
              <button type="button" className="btn ghost small" onClick={() => listen(a)}>{listening === a.id ? t('adhStop') : t('adhListen')}</button>
            </div>
          ))}
          {perm === 'default' && <button type="button" className="btn ghost small" onClick={ask}>{t('adhNotif')}</button>}
          {perm === 'granted' && <p className="meta small">{t('adhNotifOn')}</p>}
        </>
      )}
    </fieldset>
  );
}

export default function PrayerSettings() {
  const { prayer, t, locale } = useApp();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState(false);
  if (!prayer.on) return <p className="meta">{t('ftOffText')}</p>;
  const { prefs, cfg, items } = prayer;
  const set = async (patch) => { setSaved(false); await prayer.save(patch); setSaved(true); };
  const results = q.trim() ? searchCities(q) : [];
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;
  const locate = async () => { setMsg(t('pryLocating')); const r = await prayer.locate(); setMsg(r.ok ? '' : t('pryLocateDenied')); if (r.ok) setSaved(true); };

  const c = civilDate(Date.now(), prefs.loc.tz);
  const k = `${c.y}-${c.m}-${c.d}`;
  const today = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((id) => items.find((x) => x.id === id && (() => { const d = civilDate(x.at, prefs.loc.tz); return `${d.y}-${d.m}-${d.d}` === k; })())).filter(Boolean);

  return (
    <section className="pry-set card-lite">
      <h2>{t('prySetTitle')}</h2>
      <p className="meta">{t('prySetIntro')}</p>

      <label className="chk"><input type="checkbox" role="switch" checked={prefs.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> <span>{t('prySetPause')}</span></label>
      {!prefs.enabled && <p className="meta small">{t('prySetOff')}</p>}
      <label className="chk"><input type="checkbox" role="switch" checked={prefs.pill} onChange={(e) => set({ pill: e.target.checked })} /> <span>{t('prySetPill')}</span></label>

      <AdhanSettings t={t} />

      <fieldset className="pry-fs">
        <legend>{t('prySetPlace')}</legend>
        <p><b>{place}</b> <span className="meta small">({prefs.loc.tz})</span></p>
        <div className="pry-row">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('prySetCityPh')} aria-label={t('prySetCity')} />
          <button type="button" className="btn ghost small" onClick={locate}>{t('pryLocate')}</button>
        </div>
        {q.trim() && (
          results.length ? (
            <ul className="pry-results">{results.map((r) => <li key={r.id}><button type="button" onClick={() => { setQ(''); set({ loc: { mode: 'city', city: r.id } }); }}>{r.name}</button></li>)}</ul>
          ) : <p className="meta small">{t('prySetNoCity')}</p>
        )}
        {msg && <p className="pry-msg" role="status">{msg}</p>}
      </fieldset>

      <div className="pry-grid">
        <label className="fld"><span>{t('prySetMethod')}</span>
          <select value={prefs.method} onChange={(e) => set({ method: e.target.value })}>{METHOD_IDS.map((m) => <option key={m} value={m}>{t('pryM' + m)}</option>)}</select>
        </label>
        <label className="fld"><span>{t('prySetAsr')}</span>
          <select value={prefs.asr} onChange={(e) => set({ asr: e.target.value })}><option value="standard">{t('prySetAsrStd')}</option><option value="hanafi">{t('prySetAsrHan')}</option></select>
        </label>
        <label className="fld"><span>{t('prySetBlock')}</span>
          <input type="number" min="1" max={cfg.maxBlockMinutes} value={prefs.blockMinutes} onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 1) set({ blockMinutes: Math.min(n, cfg.maxBlockMinutes) }); }} />
        </label>
      </div>
      <p className="meta small">{t('prySetBlockHelp').replace('{max}', String(cfg.maxBlockMinutes))}</p>

      <fieldset className="pry-fs">
        <legend>{t('prySetPrayers')}</legend>
        <div className="pry-checks">
          {PRAYERS.map((id) => (
            <label key={id} className="chk"><input type="checkbox" checked={prefs.prayers[id]} onChange={(e) => set({ prayers: { ...prefs.prayers, [id]: e.target.checked } })} /> <span>{t(nameKey(id))}</span></label>
          ))}
        </div>
      </fieldset>

      {today.length > 0 && (
        <div className="pry-today">
          <h3>{t('prySetToday')}</h3>
          <ul className="pry-list">{today.map((r) => <li key={r.id}><span>{t(nameKey(r.id))}</span><b dir="ltr">{fmtTime(r.at, prefs.loc.tz, locale)}</b></li>)}</ul>
        </div>
      )}
      <p className="meta small">{t('prySetPrivacy')}</p>
      <p className="meta small" role="status" aria-live="polite">{saved ? t('prySaved') : ''}</p>
    </section>
  );
}
