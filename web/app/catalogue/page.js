'use client';
// Étape B — Catalogue « Netflix » : une grande bannière (vidéos à la une), puis une rangée horizontale par format
// (Nouveautés, Vidéos, Cours, Récitations…). « Tout voir » ouvre la grille d'un format (/catalogue?format=cours).
// Étape N4 (16/11) : filtres en puces (formats, thèmes, sous-thèmes) sous la bannière et en haut de chaque grille ; ils se
// combinent (/catalogue?format=cours&cat=12). C'est la seule grille par thème du site (« Tout voir » de l'accueil y mène).
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import HomeHero from '../../components/HomeHero';
import Row from '../../components/Row';
import TalkCard from '../../components/TalkCard';
import CatalogueFilters from '../../components/CatalogueFilters';
import { thumbOf, posterHue, posterArt } from '../../lib/thumb';
import { isBlueFamily } from '../../lib/skin';
import PmCatalogue from '../../components/premium/PmCatalogue';

const PAGE = 24;

export default function CataloguePage() {
  const { skin } = useApp();
  if (skin === 'premium') return <PmCatalogue />; // thème Premium : catalogue de la maquette V20
  return <Suspense fallback={<main aria-busy="true" />}><Catalogue /></Suspense>;
}

// Grille d'un format et / ou d'un thème, avec ses filtres et « Afficher la suite ».
// Étape D4 (17/11) — champ de recherche du Catalogue : cherche dans les titres, les intervenants, les descriptions et les
// transcriptions (GET /talks?q=…). L'adresse garde la recherche (/catalogue?q=…) ; champ vidé = retour au Catalogue.
function SearchBox({ value = '', t }) {
  const router = useRouter();
  const [q, setQ] = useState(value);
  useEffect(() => { setQ(value); }, [value]);
  const go = (e) => { e.preventDefault(); const v = q.trim(); router.push(v ? `/catalogue?q=${encodeURIComponent(v)}` : '/catalogue'); };
  return (
    <form className="cg-search" role="search" onSubmit={go}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cgSearchPh')} aria-label={t('cgSearchPh')} maxLength={80} enterKeyHint="search" />
      {q && <button type="button" className="cg-search-x" onClick={() => { setQ(''); if (value) router.push('/catalogue'); }} aria-label={t('cgSearchClear')}>×</button>}
      <button type="submit" className="btn">{t('hmSearch')}</button>
    </form>
  );
}

// Carte « à la une » du Catalogue (thème bleu) : grande image, titre posé dessus.
function FeatureCard({ x, t, big }) {
  const img = thumbOf(x);
  const mins = x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : '';
  return (
    <Link href={`/talks/${x.id}`} className={big ? 'cg-feat big' : 'cg-feat'} style={img ? { backgroundImage: `url(${img})` } : { '--ph-h': posterHue(x.id), '--ph-art': posterArt(x.id) }}>
      <span className="cg-feat-tags"><span className={`badge-inline ${x.access}`}>{t(x.access)}</span>{x.category && <span className="cg-feat-cat">{x.category}</span>}</span>
      <span className="cg-feat-body">
        <strong>{x.title}</strong>
        <span className="cg-feat-meta">{[x.speaker, mins].filter(Boolean).join(' · ')}</span>
        {big && x.summary && <span className="cg-feat-sum">{x.summary}</span>}
      </span>
    </Link>
  );
}

function Grid({ params, title, format, cat, t, call, bare = false, search = null }) {
  const [talks, setTalks] = useState(null);
  const [more, setMore] = useState(false);
  const key = params.toString();
  const load = useCallback(async (offset) => {
    const q = new URLSearchParams(params);
    q.set('limit', PAGE); q.set('offset', offset);
    const r = await call('/talks?' + q, {}, null);
    const rows = r.ok ? r.data : [];
    setMore(rows.length === PAGE);
    return rows;
  }, [key, call]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let dead = false; setTalks(null); load(0).then((r) => { if (!dead) setTalks(r); }); return () => { dead = true; }; }, [load]);
  const body = (
    <>
      {talks && talks.length === 0 && <p className="soon">{search !== null ? t('cgNoResult') : t('noTalks')}</p>}
      <div className="grid" aria-busy={talks === null}>{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
      {more && <p className="more"><button type="button" className="btn ghost" onClick={async () => setTalks([...talks, ...(await load(talks.length))])}>{t('ctMore')}</button></p>}
    </>
  );
  if (bare) return body; // grille « Toutes les vidéos » posée dans la page du Catalogue (thème bleu)
  return (
    <main className="catalogue">
      <div className="cat-bar">
        <Link href="/catalogue" className="btn ghost">{t('cgBack')}</Link>
        <h1>{title}</h1>
      </div>
      {search !== null && <SearchBox value={search} t={t} />}
      <CatalogueFilters format={format} cat={cat} />
      {body}
    </main>
  );
}

