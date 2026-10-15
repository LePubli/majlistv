// Fonctions activables / désactivables (étape A) : lecture de l'état, garde de routes et routes d'administration.
// Le registre (liste des fonctions et de leurs routes) est dans featuresList.js.
import { z } from 'zod';
import { FEATURES, FEATURE_GROUPS, BY_ID, settingKey } from './featuresList.js';
import { getSetting, saveSettings, isOn } from './settings.js';
import { currentUser } from './userstate.js';

// Une fonction est « activée » quand son réglage vaut oui (la maintenance, elle, est « active » quand il vaut oui).
export async function featureOn(id) {
  const f = BY_ID[id];
  if (!f) throw new Error(`Fonction inconnue : ${id}`);
  return isOn(await getSetting(settingKey(f)));
}

// État de toutes les fonctions : { series: true, quiz: false, … }.
export async function allFeatures() {
  const out = {};
  for (const f of FEATURES) out[f.id] = await featureOn(f.id);
  return out;
}

// Règles compilées une fois : chemin → fonction concernée.
const RULES = FEATURES.flatMap((f) => (f.rules || []).map((r) => ({ id: f.id, re: new RegExp(r.re), methods: r.methods || null })));

// Chemins toujours ouverts pendant la maintenance : santé, configuration, thème (apparence de la page de maintenance), connexion, administration, webhook de paiement.
const MAINTENANCE_OPEN = /^\/(health|config|theme(\/|$)|texts$|pages\/(slots|view|media|public-list)|features|auth\/|admin(\/|$)|billing\/webhook)/;

// À brancher avant l'enregistrement des routes : ferme les routes des fonctions coupées (404) et gère la maintenance (503).
export function registerFeatureGuard(app) {
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return undefined;
    const path = req.url.split('?')[0];

    if (!MAINTENANCE_OPEN.test(path) && (await featureOn('maintenance'))) {
      // Un administrateur connecté garde l'accès pour pouvoir vérifier le site avant de rouvrir.
      let admin = false;
      try {
        await req.jwtVerify();
        const u = await currentUser(req.user.sub, req.user.iat);
        admin = Boolean(u && u.role === 'admin');
      } catch { /* visiteur anonyme ou jeton invalide */ }
      if (!admin) return reply.code(503).send({ error: 'Le site est en maintenance. Revenez dans quelques instants.', code: 'maintenance' });
    }

    for (const r of RULES) {
      if (!r.re.test(path) || (r.methods && !r.methods.includes(req.method))) continue;
      if (!(await featureOn(r.id))) {
        return reply.code(r.id === 'registration' ? 403 : 404).send({ error: r.id === 'registration' ? 'Les inscriptions sont fermées pour le moment.' : 'Fonction indisponible', code: 'feature_off', feature: r.id });
      }
    }
    return undefined;
  });
}

async function describe() {
  const state = await allFeatures();
  return {
    groups: FEATURE_GROUPS,
    features: FEATURES.map((f) => ({ id: f.id, group: f.group, label: f.label, hint: f.hint, enabled: state[f.id], default: (f.def || 'true') === 'true', alert: f.id === 'maintenance' })),
  };
}

export default async function featureRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  // État public : le site masque menus et pages des fonctions coupées.
  app.get('/features', async () => allFeatures());

  app.get('/admin/features', adminOnly, async () => describe());

  // Corps : { values: { quiz: false, series: true } }. Chaque changement est inscrit au journal des actions.
  app.put('/admin/features', adminOnly, async (req, reply) => {
    const { values } = z.object({ values: z.record(z.string(), z.boolean()) }).parse(req.body);
    const ids = Object.keys(values);
    if (!ids.length) return reply.code(400).send({ error: 'Aucune fonction à modifier' });
    const bad = ids.find((k) => !BY_ID[k]);
    if (bad) return reply.code(400).send({ error: `Fonction inconnue : ${bad}` });
    const toSave = {};
    for (const id of ids) toSave[settingKey(BY_ID[id])] = values[id] ? 'true' : 'false';
    await saveSettings(toSave, req.user.sub);
    req.auditSummary = `Fonctions : ${ids.map((id) => `${BY_ID[id].label} ${values[id] ? 'activée' : 'désactivée'}`).join(', ')}`;
    return describe();
  });
}
