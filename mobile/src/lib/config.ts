// Adresses du serveur. Modifiables sans toucher au code :
//  - en développement : variables EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SITE_URL (fichier mobile/.env.local) ;
//  - dans l'application fabriquée : valeurs par défaut de app.json (« extra »).
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; siteUrl?: string };
const clean = (u: string) => u.replace(/\/+$/, '');

export const API_URL = clean(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'https://api-majlisstv.le-publicitaire.fr');
export const SITE_URL = clean(process.env.EXPO_PUBLIC_SITE_URL || extra.siteUrl || 'https://majlisstv.le-publicitaire.fr');
