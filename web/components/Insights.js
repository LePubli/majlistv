'use client';
import { useEffect, useState } from 'react';
import { langName } from './Transcript';

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${m}:${String(s % 60).padStart(2, '0')}`;
};

// Résumé, points clés et chapitres cliquables (générés par IA). N'affiche rien tant que rien n'est prêt.
// `tab` ('summary' | 'chapters') choisit le bloc visible (les deux restent montés : une seule requête, chapitre en cours suivi).
// `onData` informe la page de ce qui existe (résumé, chapitres) pour n'afficher que les onglets utiles.
export default function Insights({ talkId, token, preferredLang, videoRef, locale, t, tab = 'all', onData }) {
  const [lang, setLang] = useState(preferredLang);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(-1);
  const [tick, setTick] = useState(0);

  // La langue suit celle du site (changement de langue dans le menu).
  useEffect(() => { setLang(preferredLang); }, [preferredLang]);

  useEffect(() => {
    let off = false;
    fetch(`/api/talks/${talkId}/insights?lang=${encodeURIComponent(lang)}&t=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setData(d); })
      .catch(() => {});
    return () => { off = true; };
  }, [talkId, token, lang, tick]);

  // Résumé de la langue demandée encore en préparation : on réinterroge toutes les 15 secondes.
  const waiting = Boolean(data && data.lang !== lang && (data.pending || []).includes(lang));
  useEffect(() => {
    if (!waiting && !(data && !data.lang && (data.pending || []).length)) return undefined;
    const id = setTimeout(() => setTick((n) => n + 1), 15000);
    return () => clearTimeout(id);
  }, [waiting, data]);

  // Chapitre en cours : le dernier commencé.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !data) return;
    const onTime = () => {
      const ms = video.currentTime * 1000;
      let found = -1;
      data.chapters.forEach((c, i) => { if (c.s <= ms) found = i; });
      setActive(found);
    };
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [data, videoRef]);

  const hasSummary = Boolean(data && data.lang && (data.summary || data.keyPoints.length));
  const hasChapters = Boolean(data && data.lang && data.chapters.length);
  useEffect(() => { if (onData) onData({ summary: hasSummary, chapters: hasChapters }); }, [hasSummary, hasChapters]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !data.lang) return null;
  const jump = (ms) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.play().catch(() => {});
  };
  const rtl = ['ar', 'he', 'fa', 'ur'].includes(data.lang);
  return (
    <section className="insights" dir={rtl ? 'rtl' : 'ltr'}>
      <div hidden={tab !== 'all' && tab !== 'summary'}>
      <div className="transcript-head">
        <h2>{t('summary')}</h2>
        {data.languages.length > 1 && (
          <select value={data.lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}>
            {data.languages.map((l) => <option key={l} value={l}>{langName(l, locale)}</option>)}
          </select>
        )}
      </div>
      {waiting && <p className="meta">{t('summaryTranslating')}</p>}
      <p>{data.summary}</p>
      {data.keyPoints.length > 0 && (
        <>
          <h3>{t('keyPoints')}</h3>
          <ul>{data.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </>
      )}
      </div>
      {data.chapters.length > 0 && (
        <div hidden={tab !== 'all' && tab !== 'chapters'}>
          <h3>{t('chapters')}</h3>
          <ol className="chapters">
            {data.chapters.map((c, i) => (
              <li key={c.s}>
                <button className={i === active ? 'seg on' : 'seg'} onClick={() => jump(c.s)}>
                  <span className="ts">{clock(c.s)}</span> {c.t}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="meta">{t('aiNote')}</p>
    </section>
  );
}
