// Amélioration 7.2 (étape 3) — Tests A/B dans l'application : règles pures (testées avec Node, sans téléphone).
// L'identifiant du visiteur est un nombre aléatoire gardé dans le coffre du téléphone (aucune donnée personnelle ; le serveur n'en garde que l'empreinte).

export const XP_KEY = 'mejliss.xp';
export const VISITOR_RE = /^[A-Za-z0-9-]{16,64}$/;

export type XpExperiment = { id: string; zone: string; variant: string; texts?: Record<string, Record<string, string>>; options?: Record<string, string> };

/** Nouvel identifiant de visiteur (aléatoire ; 36 caractères). */
export function newVisitorId(rand: () => number = Math.random): string {
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(rand() * 4)]}${h(3)}-${h(12)}`;
}

/** Identifiant lu dans le coffre s'il est valide ; sinon null. */
export function validVisitor(v: string | null | undefined): string | null {
  return v && VISITOR_RE.test(v) ? v : null;
}

/** Test en cours pour une zone (ou null). */
export function pickExperiment(list: XpExperiment[] | null | undefined, zone: string): XpExperiment | null {
  return (Array.isArray(list) ? list : []).find((e) => e && e.zone === zone) || null;
}

/** Texte de la variante dans la langue de l'application, sinon le texte normal. */
export function variantText(exp: XpExperiment | null, locale: string, key: string, fallback: string): string {
  const s = exp?.texts?.[locale]?.[key];
  return typeof s === 'string' && s ? s : fallback;
}
