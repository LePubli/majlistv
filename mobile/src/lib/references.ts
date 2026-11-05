// Références citées (amélioration 3.5) : versets et hadiths validés d'une vidéo (GET /talks/:id/references, même contenu que le site).
export type PublicRef = {
  id: string; kind: 'quran' | 'hadith'; label: string; startMs: number | null; ar: string; fr: string; credit: string; grade: string; unidentified?: boolean;
};
/** Les références s'affichent-elles ? Fonction activée, vidéo déverrouillée, au moins une référence validée. */
export function showReferences(talk: { locked?: boolean; references?: { available: boolean } }, featureOn: boolean): boolean {
  return featureOn && !talk.locked && Boolean(talk.references?.available);
}
/** Ligne de crédit : traduction / recueil, puis degré d'authenticité si la source en donne un. */
export function creditLine(r: Pick<PublicRef, 'credit' | 'grade'>, gradeText: (g: string) => string): string {
  return [r.credit, r.grade ? gradeText(r.grade) : ''].filter(Boolean).join(' · ');
}
/** Texte absent ? (source dite par l'intervenant seulement : on le dit, on n'invente rien). */
export const hasNoText = (r: Pick<PublicRef, 'ar' | 'fr' | 'unidentified'>): boolean => !r.ar && !r.fr && !r.unidentified;
