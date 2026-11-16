'use client';
// Étape N4 (16/11) — filtres du Catalogue : une ligne de formats (Vidéos, Cours, Récitations…) et une ligne de thèmes
// (catégories principales, puis leurs sous-catégories quand un thème en a). Chaque puce est un lien : l'adresse garde le choix
// (/catalogue?format=cours&cat=12), le bouton « retour » du navigateur fonctionne, et les deux filtres se combinent.
// Les catégories viennent de GET /categories (déjà chargées par le site), les formats de GET /formats?used=1 (seulement ceux
// qui ont des contenus). Une ligne avec moins de deux choix n'est pas affichée.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

/** Adresse du Catalogue pour un format et un thème (vides = pas de filtre). */
export const catalogueHref = (format, cat) => {
  const q = new URLSearchParams();
  if (format) q.set('format', format);
  if (cat) q.set('cat', String(cat));
  const s = q.toString();
  return s ? `/catalogue?${s}` : '/catalogue';
};

/** Thème principal d'une catégorie (elle-même si c'est une catégorie principale). */
export const rootOf = (cats, id) => {
  const c = cats.find((x) => String(x.id) === String(id));
  return c ? (c.parentId ?? c.id) : null;
};

export default function CatalogueFilters({ format = '', cat = '' }) {
  const { t, call, allCats: cats, formatName } = useApp();
  const [formats, setFormats] = useState([]);
  useEffect(() => { call('/formats?used=1', {}, null).then((r) => setFormats(r.ok && Array.isArray(r.data) ? r.data : [])); }, [call]);
  const roots = cats.filter((c) => c.parentId == null);
  const root = cat ? rootOf(cats, cat) : null;
  const subs = root ? cats.filter((c) => c.parentId === root) : [];
  const chip = (href, label, on, key) => (
    <Link key={key} href={href} className={on ? 'on' : undefined} aria-current={on ? 'true' : undefined}>{label}</Link>
  );
  if (formats.length < 2 && roots.length < 2) return null;
  return (
    <div className="cg-filters">
      {formats.length >= 2 && (
        <nav className="cg-chips" aria-label={t('cgByFormat')}>
          {chip(catalogueHref('', cat), t('cgAllFormats'), !format, 'all')}
          {formats.map((f) => chip(catalogueHref(f.slug, cat), formatName(f.slug) || f.nameFr, format === f.slug, f.slug))}
        </nav>
      )}
      {roots.length >= 2 && (
        <nav className="cg-chips" aria-label={t('cgByTheme')}>
          {chip(catalogueHref(format, ''), t('cgAllThemes'), !cat, 'all')}
          {roots.map((c) => chip(catalogueHref(format, c.id), c.name, root === c.id, c.id))}
        </nav>
      )}
      {subs.length > 0 && (
        <nav className="cg-chips cg-subs" aria-label={t('cgBySub')}>
          {chip(catalogueHref(format, root), t('cgAllOfTheme').replace('{n}', cats.find((c) => c.id === root)?.name || ''), String(cat) === String(root), 'all')}
          {subs.map((c) => chip(catalogueHref(format, c.id), c.name, String(cat) === String(c.id), c.id))}
        </nav>
      )}
    </div>
  );
}
