// Publicité au lancement (étape 24c) : règles pures (testées avec Node). L'écran est dans components/AdGate.tsx.

export type Ad = { id: string; advertiser: string; title: string; sentence: string; cta: string; linkUrl: string; mediaKind: 'image' | 'video'; mediaUrl: string };
export type AdsReply = { ads: Ad[]; skipSeconds: number; imageSeconds: number };

/** Lien ouvrable : http(s) seulement ; sinon null (jamais javascript:, intent:…). */
export function safeLink(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
}

const num = (v: unknown, def: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);

/** Lit la réponse du serveur sans jamais planter : ne garde que les publicités complètes (visuel, texte, lien http(s)). */
export function parseAds(raw: unknown): AdsReply {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.ads) ? r.ads : [];
  const ads: Ad[] = [];
  for (const a of list as Record<string, unknown>[]) {
    if (!a || typeof a.id !== 'string' || typeof a.mediaUrl !== 'string' || !a.mediaUrl || (a.mediaKind !== 'image' && a.mediaKind !== 'video')) continue;
    const link = safeLink(a.linkUrl);
    if (!link || typeof a.title !== 'string' || !a.title) continue;
    ads.push({
      id: a.id, advertiser: typeof a.advertiser === 'string' ? a.advertiser : '', title: a.title, sentence: typeof a.sentence === 'string' ? a.sentence : '',
      cta: typeof a.cta === 'string' && a.cta ? a.cta : 'En savoir plus', linkUrl: link, mediaKind: a.mediaKind, mediaUrl: a.mediaUrl,
    });
  }
  return { ads, skipSeconds: num(r.skipSeconds, 5, 0, 15), imageSeconds: num(r.imageSeconds, 6, 3, 30) };
}

/** Une publicité n'est montrée ni dans l'espace enfant, ni si la fonction est coupée, ni pendant l'heure de prière. */
export const adAllowed = (o: { featureOn: boolean; isKid: boolean; inPrayer: boolean }): boolean => o.featureOn && !o.isKid && !o.inPrayer;

/** Trop tard pour l'afficher (réponse lente) : la personne est déjà dans l'application, on n'interrompt pas. */
export const tooLate = (sinceLaunchMs: number, maxMs = 6000): boolean => sinceLaunchMs > maxMs;

/** Secondes restantes avant de pouvoir passer (0 = on peut passer). */
export const skipRemaining = (elapsedSec: number, skipSeconds: number): number => Math.max(0, Math.ceil(skipSeconds - elapsedSec));

/** Part (0 à 1) de la barre de progression de la publicité. */
export const adRatio = (elapsedSec: number, totalSec: number): number => (totalSec > 0 && Number.isFinite(elapsedSec) ? Math.min(1, Math.max(0, elapsedSec / totalSec)) : 0);
