'use client';
// Pied de page du thème Premium : reproduction du pied de page de la maquette V20 (rangée de liens, puis marque,
// texte et ©). Les liens de la maquette sont remplacés par les vraies pages du site ; les liens légaux restent
// obligatoires. Langue et thème se choisissent ici (un visiteur doit pouvoir quitter le thème sans compte).
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '../Providers';
import SkinPicker from '../SkinPicker';
import { LOCALES } from '../../lib/locales';
import { BrandWord } from './PmBrand';
import { MenuLink } from '../MenuDropdown';
import { defaultList, resolveMenu } from '../../lib/menus';
import { MENUS } from '../../lib/navcfg';
import { pmFooterDefaults } from '../../lib/navDefaults';

export default function PmFooter() {
  const { t, appName, kid, feat, user, locale, layout } = useApp();
  const path = usePathname() || '/';
  const router = useRouter();
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null;
  // Liens d'origine de la maquette ; un menu affecté à « Site — pied de page » (Admin → Menus) les remplace, les trois liens légaux restent obligatoires.
  const D = pmFooterDefaults({ t, feat, user });
  const custom = layout?.menus?.web_footer;
  const links = custom ? resolveMenu(custom, D, { user, lang: locale, required: MENUS.footer.required }) : defaultList(D);
  const setLocale = (e) => {
    document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  return (
    <div className="v20-app v20-part">
      <footer className="v20-footer">
        <nav className="v20-shell v20-mv20-footer-links" aria-label={t('legalNav')}>
          {links.map((l) => <MenuLink key={l.key} it={l} className={l.cls || undefined}>{l.label}</MenuLink>)}
        </nav>
        <div className="v20-shell v20-footer-inner">
          <div className="v20-brand"><img src="/brand/emblem-bleu-s.png" alt="" width="26" height="28" /><BrandWord name={appName} /></div>
          <div>{t('tagline')}</div>
          <div>© {new Date().getFullYear()} {appName}</div>
        </div>
        <div className="v20-shell pm-footer-opts">
          <select value={locale} onChange={setLocale} aria-label={t('languageMenu')}>
            {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <SkinPicker />
        </div>
      </footer>
    </div>
  );
}
