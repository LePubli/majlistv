// Petit registre d'actions à lancer à la déconnexion (évite un lien direct entre la session et les modules de l'application).
const logoutHooks = new Set<() => Promise<void> | void>();
export const onLogout = (fn: () => Promise<void> | void) => { logoutHooks.add(fn); return () => { logoutHooks.delete(fn); }; };
export async function runLogoutHooks() { for (const fn of [...logoutHooks]) { try { await fn(); } catch { /* une action qui échoue n'empêche pas la déconnexion */ } } }

// Vérification manuelle de la mise à jour (bouton de l'écran Compte) : le composant AppUpdate s'y enregistre, l'écran Compte la déclenche.
import type { UpdateCheckResult } from '@/lib/appUpdate';
let updateChecker: (() => Promise<UpdateCheckResult>) | null = null;
export const registerUpdateChecker = (fn: () => Promise<UpdateCheckResult>) => { updateChecker = fn; return () => { if (updateChecker === fn) updateChecker = null; }; };
export const runUpdateCheck = (): Promise<UpdateCheckResult> => (updateChecker ? updateChecker() : Promise.resolve({ kind: 'unsupported' }));
