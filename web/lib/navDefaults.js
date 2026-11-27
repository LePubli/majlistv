// Éléments d'origine des menus du thème Premium (en-tête, barre du bas, pied de page) : adresse, texte et condition d'affichage.
// Un menu créé dans Admin → Menus (emplacements « Site — menu du haut / barre du bas / pied de page ») s'appuie sur ces clés
// pour retrouver les éléments « d'origine » qu'il contient (resolveMenu). Sans menu affecté, les listes d'origine ci-dessous servent telles quelles.
//   ctx : { t, feat, hasSeries, hasBooks, user }
export function pmMainDefaults({ t, feat, hasSeries, hasBooks }) {
  return {
    home: { key: 'home', href: '/', label: t('home'), on: true },
    catalogue: { key: 'catalogue', href: '/explorer', label: t('navExplorer'), on: true },
    series: { key: 'series', href: '/series', label: t('seriesNav'), on: hasSeries },
    learning: { key: 'learning', href: '/learning', label: t('navLearn'), on: feat('learning') },
    pratique: { key: 'pratique', href: '/pratique', label: t('pqHub'), on: feat('prayer') || feat('quran') || feat('athkar') || feat('ramadan') },
    prayer: { key: 'prayer', href: '/priere', label: t('pqNav'), on: feat('prayer') },
    shorts: { key: 'shorts', href: '/shorts', label: t('shrTitle'), on: feat('shorts') },
    collections: { key: 'collections', href: '/collections', label: t('colNav'), on: feat('collections') },
    books: { key: 'books', href: '/books', label: t('bkNav'), on: hasBooks },
    livetv: { key: 'livetv', href: '/live', label: t('lvNav'), on: feat('livetv') },
    library: { key: 'library', href: '/library', label: t('library'), on: feat('favorites') || feat('lists') },
    kids: { key: 'kids', href: '/kids', label: t('kdNav'), on: feat('kids') },
  };
}
// Menu du haut d'origine du thème Premium (celui de la maquette) : seuls ces éléments, dans cet ordre.
export const PM_TOP_ORIGIN = ['home', 'catalogue', 'series', 'learning', 'kids'];

// Barre du bas (téléphone) : mêmes éléments d'origine que la maquette ; « Profil » devient « Connexion » pour un visiteur.
export function pmBarDefaults(ctx) {
  const { t, feat, user } = ctx;
  return {
    ...pmMainDefaults(ctx),
    learning: { key: 'learning', href: '/learning', label: t('msLearnShort'), on: feat('learning') },
    account: { key: 'account', href: user ? '/account' : '/login', label: user ? t('pmProfile') : t('login'), on: true },
  };
}
export const PM_BAR_ORIGIN = ['home', 'catalogue', 'learning', 'kids', 'account'];
// Pictogramme de la barre du bas par élément (les éléments ajoutés à la main prennent la grille).
export const PM_BAR_GLYPH = { home: 'home', catalogue: 'grid', learning: 'cap', kids: 'game', account: 'profile', series: 'clapper', shorts: 'clapper', library: 'book', pratique: 'mosque', prayer: 'mosque' };

// Pied de page : liens d'origine du thème Premium (le menu d'Admin → Menus les remplace ; les trois liens légaux restent obligatoires).
export function pmFooterDefaults({ t, feat, user }) {
  return [
    { key: 'account', href: user ? '/account' : '/login', label: user ? t('account') : t('login'), on: true },
    { key: 'pricing', href: '/pricing', label: t('pricing'), on: true },
    { key: 'search', href: '/catalogue', label: t('hmSearch'), on: true },
    { key: 'learning', href: '/learning', label: t('navLearn'), on: feat('learning') },
    { key: 'app', href: '/application', label: t('pwaNav'), on: feat('app_install') },
    { key: 'channels', href: '/chaines', label: t('spTitle'), on: feat('channels') },
    { key: 'mentions', href: '/legal/mentions-legales', label: t('legalNotice'), on: true },
    { key: 'cgv', href: '/legal/cgv', label: t('legalTerms'), on: true },
    { key: 'privacy', href: '/legal/confidentialite', label: t('legalPrivacy'), on: true },
    { key: 'licences', href: '/licences', label: t('licNav'), on: true },
  ];
}
