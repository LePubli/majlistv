// Réduction du bruit : réglages d'afftdn (FFmpeg), les mêmes pour l'écoute d'essai (étape E2) et le rendu (étape E4).
// Fichier sans dépendance (évite une boucle d'imports entre audio.js, timeline.js et dress.js).
export const DENOISE = ['off', 'light', 'strong'];
export const DENOISE_FILTER = { off: null, light: 'afftdn=nr=10:nf=-40:tn=1', strong: 'afftdn=nr=24:nf=-30:tn=1' };
