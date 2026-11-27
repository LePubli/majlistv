'use client';
// Explorer : recherche + une grande tuile par grand thème (sans sous-thèmes), avec son image, son nom et son nombre de vidéos.
// Données : GET /catalogue/categories (les grands thèmes), chaque tuile mène à /catalogue/<slug>.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import CategoryTiles, { countLabel } from '../../components/CategoryTiles';
import Glyph, { chipGlyph } from '../../components/premium/Glyph';

// Images d'ambiance utilisées quand un thème n'a pas la sienne (tirage stable : même thème = même image).
const FALLBACK = ['learn-bg-1', 'learn-bg-2', 'learn-bg-3', 'learn-bg-4', 'learn-bg-5', 'andalousie-large', 'coran-large', 'caravane-large', 'salahuddin-large', 'al-khwarizmi-large'].map((n) => `/premium/${n}.webp`);

export default function ExplorerClient() {
  const { skin, t, call, locale } = useApp();
  const router = useRouter();
  const [cats, setCats] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { let dead = false; call(`/catalogue/categories?lang=${locale}`, {}, null).then((r) => { if (!dead) setCats(r.ok ? (r.data.categories || []).filter((c) => c.parentId == null) : []); }); return () => { dead = true; }; }, [call, locale]);
  const submit = (e) => { e.preventDefault(); const v = q.trim(); router.push(v ? `/catalogue?q=${encodeURIComponent(v)}` : '/explorer'); };
  const form = (
    <form className="pm-cat-search" role="search" onSubmit={submit}>
      <span aria-hidden="true"><Glyph name="search" /></span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pmSearchPh')} aria-label={t('pmSearchPh')} maxLength={80} enterKeyHint="search" autoComplete="off" />
    </form>
  );
  if (skin !== 'premium') {
    return (
      <main className="container">
        <h1>{t('exTitle')}</h1>
        <p className="meta">{t('exSub')}</p>
        {form}
        <CategoryTiles />
      </main>
    );
  }
  return (
    <div className="v20-app pm-page pm-ott pm-explorer">
      <header className="pm-ex-head">
        <span className="pm-cat-eyebrow">{t('ctEyebrow')}</span>
        <h1>{t('exTitle')}</h1>
        <p>{t('exSub')}</p>
        {form}
      </header>
      <main className="pm-ex-body">
        {cats === null && <p className="pm-ex-empty" aria-busy="true">…</p>}
        {cats && cats.length === 0 && <p className="pm-ex-empty">{t('noResults')}</p>}
        {cats && cats.length > 0 && (
          <ul className="pm-ex-grid">
            {cats.map((c, i) => (
              <li key={c.id}>
                <Link href={`/catalogue/${c.slug}`} className="pm-ex-tile" style={{ '--ex-img': `url("${c.image || FALLBACK[i % FALLBACK.length]}")` }}>
                  <span className="pm-ex-ico" aria-hidden="true"><Glyph name={chipGlyph(c.name)} /></span>
                  <strong>{c.name}</strong>
                  {c.shortDescription && <small>{c.shortDescription}</small>}
                  <span className="pm-ex-n">{countLabel(t, c.count)} <span aria-hidden="true">›</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
