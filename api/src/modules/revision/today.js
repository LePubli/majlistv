// Étape B1 — ligne « Aujourd'hui » de la révision espacée : vidéos à réviser aujourd'hui (formule Apprentissage).
import { featureOn } from '../../features.js';
import { hasLearningTier } from '../../access.js';
import { dueTalks } from '../../revision.js';

export async function revisionToday(items, { userId }) {
  if (!(await featureOn('revision')) || !(await hasLearningTier(userId))) return;
  const { total } = await dueTalks(userId, { limit: 1 });
  if (total > 0) items.push({ kind: 'revision', order: 40, n: total, done: false, href: '/learning?tab=rev' });
}
