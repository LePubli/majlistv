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

const PAGE = 24;

export default function CataloguePage() {
  return <Suspense fallback={<main aria-busy="true" />}><Catalogue /></Suspense>;
}

// Grille d'un format et / ou d'un thème, avec ses filtres et « Afficher la suite ».
function Grid({ params, title, format, cat, t, call }) {
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
  return (
    <main className="catalogue">
      <div className="cat-bar">
        <Link href="/catalogue" className="btn ghost">{t('cgBack')}</Link>
        <h1>{title}</h1>
      </div>
      <CatalogueFilters format={format} cat={cat} />
      {talks && talks.length === 0 && <p className="soon">{t('noTalks')}</p>}
      <div className="grid">{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
      {more && <p className="more"><button type="button" className="btn ghost" onClick={async () => setTalks([...talks, ...(await load(talks.length))])}>{t('ctMore')}</button></p>}
    </main>
  );
}

function Catalogue() {
  const { t, call, ready, user, trialDays, formatName, allCats: cats } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const fmt = sp.get('format') || '';
  const cat = sp.get('cat') || '';
  const [data, setData] = useState(null); // { hero, rows }
  useEffect(() => {
    if (!ready || fmt || cat) return;
    call('/catalogue').then((r) => setData(r.ok ? r.data : { hero: { fallback: true, items: [] }, rows: [] }));
  }, [call, ready, fmt, cat]);

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