function Catalogue() {
  const { t, call, ready, user, trialDays, formatName, allCats: cats, skin } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const fmt = sp.get('format') || '';
  const cat = sp.get('cat') || '';
  const q = (sp.get('q') || '').trim().slice(0, 80);
  const [data, setData] = useState(null); // { hero, rows }
  useEffect(() => {
    if (!ready || fmt || cat || q) return;
    call('/catalogue').then((r) => setData(r.ok ? r.data : { hero: { fallback: true, items: [] }, rows: [] }));
  }, [call, ready, fmt, cat]);

  if (q) {
    const params = new URLSearchParams({ q });
    return <Grid key={params.toString()} params={params} title={t('cgResults').replace('{q}', q)} format="" cat="" t={t} call={call} search={q} />;
  }
  if (fmt || cat) {
    const c = cats.find((x) => String(x.id) === cat);
    const params = new URLSearchParams();
    if (fmt) params.set('format', fmt);
    if (cat) params.set('category', cat);
    const title = [fmt ? (formatName(fmt) || fmt) : '', cat && c ? (c.fullName || c.name) : ''].filter(Boolean).join(' · ');
    return <Grid key={params.toString()} params={params} title={title} format={fmt} cat={cat} t={t} call={call} />;
  }
  if (!data) return <main aria-busy="true" className="catalogue" />;
  const hero = data.hero?.items?.length ? { mode: 'featured', items: data.hero.items } : { mode: 'text' };
  // Étape D4 (17/11) — thème « Mejliss bleu » : page de catalogue (et non une deuxième page d'accueil). Titre et recherche,
  // filtres, mosaïque « À la une » (une grande carte et jusqu'à quatre petites), une rangée par format, puis toutes les vidéos.
  if (isBlueFamily(skin)) {
    const feat = data.hero?.items || [];
    return (
      <main className="catalogue cg-stream">
        <header className="cg-top">
          <h1>{t('cgTitle')}</h1>
          <SearchBox t={t} />
        </header>
        <CatalogueFilters />
        {feat.length > 0 && (
          <section className="cg-mosaic-wrap" aria-labelledby="cg-feat-title">
            <h2 id="cg-feat-title">{t('cgFeatured')}</h2>
            <div className={`cg-mosaic n${Math.min(feat.length, 5)}`}>
              {feat.slice(0, 5).map((x, i) => <FeatureCard key={x.id} x={x} t={t} big={i === 0} />)}
            </div>
          </section>
        )}
        {data.rows.filter((r) => r.format).map((r) => (
          <Row key={r.key} id={`row-${r.key.replace(':', '-')}`} talks={r.talks} t={t} title={formatName(r.format.slug) || r.format.nameFr}
            onSeeAll={r.total > r.talks.length ? () => { router.push(`/catalogue?format=${r.format.slug}`); window.scrollTo({ top: 0 }); } : undefined} />
        ))}
        <section className="cg-all" aria-labelledby="cg-all-title">
          <h2 id="cg-all-title">{t('cgAll')}</h2>
          <Grid params={new URLSearchParams()} t={t} call={call} bare />
        </section>
      </main>
    );
  }
  return (
    <main className="catalogue">
      <HomeHero hero={hero} t={t} user={user} trialDays={trialDays} />
      <CatalogueFilters />
      {data.rows.length === 0 && <p className="soon">{t('cgSoon')}</p>}
      {data.rows.map((r) => (
        <Row key={r.key} id={`row-${r.key.replace(':', '-')}`} talks={r.talks} t={t}
          title={r.format ? (formatName(r.format.slug) || r.format.nameFr) : t('cgNew')}
          onSeeAll={r.format && r.total > r.talks.length ? () => { router.push(`/catalogue?format=${r.format.slug}`); window.scrollTo({ top: 0 }); } : undefined} />
      ))}
    </main>
  );
}
