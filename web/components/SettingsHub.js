'use client';
// Admin → Paramètres (étape 28) : accueil des paramètres par thèmes (cartes avec état), recherche d'un réglage, fil d'Ariane.
// Pure présentation : les valeurs, l'enregistrement et les tests de clés restent dans Settings (app/admin/page.js).
import { useMemo } from 'react';

/** Thèmes et sections (identifiants de api/src/settings.js GROUPS). Une section absente d'ici tombe dans « Autres ». */
export const THEMES = [
  { id: 'site', label: 'Site et contenu', groups: ['general', 'home', 'cards', 'citations', 'books'] },
  { id: 'money', label: 'Argent', groups: ['payment', 'gifts', 'revenue', 'ads'] },
  { id: 'ai', label: 'Intelligence artificielle', groups: ['translation', 'insights', 'transcription', 'quiz', 'practice'] },
  { id: 'community', label: 'Communauté et communication', groups: ['email', 'notifications', 'lifecycle', 'moderation', 'kids'] },
  { id: 'tech', label: 'Technique', groups: ['health', 'search', 'external', 'stats', 'activity'] },
];
/** Icône et phrase d'explication de chaque section. */
export const SECTION_META = {
  general: ['⚙️', 'Nom, adresse, aperçu gratuit'], home: ['🏠', 'Bannière du haut de page'], cards: ['🎞️', 'Cartes des conférences'],
  citations: ['📖', 'Versets et hadiths du jour'], books: ['📚', 'Ouvrages liés aux conférences'],
  payment: ['💳', 'Abonnements, essai, taxes'], gifts: ['🎁', 'Montants et validité'], revenue: ['💰', 'Part reversée, seuil de paiement'], ads: ['📣', 'Fréquence, abonnés payants'],
  translation: ['🌐', 'Moteurs et clés'], insights: ['✨', 'Résumés et chapitres automatiques'], transcription: ['🎙️', 'Modèle, langue, cœurs'],
  quiz: ['❓', 'Seuil de réussite, langue'], practice: ['🧭', '« Et maintenant, que faire ? »'],
  email: ['✉️', 'Envoi, expéditeur'], notifications: ['🔔', 'E-mails et téléphone'], lifecycle: ['💌', 'Reprise, bienvenue, retour'], moderation: ['🛡️', 'Relecture, signalements'], kids: ['🧒', 'Espace enfants'],
  search: ['🔎', 'Serveur et clé Meilisearch'], external: ['▶️', 'YouTube, Vimeo, Dailymotion'], stats: ['📊', "Statistiques d'audience"], activity: ['⏱️', 'Limites des tâches lourdes'], health: ['🩺', 'Seuils et destinataires des alertes'],
};
const FALLBACK_THEME = { id: 'other', label: 'Autres', groups: [] };
/** Les réglages propres à chaque module (identifiants « mod_… ») forment un thème à part, en dernier. */
const MODULES_THEME = { id: 'modules', label: 'Réglages des modules', groups: [] };
const isModule = (id) => String(id).startsWith('mod_');
/** Nom affiché d'une section : sans le préfixe « Module : » (le thème le dit déjà). */
export const sectionLabel = (g) => (isModule(g.id) ? String(g.label).replace(/^Module\s*:\s*/i, '') : g.label);

/** Thème d'une section. */
export const themeOf = (id) => THEMES.find((t) => t.groups.includes(id)) || (isModule(id) ? MODULES_THEME : FALLBACK_THEME);
/** Minuscules sans accents, pour la recherche. */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Thèmes à afficher : seulement les sections existantes (certaines dépendent des modules activés), les inconnues dans « Autres ». */
export function themesFor(groups) {
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  const out = THEMES.map((t) => ({ ...t, items: t.groups.map((id) => byId[id]).filter(Boolean) })).filter((t) => t.items.length);
  const known = new Set(THEMES.flatMap((t) => t.groups));
  const rest = groups.filter((g) => !known.has(g.id) && !isModule(g.id));
  if (rest.length) out.push({ ...FALLBACK_THEME, items: rest });
  const mods = groups.filter((g) => isModule(g.id));
  if (mods.length) out.push({ ...MODULES_THEME, items: mods });
  return out;
}

/** Réglages dont le nom, l'aide ou la section correspondent à la recherche. */
export function searchFields(fields, groups, query, limit = 14) {
  const q = norm(query).trim();
  if (q.length < 2) return [];
  const label = Object.fromEntries(groups.map((g) => [g.id, g.label]));
  return fields
    .filter((f) => !f.hidden && label[f.group] && norm(`${f.label} ${f.help || ''} ${f.key} ${label[f.group]}`).includes(q))
    .slice(0, limit)
    .map((f) => ({ key: f.key, label: f.label, group: f.group, groupLabel: label[f.group] }));
}

