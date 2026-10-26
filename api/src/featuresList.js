// Registre des fonctions du site (étape A) : chaque fonction peut être activée ou désactivée depuis
// Admin → Fonctions et paramètres, sans toucher au code ni aux données.
//
// - `setting` : clé du réglage existant qui commande déjà la fonction (kids_enabled, gift_enabled…).
//   Sans `setting`, un réglage `feat_<id>` est créé automatiquement (voir settings.js).
// - `rules`   : routes de l'API fermées quand la fonction est coupée (expressions sur le chemin, sans la query).
//   Optionnel `methods` pour ne fermer que certaines méthodes. Une fonction sans règle est fermée par le code
//   qui la porte déjà (kids.js, gifts.js, mailers…).
// - `def`     : valeur par défaut (« true » = activée).
//
// Les fonctions à venir (chaînes, rémunération, vitrine…) s'ajoutent ici avec leurs routes : aucune autre
// mécanique n'est à écrire.

export const FEATURE_GROUPS = [
  { id: 'catalog', label: 'Catalogue' },
  { id: 'learning', label: 'Apprentissage' },
  { id: 'community', label: 'Communauté' },
  { id: 'money', label: 'Argent' },
  { id: 'comms', label: 'Communication' },
  { id: 'access', label: 'Accès' },
];

