'use client';
// Pastille « Prochaine prière » de l'en-tête (étape 23a) : nom de la prière et compte à rebours, discrète ; un clic ouvre les horaires du jour.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { useNow } from '../lib/usePrayer';
import { countdown, statusAt } from '../lib/prayerLogic';
import { civilDate, fmtTime, METHODS, PRAYERS } from '../lib/prayerTimes';

const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const nameKey = (id) => 'pry' + id[0].toUpperCase() + id.slice(1);

export default function PrayerPill() {
  const { prayer, t, locale, kidMode } = useApp();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const box = useRef(null);
  const show = prayer.on && prayer.ready && prayer.prefs.pill && prayer.items.length > 0;
  const now = useNow(1000, show);

  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!show || now == null) return null;
  const { prefs, items } = prayer;
  const st = statusAt(items, now, prefs);
  if (!st.next) return null;
  const nowPrayer = st.current && now - st.current.at < 60_000 * 3; // « maintenant » pendant les 3 premières minutes
  const left = st.next.at - now;
  const soon = left <= 10 * 60_000;
  const name = t(nameKey(nowPrayer ? st.current.id : st.next.id));
  const time = countdown(left);
  const label = nowPrayer ? t('pryAriaNow').replace('{name}', name) : t('pryAria').replace('{name}', name).replace('{time}', time);

  // Horaires d'aujourd'hui (jour civil du lieu choisi).
  const today = civilDate(now, prefs.loc.tz);
  const key = (ms) => { const c = civilDate(ms, prefs.loc.tz); return `${c.y}-${c.m}-${c.d}`; };
  const todayKey = `${today.y}-${today.m}-${today.d}`;
  const rows = ORDER.map((id) => items.find((x) => x.id === id && key(x.at) === todayKey)).filter(Boolean);
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;
  const locate = async () => { setMsg(t('pryLocating')); const r = await prayer.locate(); setMsg(r.ok ? '' : t('pryLocateDenied')); };

  return (
    <div className="pry" ref={box}>
      <button type="button" className={`pry-pill${soon || nowPrayer ? ' is-soon' : ''}`} onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={t('pryNext')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" /></svg>
        <span className="pry-name">{name}</span>
        <span className="pry-time" dir="ltr">{nowPrayer ? '●' : time}</span>
      </button>
      {open && (
        <div className="pry-pop" role="dialog" aria-label={t('pryToday')}>
          <p className="pry-pop-title">{t('pryToday')}</p>
          <ul className="pry-list">
            {rows.map((r) => (
              <li key={r.id} className={r.id === st.next.id ? 'is-next' : undefined}>
                <span>{t(nameKey(r.id))}</span>
                <b dir="ltr">{fmtTime(r.at, prefs.loc.tz, locale)}</b>
              </li>
            ))}
          </ul>
          <p className="pry-place">{t('pryPlace').replace('{place}', place)} · {t('pryM' + prefs.method)}</p>
          {msg && <p className="pry-msg" role="status">{msg}</p>}
          <div className="pry-actions">
            <button type="button" className="btn ghost small" onClick={locate}>{t('pryLocate')}</button>
            {!kidMode && <Link className="link u" href="/priere" onClick={() => setOpen(false)}>{t('pryAllSettings')}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
