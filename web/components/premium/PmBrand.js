// Nom de la plateforme écrit comme dans la maquette V20 : « Mejliss » en blanc, « TV » en bleu (balise <span>).
// Le nom vient des réglages (Admin → Paramètres) ; s'il ne finit pas par « TV », il est écrit tel quel.
export function BrandWord({ name = 'Mejliss TV' }) {
  const m = /^(.*?)\s*(TV)$/i.exec(name.trim());
  return m ? <>{m[1]}<span>{m[2]}</span></> : <>{name}</>;
}
