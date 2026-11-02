// Étape B1 — Bloc « Aujourd'hui » : la liste courte de ce que le membre peut faire aujourd'hui (juz du jour, athkar du moment,
// action de Ramadan, cartes et révisions à faire). Le socle ne connaît pas les modules : chacun ajoute ses lignes via l'événement
// « today.collect » (voir ext.js). Une ligne = { kind, order, done, href, n?, total?, juz?, moment?, day? }.
//   GET /me/today?lang=fr      membre connecté
import * as ext from '../ext.js';
import { parisDay } from '../parisTime.js';

const nowDate = () => (process.env.TODAY_NOW ? new Date(process.env.TODAY_NOW) : new Date());

export default async function todayRoutes(app) {
  app.get('/me/today', { preHandler: app.authenticate }, async (req) => {
    const lang = ['fr', 'en', 'ar'].includes(String(req.query?.lang || '').slice(0, 2)) ? String(req.query.lang).slice(0, 2) : 'fr';
    const items = [];
    await ext.emit('today.collect', items, { userId: req.user.sub, lang, now: nowDate() });
    items.sort((a, b) => (a.done - b.done) || (a.order - b.order));
    return { date: parisDay(nowDate()).date, items, left: items.filter((x) => !x.done).length };
  });
}
