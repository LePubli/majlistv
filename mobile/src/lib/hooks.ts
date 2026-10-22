// Petit registre d'actions à lancer à la déconnexion (évite un lien direct entre la session et les modules de l'application).
const logoutHooks = new Set<() => Promise<void> | void>();
export const onLogout = (fn: () => Promise<void> | void) => { logoutHooks.add(fn); return () => { logoutHooks.delete(fn); }; };
export async function runLogoutHooks() { for (const fn of [...logoutHooks]) { try { await fn(); } catch { /* une action qui échoue n'empêche pas la déconnexion */ } } }
