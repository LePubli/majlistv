// Miniature d'une vidéo (image envoyée, sinon celle de la plateforme) et teinte de l'affiche de secours.
export const thumbOf = (talk) => talk.posterUrl || (talk.source === 'youtube' ? `https://i.ytimg.com/vi/${talk.video_ref}/hqdefault.jpg` : talk.source === 'dailymotion' ? `https://www.dailymotion.com/thumbnail/video/${talk.video_ref}` : null);
// Étape D3 (17/11) : vidéo sans miniature → affiche de secours propre à la vidéo (teinte tirée de son identifiant, titre écrit dessus),
// au lieu d'un rectangle vide ou d'une même image pour tout le monde. Teintes entre 195 et 264 (bleus et violets de la charte).
export const posterHue = (id) => { let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return 195 + (h % 70); };
