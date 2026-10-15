'use client';
// Étape H — Blocs « données du site » de l'accueil des membres (Admin → Pages → Accueil des membres).
//
// Contrairement aux blocs de l'étape I3 (contenu écrit à la main), ceux-ci lisent le catalogue et le compte de la personne :
//   featured     À la une (conférences mises en avant) + carte « Reprendre »
//   mine         une rangée personnelle (à réviser, quiz à rattraper, conférences en cours)
//   channels     chaînes à suivre, avec le bouton « Suivre »
//   collections  cycles, séries d'un intervenant, thèmes du moment
//   dayquote     citation du jour
//   series       rangée de séries
//   catrows      une rangée par grande catégorie (« Pour vous » d'abord)
//   kids         bande Espace Kids
// Chaque bloc se tait quand il n'a rien à montrer (pas de rangée vide). Les textes viennent du dictionnaire (modifiables dans
// Admin → Textes) ; un titre saisi dans le bloc, pour la langue affichée, le remplace.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import Row from './Row';
import SeriesCard from './SeriesCard';
import CitationCard from './CitationCard';
import ChannelAvatar from './ChannelAvatar';
import { KidsBand } from './KidsBanner';
import { useReducedMotion } from './HomeHero';
import { authPath } from '../lib/nav';
import { tx } from '../lib/blocks';

// Titre d'un bloc : celui saisi dans l'éditeur, à défaut le texte du dictionnaire.
const useTitle = (p, lang, key) => {
  const { t } = useApp();
  return tx(p.title, lang) || t(key);
};

function Head({ id, title, href, label }) {
  return (
    <div className="hb-head">
      <h2 id={id} className="hb-title">{title}</h2>
      {href && label && <Link href={href} className="hb-all">{label} →</Link>}
    </div>
  );
}

