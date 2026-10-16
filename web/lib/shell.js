// Étape B — Où affiche-t-on le menu latéral du membre ?
// Oui : membre connecté (hors espace enfant) sur les pages du site. Non : Studio/Administration (leur propre menu),
// Kids, pages d'entrée/sortie de compte, tarifs, pages légales et pages publiques de partage.
export const NO_SHELL = /^\/(studio|admin|kids|login|register|forgot|reset|welcome|unsubscribe|gift|redeem|pricing|legal|l|attestation)(\/|$)/;

export function memberShellOn(path, user, kid) {
  return Boolean(user) && !kid && !NO_SHELL.test(path || '/');
}
