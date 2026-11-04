'use client';
// Amélioration 4.3 — Page « Prière » : horaires du jour, date hégirienne, calendrier du mois, direction de la Qibla (+ boussole du téléphone), réglages.
// Gratuite et ouverte à tous (visiteur : réglages gardés sur l'appareil ; compte : réglages du compte). Calculs : lib/prayerTimes.js et lib/prayerExtras.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';
import PrayerSettings from './PrayerSettings';
import { countdown, statusAt } from '../lib/prayerLogic';
import { civilDate, dayTimes, fmtTime } from '../lib/prayerTimes';
import { compassIndex, hijriOfCivil, isWhiteDay, monthTable, qibla, shiftMonth, smoothHeading, turnTo } from '../lib/prayerExtras';
import { useNow } from '../lib/usePrayer';

const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const nameKey = (id) => 'pry' + id[0].toUpperCase() + id.slice(1);
const TABS = ['today', 'month', 'qibla', 'settings'];
const TAB_KEY = { today: 'pqTabToday', month: 'pqTabMonth', qibla: 'pqTabQibla', settings: 'pqTabSettings' };
const nf = (locale) => (locale === 'ar' ? 'ar-u-nu-latn' : locale);

/** « 23 Joumada al-oula 1448 » dans la langue de l'interface. */
const hijriText = (h, t) => `${h.day} ${t('pqH' + h.month)} ${h.year}`;

export default function PrayerPage() {
  const { t, locale, prayer } = useApp();
  const [tab, setTab] = useState('today');
  // Onglet demandé dans l'adresse (?tab=month, ?tab=settings…) : lu après le premier affichage.
  useEffect(() => { try { const q = new URLSearchParams(window.location.search).get('tab'); if (TABS.includes(q)) setTab(q); } catch { /* adresse illisible : onglet par défaut */ } }, []);
  const go = (id) => { setTab(id); try { window.history.replaceState(null, '', id === 'today' ? '/priere' : `/priere?tab=${id}`); } catch { /* sans effet */ } };

  if (!prayer.on) return <p className="meta">{t('ftOffText')}</p>;
  if (!prayer.ready) return <p className="meta" role="status">…</p>;
  const { prefs, cfg } = prayer;
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;

  return (
    <div className="pq">
      <div className="pq-head">
        <p className="pq-place"><span className="meta">{t('pqPlace')}</span> <b>{place}</b> <button type="button" className="link u" onClick={() => go('settings')}>{t('pqChange')}</button></p>
      </div>
      <div className="pq-tabs pq-noprint" role="tablist" aria-label={t('pqTitle')}>
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" id={`pq-tab-${id}`} aria-selected={tab === id} aria-controls="pq-panel" className={tab === id ? 'on' : undefined} onClick={() => go(id)}>{t(TAB_KEY[id])}</button>
        ))}
      </div>
      <div id="pq-panel" role="tabpanel" aria-labelledby={`pq-tab-${tab}`}>
        {tab === 'today' && <Today prefs={prefs} cfg={cfg} items={prayer.items} t={t} locale={locale} />}
        {tab === 'month' && <Month prefs={prefs} cfg={cfg} t={t} locale={locale} />}
        {tab === 'qibla' && <Qibla prefs={prefs} t={t} place={place} />}
        {tab === 'settings' && <PrayerSettings />}
      </div>
    </div>
  );
}