/* ------------------------------------------------------------------ À la une + Reprendre */
function Resume({ talk }) {
  const { t } = useApp();
  const left = talk.durationMs > 0 ? Math.max(1, Math.ceil((talk.durationMs - talk.positionMs) / 60000)) : 0;
  const pct = talk.durationMs > 0 ? Math.min(100, Math.round((talk.positionMs / talk.durationMs) * 100)) : 0;
  return (
    <aside className="hb-resume" aria-label={t('hbResume')}>
      <h2 className="hb-resume-label">{t('hbResume')}</h2>
      <Link href={`/talks/${talk.id}`} className="hb-resume-card">
        <span className="hb-resume-thumb" style={talk.posterUrl ? { backgroundImage: `url(${talk.posterUrl})` } : undefined}>
          {pct > 0 && <span className="hb-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
        </span>
        <b className="hb-resume-title">{talk.title}</b>
        <span className="hb-resume-who">{[talk.speaker, talk.series?.label || talk.series].filter((x) => typeof x === 'string' && x).join(' · ')}</span>
      </Link>
      {left > 0 && <p className="hb-resume-left">{t('lgLeft').replace('{m}', left)}</p>}
      <Link href={`/talks/${talk.id}`} className="btn ghost hb-resume-btn">{t('hbResumeBtn')}</Link>
    </aside>
  );
}

function FeaturedBlock({ p }) {
  const { t, call, user, ready } = useApp();
  const reduced = useReducedMotion();
  const [items, setItems] = useState(null);
  const [cont, setCont] = useState(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { let dead = false; call('/home/featured', {}, null).then((r) => { if (!dead) setItems(r.ok ? r.data.items : []); }); return () => { dead = true; }; }, [call]);
  const wantResume = p.resume !== 'no';
  useEffect(() => {
    let dead = false;
    if (!ready) return undefined;
    if (user && wantResume) call('/me/continue').then((r) => { if (!dead) setCont(r.ok ? r.data : []); });
    else setCont([]);
    return () => { dead = true; };
  }, [user, ready, wantResume, call]);

  const list = useMemo(() => (items ? (p.layout === 'fixed' ? items.slice(0, 1) : items) : []), [items, p.layout]);
  const n = list.length;
  useEffect(() => {
    if (reduced || paused || n < 2) return undefined;
    const timer = setInterval(() => setI((v) => (v + 1) % n), 8000);
    return () => clearInterval(timer);
  }, [reduced, paused, n, i]);

  if (items === null || cont === null) return <div className="hb-feature hb-wait" aria-busy="true" />;
  if (!n) return null;
  const x = list[Math.min(i, n - 1)];
  const resume = cont.find((c) => !c.nextUp) || cont[0] || null;
  const mins = x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : '';
  return (
    <div className={`hb-feature${resume ? ' has-side' : ''}`}>
      <section className="hb-hero" aria-roledescription={n > 1 ? 'carousel' : undefined} aria-label={t('hbFeatured')}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        {list.map((it, k) => {
          const u = it.posterUrl || (it.source === 'youtube' ? `https://i.ytimg.com/vi/${it.video_ref}/hqdefault.jpg` : null);
          return <div key={it.id} className={`hb-hero-bg${k === i ? ' on' : ''}`} style={u ? { backgroundImage: `url(${u})` } : undefined} aria-hidden="true" />;
        })}
        <div className="hb-hero-shade" aria-hidden="true" />
        <div className="hb-hero-body" aria-live={paused ? 'polite' : 'off'}>
          <span className="hb-eyebrow">{t('hbFeatured')}{x.category ? ` · ${x.category}` : ''}</span>
          <h1>{x.title}</h1>
          <p className="hb-hero-meta">{[x.speaker, mins].filter(Boolean).join(' · ')}</p>
          {x.summary && <p className="hb-hero-sum">{x.summary}</p>}
          <div className="hb-hero-cta">
            <Link href={`/talks/${x.id}`} className="btn btn-lg">▶ {t('watchNow')}</Link>
            <Link href={`/talks/${x.id}`} className="btn ghost btn-lg">{t('moreInfo')}</Link>
          </div>
        </div>
        {n > 1 && (
          <div className="banner-dots hb-dots" role="group">
            {list.map((it, k) => <button key={it.id} type="button" className={k === i ? 'dot on' : 'dot'} aria-label={t('heroGoTo').replace('{n}', k + 1)} aria-current={k === i} onClick={() => setI(k)} />)}
          </div>
        )}
      </section>
      {resume && <Resume talk={resume} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Ma progression */
function MineBlock({ p }) {
  const { t, call, user, ready } = useApp();
  const what = ['review', 'quiz', 'continue'].includes(p.what) ? p.what : 'review';
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let dead = false;
    if (!ready || !user) { setRows([]); return undefined; }
    const path = what === 'review' ? '/me/revision' : what === 'quiz' ? '/me/quiz/todo' : '/me/continue';
    call(path).then((r) => { if (!dead) setRows(r.ok ? (what === 'review' ? r.data.items : r.data) || [] : []); });
    return () => { dead = true; };
  }, [user, ready, what, call]);
  if (!user || !rows.length) return null;
  if (what === 'review') return <Row id="hb-review" title={<>{t('revRow')} · <Link href="/learning">{t('lrTitle')}</Link></>} talks={rows} t={t} />;
  if (what === 'quiz') return <Row id="hb-quiz" title={<>{t('qpTodoRow')} · <Link href="/library">{t('library')}</Link></>} talks={rows} t={t} />;
  return <Row id="hb-continue" title={<>{t('continueWatching')} · <Link href="/library">{t('library')}</Link></>} talks={rows} t={t} progressOf={(x) => (x.durationMs ? x.positionMs / x.durationMs : 0)} />;
}

/* ------------------------------------------------------------------ Chaînes à suivre */
function ChannelsBlock({ p, lang }) {
  const { t, call, user, ready, feat } = useApp();
  const title = useTitle(p, lang, 'hbChannels');
  const [list, setList] = useState(null);
  const [followed, setFollowed] = useState(null); // Set de slugs ; null = pas encore connu
  const [err, setErr] = useState('');
  useEffect(() => { let dead = false; call('/channels', {}, null).then((r) => { if (!dead) setList(r.ok ? r.data : []); }); return () => { dead = true; }; }, [call]);
  useEffect(() => {
    let dead = false;
    if (!ready) return undefined;
    if (!user) { setFollowed(new Set()); return undefined; }
    call('/me/notifications').then((r) => { if (!dead) setFollowed(new Set(r.ok ? r.data.follows.map((f) => f.slug) : [])); });
    return () => { dead = true; };
  }, [user, ready, call]);

  const limit = Number(p.limit) || 5;
  const shown = useMemo(() => {
    if (!list || followed === null) return [];
    const byName = (a, b) => String(a.name).localeCompare(String(b.name));
    const byPop = (a, b) => (b.followers - a.followers) || (b.talks - a.talks) || byName(a, b);
    const sorted = [...list].filter((c) => c.talks > 0);
    if (p.order === 'alpha') sorted.sort(byName);
    else if (p.order === 'popular') sorted.sort(byPop);
    else sorted.sort((a, b) => (Number(followed.has(a.slug)) - Number(followed.has(b.slug))) || byPop(a, b)); // non suivies d'abord
    return sorted.slice(0, limit);
  }, [list, followed, p.order, limit]);

  const toggle = async (slug) => {
    setErr('');
    const on = followed.has(slug);
    const r = await call(`/speakers/${slug}/follow`, { method: on ? 'DELETE' : 'PUT' });
    if (r.ok) setFollowed((s) => { const c = new Set(s); if (on) c.delete(slug); else c.add(slug); return c; });
    else setErr(r.status === 409 ? t('nfFollowMax') : (r.data?.error || t('errGeneric')));
  };
  if (!shown.length) return null;
  return (
    <section aria-labelledby="hb-channels">
      <Head id="hb-channels" title={title} href="/chaines" label={t('hbChannelsAll')} />
      <ul className="hb-channels">
        {shown.map((c) => {
          const on = followed.has(c.slug);
          return (
            <li key={c.slug} className="hb-chan">
              <Link href={`/chaines/${c.slug}`} className="hb-chan-link">
                <ChannelAvatar name={c.name} url={c.avatarUrl} size="lg" />
                <b>{c.name}</b>
                <span className="hb-chan-n">{t('thTalksN').replace('{n}', c.talks)}</span>
              </Link>
              {feat('follow') && (user
                ? <button type="button" className={`hb-follow${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(c.slug)}>{on ? t('nfFollowing') : t('nfFollow')}</button>
                : <Link className="hb-follow" href={authPath('login', '/')}>{t('nfFollow')}</Link>)}
            </li>
          );
        })}
      </ul>
      {err && <p className="error small" role="alert">{err}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ Collections */
function CollectionsBlock({ p, lang }) {
  const { t, call } = useApp();
  const title = useTitle(p, lang, 'colTitle');
  const [list, setList] = useState(null);
  useEffect(() => { let dead = false; call('/collections', {}, null).then((r) => { if (!dead) setList(r.ok ? r.data : []); }); return () => { dead = true; }; }, [call]);
  const shown = (list || []).slice(0, Number(p.limit) || 3);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="hb-cols">
      <Head id="hb-cols" title={title} href="/collections" label={t('hbColAll')} />
      <ul className="hb-cols">
        {shown.map((c) => (
          <li key={c.id}>
            <Link href={`/collections/${c.id}`} className={`hb-col k-${['cycle', 'speaker', 'theme'].includes(c.kind) ? c.kind : 'theme'}`} style={c.posterUrl ? { backgroundImage: `linear-gradient(0deg, rgba(11,9,6,.88), rgba(11,9,6,.25)), url(${c.posterUrl})` } : undefined}>
              <span className="hb-col-kind">{t(`colKind_${c.kind}`)}</span>
              <span className="hb-col-title">{c.title}</span>
              <span className="hb-col-n">{t('thTalksN').replace('{n}', c.talks)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ Citation du jour */
function DayQuoteBlock({ p }) {
  const { t, call } = useApp();
  const [c, setC] = useState(null);
  useEffect(() => { let dead = false; call('/citation/today', {}, null).then((r) => { if (!dead) setC(r.ok ? r.data : null); }); return () => { dead = true; }; }, [call]);
  if (!c) return null;
  return <CitationCard c={c} t={t} framed={p.style !== 'compact'} compact={p.style === 'compact'} />;
}

/* ------------------------------------------------------------------ Séries */
function SeriesBlock({ p, lang }) {
  const { t, call, feat } = useApp();
  const title = useTitle(p, lang, 'rowSeries');
  const [list, setList] = useState(null);
  const limit = Number(p.limit) || 8;
  useEffect(() => { let dead = false; call(`/series?limit=${limit}`, {}, null).then((r) => { if (!dead) setList(r.ok ? r.data : []); }); return () => { dead = true; }; }, [call, limit]);
  if (!feat('series') || !list?.length) return null;
  return <Row id="hb-series" title={<>{title} · <Link href="/series">{t('rowSeeAll')}</Link></>} talks={list} t={t} renderItem={(x) => <SeriesCard series={x} t={t} />} />;
}

/* ------------------------------------------------------------------ Rangées par catégorie */
function CatRowsBlock({ p }) {
  const { t, call, ready } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState([]);
  useEffect(() => { // avec le jeton du compte, les thèmes préférés passent en premier
    let dead = false;
    if (!ready) return undefined;
    call('/home').then((r) => { if (!dead) setRows(r.ok ? r.data.rows.filter((x) => String(x.key).startsWith('cat:')) : []); });
    return () => { dead = true; };
  }, [ready, call]);
  const shown = rows.slice(0, Number(p.max) || 4);
  return shown.map((r) => (
    <Row key={r.key} id={`hb-${r.key.replace(':', '-')}`} talks={r.talks} t={t} title={r.title} badge={r.forYou ? `★ ${t('forYou')}` : null}
      onSeeAll={r.categoryId && r.total > r.talks.length ? () => router.push(`/?cat=${r.categoryId}`) : undefined} />
  ));
}

/* ------------------------------------------------------------------ Bande Kids */
function KidsBlock() {
  const { call } = useApp();
  const [kids, setKids] = useState(null);
  useEffect(() => { let dead = false; call('/home/kids', {}, null).then((r) => { if (!dead) setKids(r.ok ? r.data : null); }); return () => { dead = true; }; }, [call]);
  return <KidsBand data={kids} />;
}

// Dessine un bloc « données du site » ; null si le type n'en fait pas partie.
export function DataBlock({ b, lang }) {
  const p = b.props || {};
  switch (b.type) {
    case 'featured': return <FeaturedBlock p={p} />;
    case 'mine': return <MineBlock p={p} />;
    case 'channels': return <ChannelsBlock p={p} lang={lang} />;
    case 'collections': return <CollectionsBlock p={p} lang={lang} />;
    case 'dayquote': return <DayQuoteBlock p={p} />;
    case 'series': return <SeriesBlock p={p} lang={lang} />;
    case 'catrows': return <CatRowsBlock p={p} />;
    case 'kids': return <KidsBlock />;
    default: return null;
  }
}
