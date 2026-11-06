// Récitation continue (site) : règles pures, testées. Même logique que l'application (mobile/src/lib/quranQueue.ts).
export const MAX_RETRY = 2; // nouvelles tentatives sur un même verset avant d'afficher l'erreur
export const afterError = (retries) => (retries < MAX_RETRY ? 'retry' : 'fail');
export const retryDelay = (retries) => 800 * (retries + 1);
export const nowPlayingTitle = (suraName, aya, verseWord) => `${suraName} — ${verseWord} ${aya}`;
export const followingAya = (ayas, current, chain) => (chain && ayas.includes(current + 1) ? current + 1 : null);