const BADGE = { ok: 'set-badge ok', warn: 'set-badge warn', error: 'set-badge err', off: 'set-badge off' };
const ICON = { ok: '●', warn: '▲', error: '✕', off: '○' };

/** Écran d'accueil : recherche + cartes par thème. */
export function SettingsHub({ groups, fields, statusOf, changedIn, onOpen, query, onQuery, dirtyCount }) {
  const themes = useMemo(() => themesFor(groups), [groups]);
  const q = norm(query).trim();
  const hits = useMemo(() => searchFields(fields, groups, query), [fields, groups, query]);
  const shown = themes.map((t) => ({
    ...t,
    items: q ? t.items.filter((g) => norm(`${g.label} ${(SECTION_META[g.id] || [])[1] || ''} ${isModule(g.id) ? 'module' : ''}`).includes(q)) : t.items,
  })).filter((t) => t.items.length);
  return (
    <div className="set-hub">
      <input type="search" className="set-search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Rechercher un réglage (ex. « Stripe », « aperçu », « Whisper »…)" aria-label="Rechercher un réglage" />
      {dirtyCount > 0 && <p className="set-pending" role="status">{dirtyCount} modification{dirtyCount > 1 ? 's' : ''} non enregistrée{dirtyCount > 1 ? 's' : ''} : ouvre la section marquée « • » pour les enregistrer.</p>}
      {hits.length > 0 && (
        <div className="set-theme">
          <h4 className="set-theme-title">Réglages correspondants</h4>
          <ul className="set-hits">
            {hits.map((h) => <li key={h.key}><button type="button" onClick={() => onOpen(h.group)}><b>{h.label}</b><small>{h.groupLabel}</small></button></li>)}
          </ul>
        </div>
      )}
      {shown.map((t) => {
        const cards = (
          <div className="set-cards">
            {t.items.map((g) => {
              const [state, label] = statusOf(g.id);
              const meta = SECTION_META[g.id] || (isModule(g.id) ? ['🧩', 'Réglages du module'] : ['⚙️', '']);
              return (
                <button key={g.id} type="button" className="set-card" onClick={() => onOpen(g.id)}>
                  <span className="set-ic" aria-hidden="true">{meta[0]}</span>
                  <span className="set-card-main">
                    <b>{sectionLabel(g)}{changedIn(g.id) ? ' •' : ''}</b>
                    <small>{meta[1]}</small>
                    <span className={BADGE[state] || BADGE.ok}><span aria-hidden="true">{ICON[state] || ICON.ok}</span> {label || 'Prêt'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
        // Les réglages des modules sont nombreux : repliés tant qu'on ne cherche rien.
        return t.id === 'modules' ? (
          <details className="set-theme set-fold" key={t.id} open={Boolean(q)}>
            <summary className="set-theme-title">{t.label} ({t.items.length})</summary>
            {cards}
          </details>
        ) : (
          <div className="set-theme" key={t.id}>
            <h4 className="set-theme-title">{t.label}</h4>
            {cards}
          </div>
        );
      })}
      {q && !shown.length && !hits.length && <p className="meta">Aucun réglage ne correspond à « {query} ».</p>}
    </div>
  );
}

/** En-tête d'une section ouverte : retour, thème, sections voisines. */
export function SectionHeader({ section, groups, onOpen, onBack, changedIn }) {
  const theme = themeOf(section);
  // Les sections voisines s'affichent en pastilles, sauf pour les modules (trop nombreux : retour à l'accueil).
  const siblings = theme.id === 'modules' ? [] : (theme.id === 'other' ? groups : theme.groups.map((id) => groups.find((g) => g.id === id)).filter(Boolean)).filter((g) => theme.groups.includes(g.id) || (theme.id === 'other' && !THEMES.some((t) => t.groups.includes(g.id)) && !isModule(g.id)));
  const current = groups.find((g) => g.id === section);
  return (
    <div className="set-head">
      <nav className="set-crumb" aria-label="Fil d'Ariane">
        <button type="button" className="link" onClick={onBack}>← Paramètres</button>
        <span aria-hidden="true"> / </span><span>{theme.label}</span>
      </nav>
      <h3 className="set-title">{current ? sectionLabel(current) : ''}</h3>
      {siblings.length > 1 && (
        <div className="set-pills" role="group" aria-label={`Sections de « ${theme.label} »`}>
          {siblings.map((g) => (
            <button key={g.id} type="button" className={g.id === section ? 'set-pill on' : 'set-pill'} aria-current={g.id === section ? 'page' : undefined} onClick={() => onOpen(g.id)}>
              {sectionLabel(g)}{changedIn(g.id) ? ' •' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
