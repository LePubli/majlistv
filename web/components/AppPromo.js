'use client';
// Encart « Télécharger l'application » du menu latéral (ordinateur) et du menu ☰ (téléphone) : logo de l'application, logos Android et iPhone,
// lien vers /application. Affiché sur le site et dans le site installé (PWA), jamais dans l'application native (qui n'affiche pas ce menu).
// Suit l'interrupteur « app_install » (Admin → Fonctions) ; masqué sur la page /application elle-même.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';

// Logos de plateformes (chemins Simple Icons, domaine public CC0), utilisés pour désigner l'appareil et non comme marques de magasin.
const ANDROID = 'M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396';
const APPLE = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
const Logo = ({ d, label }) => (
  <svg className="app-promo-os" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={label}><title>{label}</title><path d={d} /></svg>
);

export default function AppPromo({ variant = 'side' }) {
  const { t, feat, kid } = useApp();
  const path = usePathname() || '/';
  if (!feat('app_install') || kid || path === '/application' || path.startsWith('/application/')) return null;
  return (
    <div className={`app-promo app-promo-${variant}`}>
      <Link href="/application" className="app-promo-link" title={t('promoTitle')}>
        <img className="app-promo-logo" src="/brand/emblem.png" alt="" width="34" height="36" />
        <span className="app-promo-text">
          <b>{t('promoTitle')}</b>
          <small>{t('promoText')}</small>
        </span>
        <span className="app-promo-os-row" aria-hidden={false}>
          <Logo d={ANDROID} label="Android" />
          <Logo d={APPLE} label="iPhone / iPad" />
        </span>
        <span className="app-promo-cta">{t('promoCta')}</span>
      </Link>
    </div>
  );
}