export const FEATURES = [
  // Catalogue
  { id: 'series', group: 'catalog', label: 'Séries et épisodes', hint: 'Regroupements ordonnés en saisons et épisodes',
    rules: [{ re: '^/(series|me/series|studio/series|studio/series-candidates|talks/[^/]+/series)(/|$)' }] },
  { id: 'watch', group: 'catalog', label: 'Veille des chaînes', hint: 'Suivre des chaînes YouTube / Dailymotion / Vimeo et recevoir les nouvelles vidéos dans l\'admin (administrateur seulement)',
    rules: [{ re: '^/admin/watch(/|$)' }] },
  { id: 'collections', group: 'catalog', label: 'Collections', hint: 'Sélections éditoriales de conférences',
    rules: [{ re: '^/(collections|studio/collections)(/|$)' }] },
  { id: 'books', group: 'catalog', label: 'Ouvrages', hint: 'Livres et PDF liés aux conférences',
    rules: [{ re: '^/(books|studio/books|studio/books-targets|talks/[^/]+/books|series/[^/]+/books)(/|$)' }] },
  // Apprentissage
  { id: 'quiz', group: 'learning', label: 'Quiz', hint: 'Questions après chaque conférence, avec explication',
    rules: [{ re: '^/(talks/[^/]+/(studio/)?quiz|studio/quiz|me/quiz)(/|$)' }] },
  { id: 'practice', group: 'learning', label: 'Mise en pratique', hint: 'Écran « Et maintenant, que faire ? »', setting: 'practice_enabled' },
  { id: 'revision', group: 'learning', label: 'Révision espacée', hint: 'Notions à revoir et rappels',
    rules: [{ re: '^/me/revision(/|$)' }, { re: '^/(talks/[^/]+/)?studio/reminders(/|$)' }] },
  { id: 'selfcheck', group: 'learning', label: 'Mon bilan personnel', hint: 'Objectifs et notes privées',
    rules: [{ re: '^/me/(selfcheck|evolution)(/|$)' }] },
  { id: 'learning', group: 'learning', label: 'Parcours et attestations', hint: 'Tableau de bord d\'apprentissage et attestations',
    rules: [{ re: '^/(me/learning|attestations)(/|$)' }] },
  { id: 'notes', group: 'learning', label: 'Notes sur les conférences', hint: 'Prise de notes pendant la lecture',
    rules: [{ re: '^/(talks/[^/]+/notes|me/notes)(/|$)' }] },
  // Communauté
  { id: 'favorites', group: 'community', label: 'Favoris', hint: 'Cœur sur les vignettes',
    rules: [{ re: '^/me/favorites(/|$)' }] },
  { id: 'lists', group: 'community', label: 'Listes de lecture', hint: 'Listes personnelles et partage par lien',
    rules: [{ re: '^/(me/lists|lists/shared)(/|$)' }] },
  { id: 'channels', group: 'catalog', label: 'Chaînes', hint: 'Pages de chaînes (ex-intervenants), propriétaire organisateur, Studio « Ma chaîne »',
    rules: [{ re: '^/(channels|studio/channels|studio/channel-owners)(/|$)' }] },
  { id: 'shorts', group: 'catalog', label: 'Shorts', hint: 'Extraits verticaux publiés par les chaînes : fil vertical, accueil, page de la chaîne ; l\'espace Kids n\'en montre que pour ses conférences',
    rules: [{ re: '^/(shorts|studio/shorts)(/|$)' }] },
  { id: 'ads', group: 'catalog', label: 'Publicité au lancement de l\'application', hint: 'Publicité plein écran (photo ou vidéo) au lancement de l\'application, passable ; jamais dans l\'espace Kids ni pendant l\'heure de prière. Gérée dans Admin → Publicités',
    rules: [{ re: '^/(ads|admin/campaigns)(/|$)' }] },
  { id: 'media_import', group: 'catalog', label: 'Import de vidéos externes', hint: 'Copier chez nous une vidéo YouTube, Vimeo, archive.org ou d\'un autre site (déclaration des droits obligatoire, journal) pour la monter, la doubler et la mettre en extraits',
    rules: [{ re: '^/(talks/[^/]+/import|studio/imports)(/|$)' }] },
  { id: 'follow', group: 'community', label: 'Suivre un intervenant', hint: 'Bouton Suivre, alertes par e-mail et notifications sur téléphone',
    rules: [{ re: '^/me/(notifications|push-token)(/|$)' }, { re: '^/speakers/[^/]+/follow$' }] },
  { id: 'citations', group: 'community', label: 'Citation du jour', hint: 'Verset ou hadith affiché sur l\'accueil',
    rules: [{ re: '^/citation/today$' }] },
  // Étape 22a : site installable (manifeste, service worker, page « Télécharger l'application »). Partie web seulement : aucune route d'API.
  { id: 'app_install', group: 'access', label: 'Application installable', hint: 'Icône sur l’écran d’accueil, plein écran, page hors connexion, page « Télécharger l’application »' },
  { id: 'prayer', group: 'community', label: 'Prière : pause et horaires', hint: 'Pastille « Prochaine prière » dans l\'en-tête, pause de la lecture à l\'heure de la prière (blocage souple de 10 minutes), horaires calculés par le site selon l\'endroit où se trouve la personne',
    rules: [{ re: '^/me/prayer(/|$)' }] },
  { id: 'appupdates', group: 'access', label: "Mises à jour de l'application", hint: "L'application Android propose le nouvel APK et reçoit les mises à jour de son contenu depuis le serveur (la fabrication sur GitHub publie ici)",
    rules: [{ re: '^/app/(latest|download|updates|publish)(/|$)' }] },
  { id: 'offline', group: 'access', label: 'Hors connexion (application)', hint: "L'application Android permet de télécharger une conférence (audio ou vidéo) pour la regarder sans connexion ; réservé aux abonnés, valable une durée réglable",
    rules: [{ re: '^/me/offline(/|$)' }] },
  { id: 'kids', group: 'community', label: 'Mejliss Kids', hint: 'Univers enfants séparé', setting: 'kids_enabled' },
  { id: 'showcase', group: 'access', label: 'Vitrine visiteur', hint: 'Page d\'accueil des visiteurs non connectés : méthode, exemple de conférence avec quiz, tarifs',
    rules: [{ re: '^/showcase$' }] },
  { id: 'stats', group: 'community', label: 'Statistiques d\'audience', hint: 'Mesure anonyme des vues', setting: 'stats_enabled' },
  // Argent
  { id: 'gifts', group: 'money', label: 'Cartes cadeaux', hint: 'Offrir un abonnement', setting: 'gift_enabled' },
  { id: 'revenue', group: 'money', label: 'Rémunération des chaînes', hint: 'Partage des abonnements entre les chaînes selon le temps de visionnage ; relevés Studio, clôture mensuelle et suivi des paiements', def: 'false',
    rules: [{ re: '^/(studio|admin)/revenue(/|$)' }] },
  // Communication
  { id: 'weekly', group: 'comms', label: 'Sélection de la semaine', hint: 'E-mail hebdomadaire (pour les membres qui l\'ont demandé)', setting: 'weekly_enabled' },
  { id: 'announce', group: 'comms', label: 'Annonce des nouvelles conférences', hint: 'E-mail aux abonnés d\'un intervenant', setting: 'notify_speakers_enabled' },
  // Accès
  { id: 'registration', group: 'access', label: 'Inscription ouverte', hint: 'Création de compte par le public',
    rules: [{ re: '^/auth/register$', methods: ['POST'] }] },
  { id: 'maintenance', group: 'access', label: 'Mode maintenance', hint: 'Le site affiche une page d\'attente aux visiteurs ; les administrateurs gardent l\'accès', def: 'false', inverted: true },
];

// Étape M3a : module qui porte chaque fonction (dossier api/src/modules/<module>). Si ce dossier est absent, la fonction est
// considérée comme coupée et disparaît de Admin → Fonctions ; les fonctions sans module (inscription, maintenance) restent au socle.
const MODULE_OF = { weekly: 'follow', announce: 'follow' };
const MODULE_FEATURES = ['series', 'collections', 'books', 'quiz', 'practice', 'revision', 'selfcheck', 'learning', 'notes', 'favorites', 'lists',
  'channels', 'shorts', 'follow', 'citations', 'prayer', 'appupdates', 'offline', 'kids', 'showcase', 'stats', 'gifts', 'revenue'];
for (const f of FEATURES) { const m = MODULE_OF[f.id] || (MODULE_FEATURES.includes(f.id) ? f.id : null); if (m) f.module = m; }

export const BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
export const settingKey = (f) => f.setting || `feat_${f.id}`;
