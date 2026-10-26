// Widgets Android (étape 25) : prépare le dessin d'un widget à partir de son nom. Utilisé par la tâche de fond du widget
// (mise à jour du système, ajout, redimensionnement) et par l'application quand elle demande un rafraîchissement.
import React from 'react';
import { citationView, prayerView, reviseView } from './model';
import { loadCitation, loadLocale, loadPrayerSnap, loadRevise } from './store';
import { CitationLarge, CitationSmall, PrayerLarge, PrayerSmall, ReviseLarge, ReviseSmall } from './ui';

export const WIDGET_NAMES = ['PrayerSmall', 'PrayerLarge', 'ReviseSmall', 'ReviseLarge', 'CitationSmall', 'CitationLarge'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

export async function buildWidget(name: string): Promise<React.JSX.Element> {
  const now = Date.now();
  switch (name as WidgetName) {
    case 'PrayerSmall': return <PrayerSmall v={prayerView(await loadPrayerSnap(), now)} />;
    case 'PrayerLarge': return <PrayerLarge v={prayerView(await loadPrayerSnap(), now)} />;
    case 'ReviseSmall': return <ReviseSmall v={reviseView(await loadRevise(now), await loadLocale())} />;
    case 'ReviseLarge': return <ReviseLarge v={reviseView(await loadRevise(now), await loadLocale())} />;
    case 'CitationSmall': return <CitationSmall v={citationView(await loadCitation(now), await loadLocale(), 'small')} />;
    case 'CitationLarge': return <CitationLarge v={citationView(await loadCitation(now), await loadLocale(), 'large')} />;
    default: return <PrayerSmall v={prayerView(null, now)} />;
  }
}