function Today({ prefs, cfg, items, t, locale }) {
  const now = useNow(1000, true);
  const { tz } = prefs.loc;
  const base = now == null ? null : civilDate(now, tz);
  const times = useMemo(() => (base ? dayTimes({ lat: prefs.loc.lat, lon: prefs.loc.lon, y: base.y, m: base.m, d: base.d, method: prefs.method, asr: prefs.asr, highLat: prefs.highLat }) : null), [base?.y, base?.m, base?.d, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!base || !times) return <p className="meta" role="status">…</p>;
  const st = statusAt(items, now, prefs);
  const nowPrayer = st.current && now - st.current.at < 3 * 60_000;
  // La prochaine prière peut être celle de demain (après Isha) : on l'indique, et on ne surligne rien dans la liste d'aujourd'hui.
  const nextDay = st.next ? civilDate(st.next.at, tz) : null;
  const tomorrow = !nowPrayer && nextDay && (nextDay.y !== base.y || nextDay.m !== base.m || nextDay.d !== base.d);
  const focus = nowPrayer ? st.current.id : tomorrow ? null : st.next?.id;
  const left = st.next ? st.next.at - now : 0;
  const hij = hijriOfCivil(base, cfg.hijriOffset);
  const greg = new Intl.DateTimeFormat(nf(locale), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(now));
  return (
    <>
      <div className="pq-grid">
        <section className="pq-next" aria-label={t('pryNext')}>
          <p className="pq-kicker">{t('pryNext')}</p>
          {st.next ? (
            <>
              <p className="pq-bigname">{t(nameKey(nowPrayer ? st.current.id : st.next.id))} <span dir="ltr">{fmtTime(nowPrayer ? st.current.at : st.next.at, tz, locale)}</span>{tomorrow ? <small className="pq-tomorrow"> · {t('pqTomorrow')}</small> : null}</p>
              <p className="pq-left">{nowPrayer ? t('pqNowIs') : t('pqLeft').split('{time}').flatMap((part, i, a) => (i < a.length - 1 ? [part, <span key={i} dir="ltr">{countdown(left)}</span>] : [part]))}</p>
            </>
          ) : <p className="meta">—</p>}
          <div className="pq-dates">
            <p><b>{greg}</b></p>
            <p>{hijriText(hij, t)}</p>
          </div>
        </section>
        <section className="pq-times" aria-label={t('pryToday')}>
          <ul>
            {ORDER.map((id) => (
              <li key={id} className={id === focus ? 'is-next' : id === 'sunrise' ? 'is-sun' : undefined} aria-current={id === focus ? 'time' : undefined}>
                <span className="pq-n">{t(nameKey(id))}</span>
                <b className="pq-t" dir="ltr">{fmtTime(times[id].getTime(), tz, locale)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="meta small">{t('pqNote').replace('{method}', t('pryM' + prefs.method))}</p>
    </>
  );
}

function Month({ prefs, cfg, t, locale }) {
  const { tz } = prefs.loc;
  const [cur, setCur] = useState(null);
  useEffect(() => { const c = civilDate(Date.now(), tz); setCur({ y: c.y, m: c.m }); }, [tz]);
  const rows = useMemo(() => (cur ? monthTable({ lat: prefs.loc.lat, lon: prefs.loc.lon, method: prefs.method, asr: prefs.asr, highLat: prefs.highLat, y: cur.y, m: cur.m, hijriOffset: cfg.hijriOffset }) : []), [cur, prefs, cfg.hijriOffset]);
  if (!cur) return <p className="meta" role="status">…</p>;
  const today = civilDate(Date.now(), tz);
  const isToday = (r) => today.y === cur.y && today.m === cur.m && today.d === r.d;
  const title = new Intl.DateTimeFormat(nf(locale), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(cur.y, cur.m - 1, 1)));
  const dow = (r) => new Intl.DateTimeFormat(nf(locale), { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(cur.y, cur.m - 1, r.d)));
  const prev = () => setCur((c) => shiftMonth(c, -1));
  const next = () => setCur((c) => shiftMonth(c, 1));
  return (
    <section className="pq-month" aria-label={t('pqTabMonth')}>
      <div className="pq-monthbar">
        <div className="pq-nav pq-noprint">
          <button type="button" className="btn ghost" onClick={prev} aria-label={t('pqPrevMonth')}>‹</button>
          <h2 aria-live="polite">{title}</h2>
          <button type="button" className="btn ghost" onClick={next} aria-label={t('pqNextMonth')}>›</button>
        </div>
        <h2 className="pq-printtitle">{title} · {prefs.loc.name || t('pryMyPos')}</h2>
        <button type="button" className="btn ghost pq-noprint" onClick={() => window.print()}>{t('pqPrint')}</button>
      </div>
      <div className="pq-tablewrap">
        <table className="pq-table">
          <thead>
            <tr><th scope="col">{t('pqDay')}</th><th scope="col">{t('pqHijri')}</th>{['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((id) => <th key={id} scope="col">{t(nameKey(id))}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.d} className={`${isToday(r) ? 'is-today' : ''}${r.white ? ' is-white' : ''}`.trim() || undefined} aria-current={isToday(r) ? 'date' : undefined}>
                <th scope="row">{dow(r)} {r.d}</th>
                <td>{r.hijri.day} {t('pqH' + r.hijri.month)}{r.white ? <span className="pq-badge">{t('pqWhite')}</span> : null}</td>
                {['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((id) => <td key={id} dir="ltr">{fmtTime(r.times[id], tz, locale)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta small">{t('pqHijriNote')} {t('pqWhiteNote')}</p>
    </section>
  );
}

/** Boussole du téléphone : cap de l'appareil lissé. États : off · wait (en attente du capteur) · on · denied · none. */
function useCompass() {
  const [state, setState] = useState('off');
  const [heading, setHeading] = useState(null);
  const ref = useRef({ h: null, off: null, timer: null });
  const stop = useCallback(() => {
    const r = ref.current;
    if (r.off) { r.off(); r.off = null; }
    if (r.timer) { clearTimeout(r.timer); r.timer = null; }
    r.h = null; setHeading(null); setState('off');
  }, []);
  useEffect(() => () => { const r = ref.current; if (r.off) r.off(); if (r.timer) clearTimeout(r.timer); }, []);

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) { setState('none'); return; }
    // iPhone / iPad : l'autorisation se demande au clic, jamais avant.
    const DOE = window.DeviceOrientationEvent;
    if (typeof DOE.requestPermission === 'function') {
      try { const p = await DOE.requestPermission(); if (p !== 'granted') { setState('denied'); return; } } catch { setState('denied'); return; }
    }
    setState('wait');
    const absolute = 'ondeviceorientationabsolute' in window;
    const evName = absolute ? 'deviceorientationabsolute' : 'deviceorientation';
    const onEv = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading; // iOS : cap magnétique direct
      else if (typeof e.alpha === 'number' && (e.absolute || absolute)) h = (360 - e.alpha) % 360; // Android : alpha mesuré depuis le nord
      if (h == null || Number.isNaN(h)) return;
      const rot = (typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle) || 0; // écran tourné
      ref.current.h = smoothHeading(ref.current.h, (h + rot) % 360);
      setHeading(ref.current.h); setState('on');
      if (ref.current.timer) { clearTimeout(ref.current.timer); ref.current.timer = null; }
    };
    window.addEventListener(evName, onEv);
    ref.current.off = () => window.removeEventListener(evName, onEv);
    // Aucune mesure au bout de 2,5 s : pas de capteur (ordinateur, navigateur sans accès).
    ref.current.timer = setTimeout(() => { if (ref.current.h == null) { if (ref.current.off) { ref.current.off(); ref.current.off = null; } setState('none'); } }, 2500);
  }, []);

  return { state, heading, start, stop };
}

function Qibla({ prefs, t, place }) {
  const q = useMemo(() => qibla(prefs.loc.lat, prefs.loc.lon), [prefs.loc.lat, prefs.loc.lon]);
  const compass = useCompass();
  const live = compass.state === 'on' || compass.state === 'wait';
  const rot = compass.state === 'on' && compass.heading != null ? -compass.heading : 0;
  const diff = compass.state === 'on' && compass.heading != null ? turnTo(compass.heading, q.bearing) : null;
  const aligned = diff != null && Math.abs(diff) <= 5;
  const dir = t('pqDir' + compassIndex(q.bearing));
  const toggle = () => (live ? compass.stop() : compass.start());
  const msg = compass.state === 'denied' ? t('pqLiveDenied') : compass.state === 'none' ? t('pqLiveNone') : compass.state === 'wait' ? t('pqLiveWait')
    : diff == null ? t('pqLiveIdle') : aligned ? t('pqAimOk') : (diff > 0 ? t('pqTurnR') : t('pqTurnL')).replace('{deg}', String(Math.round(Math.abs(diff))));
  return (
    <div className="pq-grid">
      <section className="pq-qibla" aria-label={t('pqQTitle')}>
        <svg className={`pq-dial${aligned ? ' is-aligned' : ''}`} width="280" height="280" viewBox="0 0 280 280" role="img" aria-label={t('pqQAria').replace('{deg}', String(Math.round(q.bearing))).replace('{dir}', dir)}>
          <circle cx="140" cy="140" r="130" className="pq-ring" />
          <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: '140px 140px', transition: 'transform .25s linear' }}>
            <text x="140" y="34" className="pq-n-main" textAnchor="middle">{t('pqN')}</text>
            <text x="248" y="146" className="pq-n-other" textAnchor="middle">{t('pqE')}</text>
            <text x="140" y="258" className="pq-n-other" textAnchor="middle">{t('pqS')}</text>
            <text x="32" y="146" className="pq-n-other" textAnchor="middle">{t('pqW')}</text>
            <g style={{ transform: `rotate(${q.bearing}deg)`, transformOrigin: '140px 140px' }}>
              <path d="M140 52 L152 140 L140 128 L128 140 Z" className="pq-needle" />
              <circle cx="140" cy="46" r="9" className="pq-kaaba" />
            </g>
          </g>
          <circle cx="140" cy="140" r="6" className="pq-hub" />
        </svg>
        <p className="pq-deg" dir="ltr">{q.bearing.toFixed(0)}° <span>{dir}</span></p>
        <p className="meta pq-from">{t('pqQFrom').replace('{place}', place).replace('{deg}', q.bearing.toFixed(0)).replace('{km}', new Intl.NumberFormat('fr-FR').format(q.distanceKm))}</p>
      </section>
      <section className="pq-live" aria-label={t('pqLiveTitle')}>
        <h2>{t('pqLiveTitle')}</h2>
        <p>{t('pqLiveText')}</p>
        <label className="chk pq-switch"><input type="checkbox" role="switch" checked={live} onChange={toggle} /> <span>{t('pqLiveSwitch')}</span></label>
        <p className={`pq-aim${aligned ? ' ok' : ''}`} role="status" aria-live="polite">{msg}</p>
        <p className="meta small">{t('pqLiveHelp')}</p>
      </section>
    </div>
  );
}
