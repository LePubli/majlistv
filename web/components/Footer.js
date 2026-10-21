'use client';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import NavLink from './NavLink';
import { LayoutZone } from './PageBlocks';
import { resolveList, audienceOk, deviceClass } from '../lib/menus';
import { defaultFooter, MENUS } from '../lib/navcfg';
import { tx } from '../lib/blocks';

// Pied de page : marque et liens légaux obligatoires, présents sur toutes les pages.
// Étape I4 : les éléments se placent à gauche ou à droite, on peut y ajouter textes et liens, et des blocs peuvent s'afficher au-dessus.
// Les liens légaux ne peuvent ni être masqués ni changer de public ou d'appareil, même par les réglages.
export default function Footer() {
  const { t, appName, kid, feat, layout, user, locale } = useApp();
  const path = usePathname();
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null; // espace enfant : pas de liens hors de Kids
  const nav = layout?.nav;
  const fz = nav?.footer || defaultFooter();
  const links = resolveList(nav?.menus?.footer, [
    { key: 'channels', href: '/chaines', label: t('spTitle'), on: feat('channels') },
    { key: 'app', href: '/application', label: t('pwaNav'), on: feat('app_install') }, // étape 22a
    { key: 'mentions', href: '/legal/mentions-legales', label: t('legalNotice'), on: true },
    { key: 'cgv', href: '/legal/cgv', label: t('legalTerms'), on: true },
    { key: 'privacy', href: '/legal/confidentialite', label: t('legalPrivacy'), on: true },
  ], { user, lang: locale, required: MENUS.footer.required });
  const renderEl = (el) => {
    if (el.key !== 'links' && (el.hidden || !audienceOk(el.show?.audience, user))) return null;
    switch (el.key || el.type) {
      case 'brand': return (
        <span className="footer-brand">
          <img src="/brand/emblem.png" alt="" width="26" height="28" />
          <span>© {new Date().getFullYear()} {appName} · {t('tagline')}</span>
        </span>
      );
      case 'links': return <nav aria-label={t('legalNav')}>{links.map((it) => <NavLink key={it.key} href={it.href} className={it.cls || undefined}>{it.label}</NavLink>)}</nav>;
      case 'text': { const l = tx(el.label, locale); return l ? <span className="ft-text">{l}</span> : null; }
      case 'link': { const l = tx(el.label, locale); return l && el.url ? <NavLink href={el.url}>{l}</NavLink> : null; }
      default: return null;
    }
  };
  const zone = (name) => (fz[name] || []).map((el) => { const n = renderEl(el); return n ? <div key={el.id} className={`ft-el ${el.key === 'links' ? '' : deviceClass(el.show)}`.trim()}>{n}</div> : null; });
  // Sécurité : si les réglages n'ont placé « Liens du pied de page » nulle part, ils s'affichent quand même à droite.
  const placed = [...(fz.left || []), ...(fz.right || [])].some((el) => el.key === 'links');
  return (
    <>
      <div className="site-footer-top"><LayoutZone zone="footerTop" className="pb-footer-top" /></div>
      <footer className="site-footer">
        <div className="ft-zone ft-left">{zone('left')}</div>
        <div className="ft-zone ft-right">{zone('right')}{!placed && renderEl({ id: 'forced', key: 'links' })}</div>
      </footer>
    </>
  );
}
