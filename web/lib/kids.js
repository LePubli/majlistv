// Mejliss Kids : avatars (clés stockées côté serveur) et tranches d'âge.
export const AVATAR_EMOJI = { lion: '🦁', owl: '🦉', fox: '🦊', turtle: '🐢', rabbit: '🐰', bear: '🐻', camel: '🐪', star: '⭐' };
export const BANDS = ['3-6', '7-10', '11-14'];
export const bandLabel = (b, t) => ({ '3-6': t('kdBand36'), '7-10': t('kdBand710'), '11-14': t('kdBand1114') }[b] || b);
