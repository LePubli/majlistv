'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import ShareCardModal from './ShareCardModal';
import { clockLabel, isRtlText } from '../lib/shareCard';

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${m}:${String(s % 60).padStart(2, '0')}`;
};

// Nom d'une langue dans la langue de l'interface (repli sur le code).
export const langName = (code, locale) => {
  try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || code; } catch { return code; }
};

// Transcription cliquable : un clic saute à l'instant correspondant, la phrase en cours est surlignée.
export default function Transcript({ talkId, token, langs, defaultLang, videoRef, locale, t, shareInfo }) {
  const [lang, setLang] = useState(defaultLang || langs[0]);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(-1);
  const [filter, setFilter] = useState('');
  const box = useRef(null);
  const [share, setShare] = useState(null); // phrase à partager en image

  useEffect(() => {
    let off = false;
    setData(null);
    fetch(`/api/talks/${talkId}/transcript?lang=${encodeURIComponent(lang)}&t=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setData(d); })
      .catch(() => {});
    return () => { off = true; };
  }, [talkId, token, lang]);

  // Suit la lecture : trouve la dernière phrase commencée.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !data) return;
    const onTime = () => {
      const ms = video.currentTime * 1000;
      let lo = 0;
      let hi = data.segments.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (data.segments[mid].s <= ms) { found = mid; lo = mid + 1; } else hi = mid - 1;
      }
      setActive(found);
    };
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [data, videoRef]);

  // Garde la phrase active visible dans le panneau (sans faire défiler la page).
  useEffect(() => {
    const el = box.current?.querySelector(`[data-i="${active}"]`);
    if (!el) return;
    const c = box.current;
    if (el.offsetTop < c.scrollTop || el.offsetTop + el.offsetHeight > c.scrollTop + c.clientHeight) {
      c.scrollTo({ top: el.offsetTop - c.clientHeight / 3, behavior: 'smooth' });
    }
  }, [active]);

  const jump = (ms) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.play().catch(() => {});
  };

  const needle = filter.trim().toLowerCase();
  const rows = useMemo(() => (data ? data.segments.map((s, i) => ({ ...s, i })).filter((s) => !needle || s.t.toLowerCase().includes(needle)) : []), [data, needle]);
  if (!langs.length) return null;
  return (
    <section className="transcript">
      <div className="transcript-head">
        <h2>{t('transcript')}</h2>
        {langs.length > 1 && (
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}>
            {langs.map((l) => <option key={l} value={l}>{langName(l, locale)}</option>)}
          </select>
        )}
      </div>
      <input type="search" placeholder={t('searchTranscript')} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="transcript-body" ref={box} dir={lang === 'ar' || lang === 'he' || lang === 'fa' || lang === 'ur' ? 'rtl' : 'ltr'}>
        {data === null && <p className="meta">…</p>}
        {rows.map((s) => (
          <div key={s.i} className="seg-row">
            <button data-i={s.i} className={s.i === active ? 'seg on' : 'seg'} onClick={() => jump(s.s)}>
              <span className="ts">{clock(s.s)}</span> {s.t}
            </button>
            {shareInfo && <button type="button" className="seg-share" onClick={() => setShare(s)} aria-label={`${t('shImage')} · ${clock(s.s)}`} title={t('shImage')}>↗ {t('shShort')}</button>}
          </div>
        ))}
      </div>
      {share && shareInfo && (
        <ShareCardModal
          card={{ ar: isRtlText(share.t) ? share.t : '', fr: isRtlText(share.t) ? '' : share.t, attribution: [shareInfo.speaker, shareInfo.title].filter(Boolean).join(' — '), kicker: t('shKicker'), stamp: clockLabel(share.s / 1000) }}
          url={`${window.location.origin}/talks/${talkId}?t=${Math.floor(share.s / 1000)}`}
          title={shareInfo.title}
          onClose={() => setShare(null)}
        />
      )}
    </section>
  );
}
