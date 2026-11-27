'use client';
// Nouveau catalogue, phase 3 — page d'une catégorie (ou sous-catégorie) du catalogue adultes. Les données arrivent déjà lues par le
// serveur (référencement) : en-tête (fil d'Ariane, icône, couleur, image d'en-tête, description), barre de sous-catégories avec leurs
// nombres et « Toutes les vidéos », grille de vidéos, pagination numérotée (?page=), message utile quand il n'y a aucune vidéo.
import Link from 'next/link';
import { useApp } from './Providers';
import TalkCard from './TalkCard';
import { countLabel } from './CategoryTiles';

const hrefOf = (slug, page) => (page > 1 ? `/catalogue/${slug}?page=${page}` : `/catalogue/${slug}`);

export default function CategoryView({ cat, talks, page, pages }) {
  const { t } = useApp();
  const isSub = cat.parentId != null;
  const style = cat.color ? { '--ctg-c': cat.color } : undefined;
  return (
    <main className="catalogue ctg-page" style={style}>
      <nav className="ctg-crumbs" aria-label="Fil d'Ariane">
        <Link href="/catalogue">{t('ctgCatalogue')}</Link>
        {cat.breadcrumbs.map((b, i) => (i === cat.breadcrumbs.length - 1
          ? <span key={b.slug} aria-current="page">{b.name}</span>
          : <Link key={b.slug} href={`/catalogue/${b.slug}`}>{b.name}</Link>))}
      </nav>
      <header className="ctg-head" style={(cat.heroImage || cat.image) ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.25)), url(${cat.heroImage || cat.image})` } : undefined}>
        <span className="ctg-ico" aria-hidden="true">{cat.icon || '•'}</span>
        <div>
          <h1>{cat.name}</h1>
          {(cat.description || cat.shortDescription) && <p>{cat.description || cat.shortDescription}</p>}
          <span className="ctg-n">{countLabel(t, cat.count)}</span>
        </div>
      </header>

      {cat.children.length > 0 && (
        <nav className="cg-chips ctg-subs" aria-label={t('ctgSubs')}>
          <Link href={`/catalogue/${cat.root.slug}`} className={!isSub ? 'on' : undefined} aria-current={!isSub ? 'true' : undefined}>{t('ctgAll')} <small>{cat.root.count}</small></Link>
          {cat.children.map((c) => (
            <Link key={c.id} href={`/catalogue/${c.slug}`} className={c.id === cat.id ? 'on' : undefined} aria-current={c.id === cat.id ? 'true' : undefined}>{c.name} <small>{c.count}</small></Link>
          ))}
        </nav>
      )}

      {talks.length === 0
        ? <p className="soon ctg-empty">{t('ctgEmpty')}</p>
        : <div className="grid">{talks.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>}

      {pages > 1 && (
        <nav className="ctg-pager" aria-label="Pagination">
          {page > 1 ? <Link href={hrefOf(cat.slug, page - 1)} rel="prev" className="btn ghost">{t('ctgPrev')}</Link> : <span />}
          <span>{t('ctgPage').replace('{n}', String(page)).replace('{m}', String(pages))}</span>
          {page < pages ? <Link href={hrefOf(cat.slug, page + 1)} rel="next" className="btn ghost">{t('ctgNext')}</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
