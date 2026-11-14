// Application TV (Android TV / Google TV) : même application que le téléphone ; sur une télé (Platform.isTV), elle affiche ses
// écrans pensés pour la télécommande (dossier src/app/tv). Fonctions pures testées avec Node (tests/tv.test.ts).
import { Platform } from 'react-native';

export const isTV = (): boolean => Boolean((Platform as unknown as { isTV?: boolean }).isTV);

export { fmtTvCode, tvRouteFor, tvRows, audynRows, tvResumeSeconds, tvMenuWidth, tvCardWidth } from './tvRules';
