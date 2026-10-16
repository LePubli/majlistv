'use client';
// Étape B — Catalogue « Netflix » : une grande bannière (conférences à la une), puis une rangée horizontale par format
// (Nouveautés, Conférences, Cours, Récitations…). Pas de filtres : « Tout voir » ouvre la grille d'un format
// (/catalogue?format=cours) et une catégorie du menu latéral ouvre sa grille (/catalogue?cat=12).
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import HomeHero from '../../components/HomeHero';
import Row from '../../components/Row';
import TalkCard from '../../components/TalkCard';

const PAGE = 24;

export default function CataloguePage() {
  return <Suspense fallback={<main aria-busy="true" />}><Catalogue /></Suspense>;
}

// Grille d'un format ou d'une catégorie, avec « Afficher la suite ».
function Grid({ params, title, t, call }) {
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
      {talks && talks.length === 0 && <p className="soon">{t('noTalks')}</p>}
      <div className="grid">{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
      {more && <p className="more"><button type="button" className="btn ghost" onClick={async () => setTalks([...talks, ...(await load(talks.length))])}>{t('ctMore')}</button></p>}
    </main>
  );
}

function Catalogue() {
  const { t, call, ready, user, trialDays, formatName } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const fmt = sp.get('format') || '';
  const cat = sp.get('cat') || '';
  const [data, setData] = useState(null); // { hero, rows }
  const [cats, setCats] = useState([]);
  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  useEffect(() => {
    if (!ready || fmt || cat) return;
    call('/catalogue').then((r) => setData(r.ok ? r.data : { hero: { fallback: true, items: [] }, rows: [] }));
  }, [call, ready, fmt, cat]);

  if (fmt) return <Grid params={new URLSearchParams({ format: fmt })} title={formatName(fmt) || fmt} t={t} call={call} />;
  if (cat) {
    const c = cats.find((x) => String(x.id) === cat);
    return <Grid params={new URLSearchParams({ category: cat })} title={c ? (c.fullName || c.name) : ''} t={t} call={call} />;
  }
  if (!data) return <main aria-busy="true" className="catalogue" />;
  const hero = data.hero?.items?.length ? { mode: 'featured', items: data.hero.items } : { mode: 'text' };
  return (
    <main className="catalogue">
      <HomeHero hero={hero} t={t} user={user} trialDays={trialDays} />
      {data.rows.length === 0 && <p className="soon">{t('cgSoon')}</p>}
      {data.rows.map((r) => (
        <Row key={r.key} id={`row-${r.key.replace(':', '-')}`} talks={r.talks} t={t}
          title={r.format ? (formatName(r.format.slug) || r.format.nameFr) : t('cgNew')}
          onSeeAll={r.format && r.total > r.talks.length ? () => { router.push(`/catalogue?format=${r.format.slug}`); window.scrollTo({ top: 0 }); } : undefined} />
      ))}
    </main>
  );
}
