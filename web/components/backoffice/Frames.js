'use client';
// Cadre « maquette » des écrans éditoriaux riches (Coran, Adhkar, Ramadan, Saisons, Vendredi) — thème Premium seulement.
// Reprend la composition de la maquette : titre + sous-titre, rangée de chiffres RÉELS, puis un panneau qui accueille
// l'écran existant (toutes ses fonctions sont conservées). Les chiffres viennent d'un GET sur la même route que l'écran.
import { useEffect, useState } from 'react';
import { useApp } from '../Providers';
import { Page, Metrics, Panel } from './Kit';

const listOf = (d) => (Array.isArray(d) ? d : d?.items || d?.resources || d?.seasons || []);

export function Frame({ title, sub, metrics = [], cols = 'three', panelTitle, children }) {
  return (
    <Page title={title} sub={sub}>
      <Metrics cols={cols} items={metrics} />
      <Panel title={panelTitle || title}>
        <div className="bm-frame-body bm-form" style={{ padding: '4px 14px 14px' }}>{children}</div>
      </Panel>
    </Page>
  );
}

// Récupère les données une seule fois pour calculer les chiffres ; si la route échoue (fonction coupée…), pas de chiffres.
function useList(path) {
  const { call } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { let off = false; call(path).then((r) => { if (!off && r.ok) setD(r.data); }); return () => { off = true; }; }, [call, path]);
  return d;
}
const n = (v) => (v === null || v === undefined ? null : v);

export function QuranFrame({ children }) {
  const d = useList('/admin/quran/resources');
  const l = d ? listOf(d) : null;
  return (
    <Frame panelTitle="Ressources et sources" title="Coran — bibliothèque éditoriale" sub="Traductions, récitations et ressources coraniques : import, activation et contrôle des sources."
      metrics={[
        { icon: 'book', label: 'Ressources', value: n(l?.length) },
        { icon: 'check', tone: 'green', label: 'Activées', value: l ? l.filter((x) => x.enabled).length : null },
        { icon: 'globe', label: 'Langues', value: l ? new Set(l.map((x) => x.lang).filter(Boolean)).size : null },
      ]}>{children}</Frame>
  );
}

export function AthkarFrame({ children }) {
  const d = useList('/admin/athkar');
  const l = d ? listOf(d) : null;
  return (
    <Frame panelTitle="Bibliothèque d’invocations" title="Adhkar & invocations" sub="Gérez les textes, sources, traductions et cycles de relecture."
      metrics={[
        { icon: 'book', label: 'Invocations', value: n(l?.length) },
        { icon: 'shield', tone: 'green', label: 'Validées', value: l ? l.filter((x) => x.validated).length : null, note: l && l.length ? `${Math.round((100 * l.filter((x) => x.validated).length) / l.length)} %` : '' },
        { icon: 'clock', tone: 'amber', label: 'Relectures en attente', value: l ? l.filter((x) => !x.validated).length : null, note: 'À traiter' },
      ]}>{children}</Frame>
  );
}

export function RamadanFrame({ children }) {
  const d = useList('/admin/ramadan/items');
  const l = d ? listOf(d) : null;
  return (
    <Frame panelTitle="Éléments du circuit" title="Ramadan — programmation" sub="Construisez le circuit de Ramadan : étapes par jour, publics, textes et relecture." cols="three"
      metrics={[
        { icon: 'video', label: 'Éléments', value: n(l?.length) },
        { icon: 'check', tone: 'green', label: 'Affichés', value: l ? l.filter((x) => x.enabled).length : null },
        { icon: 'clock', tone: 'amber', label: 'À valider', value: l ? l.filter((x) => x.validated === false).length : null },
      ]}>{children}</Frame>
  );
}

export function SeasonsFrame({ children }) {
  const d = useList('/admin/seasons');
  const l = d ? listOf(d) : null;
  return (
    <Frame panelTitle="Pages de saison" title="Saisons & temps forts" sub="Anticipez les pages de saison : période, collection associée, notification."
      metrics={[
        { icon: 'calendar', label: 'Saisons', value: n(l?.length) },
        { icon: 'check', tone: 'green', label: 'Activées', value: l ? l.filter((x) => x.enabled).length : null },
        { icon: 'clock', tone: 'amber', label: 'Visibles maintenant', value: l ? l.filter((x) => x.status?.active && x.enabled).length : null },
      ]}>{children}</Frame>
  );
}

export function FridayFrame({ children }) {
  const d = useList('/admin/friday');
  return (
    <Frame panelTitle="Carte du vendredi" title="Vendredi — espace éditorial" sub="Planifiez la carte du vendredi, ses rappels et les ressources de la semaine."
      metrics={[
        { icon: 'check', tone: d?.enabled ? 'green' : 'amber', label: 'Carte du vendredi', value: d ? (d.enabled ? 'Activée' : 'Désactivée') : null },
        { icon: 'bell', label: 'Notification', value: d ? (d.notify ? `${String(d.notifyHour).padStart(2, '0')} h` : 'Aucune') : null },
        { icon: 'clock', label: 'Aujourd’hui', value: d?.today ? (d.today.isFriday ? 'Vendredi' : 'Pas vendredi') : null },
      ]}>{children}</Frame>
  );
}
