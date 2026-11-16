// Logo Mejliss TV selon le thème (étape D2) : la version dorée d'origine pour « Classique » et « Nuit et or »,
// la version bleue pour « Mejliss bleu » — même dessin, seulement recoloré. Les deux images sont dans la page ;
// la feuille skin-bleu.css masque celle qui ne correspond pas au thème (le thème peut changer sans recharger la page).
// `on` : fond sur lequel le logo est posé dans le thème bleu (« light » : en-tête blanc ; « dark » : pied de page nuit).
export default function BrandImg({ kind = 'emblem', on = 'light', className = '', alt = '', ...rest }) {
  const classic = kind === 'emblem' ? 'emblem-s' : 'wordmark-s';
  const blue = `${kind === 'emblem' ? 'emblem' : 'wordmark'}-bleu${on === 'dark' ? '' : '-clair'}-s`;
  return (
    <>
      <img alt={alt} {...rest} className={`${className} sk-classic`.trim()} src={`/brand/${classic}.png`} />
      <img alt={alt} {...rest} className={`${className} sk-bleu`.trim()} src={`/brand/${blue}.png`} />
    </>
  );
}
