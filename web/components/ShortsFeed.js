'use client';
// Fil vertical de shorts (style « une vidéo par écran ») : défilement qui s'accroche, lecture automatique de la vidéo visible,
// son coupé au départ (exigence des navigateurs) avec un bouton, pause au toucher, flèches et touches ↑ ↓ sur ordinateur.
// Adresses : /shorts (tous), /shorts?channel=<chaîne>, /shorts/<id> (ce short d'abord, puis la suite du fil).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import ChannelAvatar from './ChannelAvatar';

const PAGE = 12;
const MUTE_KEY = 'mejliss-shorts-muted';

export default function ShortsFeed({ firstId, channel }) {
  const { t, call, ready, locale, kid } = useApp();
  const base = kid ? '/kids/shorts' : '/shorts';
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | empty | missing
  const [done, setDone] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const feed = useRef(null);
  const offset = useRef(0);
  const loading = useRef(false);
  const counted = useRef(new Set());
  const videos = useRef({});

  useEffect(() => { try { if (localStorage.getItem(MUTE_KEY) === '0') setMuted(false); } catch { /* stockage indisponible */ } }, []);

  // Hauteur disponible sous l'en-tête du site.
  useEffect(() => {
    const fit = () => {
      const h = document.querySelector('header')?.getBoundingClientRect().bottom || 64;
      const bar = document.querySelector('.ms-bar'); // barre de menu du bas (téléphone, membres connectés)
      const bh = bar && getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect().height : 0;
      feed.current?.parentElement?.parentElement?.style.setProperty('--sh-top', `${Math.max(0, Math.round(h + bh))}px`);
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [state]);

  const more = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset.current) });
    if (channel) q.set('channel', channel);
    const r = await call(`/shorts?${q}`);
    loading.current = false;
    const list = r.ok && Array.isArray(r.data) ? r.data : [];
    offset.current += list.length;
    if (list.length < PAGE) setDone(true);
    setItems((cur) => { const seen = new Set(cur.map((x) => x.id)); return [...cur, ...list.filter((x) => !seen.has(x.id))]; });
  }, [call, channel]);

  // Départ : le short demandé d'abord (s'il y en a un), puis le fil.
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    (async () => {
      let first = null;
      if (firstId) {
        const r = await call(`/shorts/${firstId}`);
        if (dead) return;
        if (!r.ok) { setState('missing'); return; }
        first = r.data;
      }
      offset.current = 0; loading.current = false;
      const q = new URLSearchParams({ limit: String(PAGE), offset: '0' });
      if (channel) q.set('channel', channel);
      const r = await call(`/shorts?${q}`);
      if (dead) return;
      const list = r.ok && Array.isArray(r.data) ? r.data : [];
      offset.current = list.length;
      setDone(list.length < PAGE);
      const all = first ? [first, ...list.filter((x) => x.id !== first.id)] : list;
      setItems(all); setState(all.length ? 'ok' : 'empty');
    })();
    return () => { dead = true; };
  }, [ready, call, firstId, channel]);

  // Le short visible (plus de 60 % de l'écran) devient le short actif.
  useEffect(() => {
    const root = feed.current;
    if (!root || !items.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number(e.target.dataset.i));
    }, { root, threshold: [0.6] });
    root.querySelectorAll('.sh-item').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  // Lecture : seule la vidéo active joue ; la suite du fil se charge à l'approche de la fin.
  useEffect(() => {
    setPaused(false); setProgress(0);
    Object.entries(videos.current).forEach(([i, v]) => {
      if (!v) return;
      if (Number(i) === active) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause();
    });
    if (!done && items.length && active >= items.length - 3) more();
  }, [active, items.length, done, more]);

  // Une vue est comptée après 2 secondes sur un short (une par personne et par jour côté serveur).
  useEffect(() => {
    const s = items[active];
    if (!s || counted.current.has(s.id)) return undefined;
    const id = setTimeout(() => {
      counted.current.add(s.id);
      call(`/shorts/${s.id}/view`, { method: 'POST' }).then((r) => { if (r.ok && r.data?.counted) setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, views: x.views + 1 } : x))); });
    }, 2000);
    return () => clearTimeout(id);
  }, [active, items, call]);

  const goTo = useCallback((i) => {
    const el = feed.current?.querySelector(`.sh-item[data-i="${i}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goTo(Math.min(items.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goTo(Math.max(0, active - 1)); }
      else if (e.key === 'm') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, items.length, goTo]);

  const toggleMute = () => setMuted((m) => { const n = !m; try { localStorage.setItem(MUTE_KEY, n ? '1' : '0'); } catch { /* sans stockage */ } return n; });
  const togglePlay = (i) => {
    const v = videos.current[i]; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
  };

  if (state === 'loading') return <main className="sh-page"><p className="sh-empty">{t('shrLoading')}</p></main>;
  if (state === 'missing') return <main className="sh-page"><div className="sh-empty"><p>{t('shrMissing')}</p><Link href={base} className="btn">{t('shrAll')}</Link></div></main>;
  if (state === 'empty') return <main className="sh-page"><div className="sh-empty"><p>{t('shrNone')}</p><Link href={kid ? '/kids' : '/'} className="btn">{t('shrHome')}</Link></div></main>;

  return (
    <main className="sh-page">
      <div className="sh-stage">
        <div className="sh-feed" ref={feed} role="feed" aria-label={t('shrTitle')} tabIndex={-1}>
          {items.map((s, i) => {
            const near = Math.abs(i - active) <= 1;
            return (
              <article key={s.id} className="sh-item" data-i={i} aria-label={s.title} aria-posinset={i + 1} aria-setsize={done ? items.length : -1}>
                <div className="sh-frame">
                  {near && s.videoUrl ? (
                    <video
                      ref={(el) => { videos.current[i] = el; }} className="sh-video" src={s.videoUrl} poster={s.posterUrl || undefined} loop playsInline muted={muted}
                      preload={i === active ? 'auto' : 'metadata'} onClick={() => togglePlay(i)} aria-label={s.title}
                      onTimeUpdate={(e) => { if (i === active && e.currentTarget.duration) setProgress(e.currentTarget.currentTime / e.currentTarget.duration); }}
                    />
                  ) : <div className="sh-video sh-poster" style={s.posterUrl ? { backgroundImage: `url(${s.posterUrl})` } : undefined} />}
                  {i === active && paused && <span className="sh-paused" aria-hidden="true">▶</span>}
                  <button type="button" className="sh-mute" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? t('shrSoundOn') : t('shrSoundOff')}>{muted ? '🔇' : '🔊'}</button>
                  <div className="sh-info">
                    {s.channel && (
                      <Link href={`/chaines/${s.channel.slug}`} className="sh-chan"><ChannelAvatar name={s.channel.name} url={s.channel.avatarUrl} /><b>{s.channel.name}</b></Link>
                    )}
                    <h2 className="sh-title">{s.title}</h2>
                    <p className="sh-meta">{t('shrViews').replace('{n}', Number(s.views || 0).toLocaleString(locale))}{s.talk.premium && <span className="sh-badge">{t('shrPremium')}</span>}</p>
                    <Link href={kid ? `/kids/watch/${s.talk.id}` : `/talks/${s.talk.id}`} className="btn sh-full">{t('shrFull')}</Link>
                  </div>
                  {i === active && <span className="sh-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>}
                </div>
              </article>
            );
          })}
        </div>
        <div className="sh-nav" role="group" aria-label={t('shrNav')}>
          <button type="button" onClick={() => goTo(active - 1)} disabled={active <= 0} aria-label={t('shrPrev')}>▲</button>
          <button type="button" onClick={() => goTo(active + 1)} disabled={active >= items.length - 1} aria-label={t('shrNext')}>▼</button>
        </div>
      </div>
    </main>
  );
}
