'use client';
// Administration → « Kids & familles » : vue d'ensemble de l'espace enfant (Mejliss TV Kids), UNIQUEMENT agrégée (GET /admin/kids).
// Vie privée : aucun prénom d'enfant, aucune adresse de parent ; seulement des nombres et les titres publics des vidéos.
// Les réglages détaillés restent chez les parents (Espace parents) et les univers dans Admin → Catégories.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { Page, Metrics, Panel, Cols, Table, Line, Meta, Badge } from './backoffice/Kit';

const n = (v) => Number(v || 0).toLocaleString('fr-FR');
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');
const min = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);

export default function KidsAdmin() {
  const { call, skin } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { call('/admin/kids').then((r) => setD(r.ok ? r.data : { error: r.data?.error || 'Chargement impossible.' })); }, [call]);
  if (!d) return <p className="meta">Chargement…</p>;
  if (d.error) return <p className="error">{d.error}</p>;
  const L = d.limits, U = d.usage, A = d.actions, C = d.catalogue;
  const bandRows = d.byBand.map((b) => [`${b.band} ans`, b.profiles, pct(b.profiles, d.profiles), C.byBand.find((x) => x.band === b.band)?.talks ?? 0]);
  const privacy = 'Ces chiffres sont agrégés : aucun prénom d’enfant ni adresse de parent n’est affiché. Le temps passé est mesuré par le serveur (jamais déclaré par l’enfant).';

  if (skin !== 'premium') {
    return (
      <section>
        <p className="meta">Vue d’ensemble de l’espace Kids. {privacy}</p>
        <div className="admin-cards">
          <div className="admin-card kpi"><strong>{n(d.families)}</strong><span>Familles</span></div>
          <div className="admin-card kpi"><strong>{n(d.profiles)}</strong><span>Profils enfants (+{d.newProfiles30} en 30 jours)</span></div>
          <div className="admin-card kpi"><strong>{n(U.active7)}</strong><span>Enfants actifs (7 jours)</span></div>
          <div className="admin-card kpi"><strong>{n(A.waiting)}</strong><span>Actions à valider par les parents</span></div>
        </div>
        <h2>Par tranche d’âge</h2>
        <div className="st-tablewrap"><table className="st-table"><thead><tr><th>Tranche</th><th>Profils</th><th>Part</th><th>Vidéos</th></tr></thead>
          <tbody>{bandRows.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody></table></div>
        <h2>Usage et contrôle parental</h2>
        <ul className="meta">
          <li>Temps passé (7 jours) : {min(U.minutes7)} dont {min(U.storyMinutes7)} d’histoires du soir ; moyenne {min(U.avgMinutesPerActive7)} par enfant actif.</li>
          <li>Enfants actifs sur 30 jours : {n(U.active30)}.</li>
          <li>Profils avec limite quotidienne : {n(L.withDailyLimit)} ; avec catalogue choisi par le parent : {n(L.selectedCatalog)}.</li>
          <li>Parents avec code parental : {n(L.parentsWithPin)} / {n(d.families)} ; avec rapport par e-mail : {n(L.parentsWithReport)}.</li>
          <li>Quiz passés (30 jours) : {n(d.learning.quizzes30)} ; étoiles et badges gagnés : {n(d.learning.badges30)}.</li>
          <li>Catalogue : {n(C.talks)} vidéo(s) pour enfants dans {n(C.universes)} univers ; {n(C.unclassified)} sans univers (à classer dans Studio).</li>
        </ul>
        <h2>Vidéos les plus regardées (30 jours)</h2>
        {d.top.length === 0 ? <p className="meta">Aucune lecture pour l’instant.</p> : <ul>{d.top.map((t) => <li key={t.id}>{t.title} — {t.viewers} enfant(s)</li>)}</ul>}
      </section>
    );
  }

  return (
    <Page title="Kids & familles" sub="Vue d’ensemble de l’espace enfant : familles, profils, usage, contrôle parental et catalogue. Chiffres agrégés, jamais d’identité.">
      <Metrics items={[
        { icon: 'users', label: 'Familles', value: n(d.families), note: `${n(d.profiles)} profil(s) enfant` },
        { icon: 'heart', tone: 'green', label: 'Enfants actifs (7 j)', value: n(U.active7), note: `${n(U.active30)} sur 30 jours` },
        { icon: 'clock', label: 'Temps passé (7 j)', value: min(U.minutes7), note: U.active7 ? `${min(U.avgMinutesPerActive7)} par enfant actif` : '' },
        { icon: 'shield', tone: A.waiting ? 'amber' : 'blue', label: 'Actions à valider', value: n(A.waiting), note: A.waiting ? 'en attente des parents' : 'rien en attente' },
      ]} />
      <Cols kind="two-main">
        <Panel title="Activité des 14 derniers jours" extra={`${n(d.daily.reduce((s, x) => s + x.minutes, 0))} min`}>
          {d.daily.some((x) => x.active) ? <Line values={d.daily.map((x) => x.active)} labels={d.daily.map((x) => x.day.slice(5).split('-').reverse().join('/'))} /> : <p style={{ padding: 14, color: 'var(--muted)' }}>Aucune activité enfant sur 14 jours.</p>}
          <p className="meta" style={{ padding: '0 14px 14px' }}>Courbe : nombre d’enfants différents actifs chaque jour. {privacy}</p>
        </Panel>
        <Panel title="Contrôle parental">
          <div style={{ padding: '0 14px 14px' }}>
            <Meta items={[
              ['Profils avec limite quotidienne', `${n(L.withDailyLimit)} (${pct(L.withDailyLimit, d.profiles)})`],
              ['Catalogue choisi par le parent', `${n(L.selectedCatalog)} (${pct(L.selectedCatalog, d.profiles)})`],
              ['Parents avec code parental', `${n(L.parentsWithPin)} / ${n(d.families)}`],
              ['Rapport hebdomadaire par e-mail', `${n(L.parentsWithReport)} / ${n(d.families)}`],
              ['Petites actions validées (30 j)', n(A.validated30)],
              ['Histoires du soir (7 j)', min(U.storyMinutes7)],
            ]} />
          </div>
        </Panel>
      </Cols>
      <Cols kind="two-main">
        <Panel title="Par tranche d’âge" extra={`${n(d.profiles)} profils`}>
          <Table headers={['Tranche', 'Profils', 'Part', 'Vidéos autorisées']} rows={bandRows} empty="Aucun profil enfant pour l’instant." />
        </Panel>
        <Panel title="Catalogue Kids">
          <div style={{ padding: '0 14px 14px' }}>
            <Meta items={[
              ['Vidéos pour enfants en ligne', n(C.talks)],
              ['Univers', n(C.universes)],
              ['Sans univers', C.unclassified ? <Badge key="u" tone="amber">{n(C.unclassified)} à classer</Badge> : '0'],
              ['Quiz passés (30 j)', n(d.learning.quizzes30)],
              ['Badges gagnés (30 j)', n(d.learning.badges30)],
            ]} />
            <p className="meta small" style={{ marginTop: 10 }}>Les univers se gèrent dans <Link href="/admin?tab=categories">Catégories</Link>, le classement des vidéos dans Studio → Contenus.</p>
          </div>
        </Panel>
      </Cols>
      <Panel title="Vidéos les plus regardées (30 jours)" extra={`${d.top.length}`}>
        <Table headers={['Vidéo', 'Enfants']} rows={d.top.map((t) => [t.title, t.viewers])} empty="Aucune lecture pour l’instant." />
        <p className="meta" style={{ padding: '0 14px 14px' }}>Nombre d’enfants différents ayant lu la vidéo ; aucun nom. Limites : pas de durée de lecture par vidéo, ni de pays ou d’appareil (non collectés pour les enfants).</p>
      </Panel>
    </Page>
  );
}
