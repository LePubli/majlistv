// Application TV (Android TV / Google TV) : même application que le téléphone ; sur une télé (Platform.isTV), elle affiche ses
// écrans pensés pour la télécommande (dossier src/app/tv). Fonctions pures testées avec Node (tests/tv.test.ts).
import { Platform } from 'react-native';

export const isTV = (): boolean => Boolean((Platform as unknown as { isTV?: boolean }).isTV) || webTvPreview();

/**
 * Aperçu web des écrans TV (captures d'écran de contrôle, jamais livré) : la version web de l'application, ouverte avec « ?tv=1 »,
 * affiche l'application TV. Sans effet sur Android, Android TV et iOS.
 */
function webTvPreview(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    const g = globalThis as unknown as { location?: { search?: string }; sessionStorage?: Storage };
    if (/[?&]tv=1\b/.test(g.location?.search ?? '')) g.sessionStorage?.setItem('tvPreview', '1');
    return g.sessionStorage?.getItem('tvPreview') === '1';
  } catch { return false; }
}

export { fmtTvCode, tvRouteFor, tvRows, audynRows, tvResumeSeconds, tvMenuWidth, tvCardWidth, tvScale, tvKeyboardKeys, tvKeyApply, tvBackdropUrls, tvClock, tvLeftMin, TV_RAIL, TV_RAIL_OPEN } from './tvRules';
