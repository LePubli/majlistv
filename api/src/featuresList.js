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
  { id: 'seasons', group: 'catalog', label: 'Saisons (Ramadan, Hajj, Mawlid, Achoura)', hint: "Bandeau et rangée sur l'accueil pendant les grandes périodes du calendrier hégirien, notification une fois par an (réglages dans Admin → Saisons)",
    rules: [{ re: '^/(seasons|admin/seasons)(/|$)' }] },
  { id: 'athkar', group: 'learning', label: "Compteur d'athkar (Apprentissage)", hint: "Compteur quotidien des dhikr saisis et validés dans Admin → Adhkar, objectif, série de jours, rappel facultatif ; réservé à la formule Apprentissage",
    rules: [{ re: '^/(athkar|admin/athkar)(/|$)' }] },
  { id: 'friday', group: 'catalog', label: 'Vendredi (Al-Kahf, ablutions, prière sur le Prophète)', hint: "Carte sur l'accueil le vendredi, rangée « Vidéos du vendredi » et notification facultative (réglages dans Admin → Vendredi ; désactivé tant qu'il n'est pas réglé)",
    rules: [{ re: '^/(friday|admin/friday)(/|$)' }] },
  { id: 'ramadan', group: 'catalog', label: 'Circuit de Ramadan (30 jours)', hint: "Actions du jour pendant Ramadan (saisies et validées dans Admin → Ramadan), suivi des tarawih, rappel quotidien ; gratuit pour tout membre connecté",
    rules: [{ re: '^/(ramadan|admin/ramadan)(/|$)' }] },
  { id: 'onboarding', group: 'catalog', label: 'Accueil des nouveaux membres', hint: "Écran « Par quoi commencer ? » (3 cartes, une seule fois, nouveaux comptes uniquement) et visite guidée en bulles (relançable depuis le menu du compte)",
    rules: [{ re: '^/me/onboarding(/|$)' }] },
  { id: 'quranplan', group: 'catalog', label: 'Lecture du Coran en 30 jours', hint: "1 juz par jour, case « lu », progression, rappel quotidien facultatif ; gratuit pour tout membre connecté (sur la page Coran)",
    rules: [{ re: '^/quran/(plan|juzs)(/|$)' }] },
  { id: 'quran', group: 'catalog', label: 'Coran (lecteur)', hint: "Texte arabe, traductions, phonétique et tafsir, verset par verset (contenus importés dans Admin → Coran)",
    rules: [{ re: '^/(quran|admin/quran)(/|$)' }] },
  { id: 'collections', group: 'catalog', label: 'Collections', hint: 'Sélections éditoriales de vidéos',
    rules: [{ re: '^/(collections|studio/collections)(/|$)' }] },
  { id: 'books', group: 'catalog', label: 'Ouvrages', hint: 'Livres et PDF liés aux vidéos',
    rules: [{ re: '^/(books|studio/books|studio/books-targets|talks/[^/]+/books|series/[^/]+/books)(/|$)' }] },
  { id: 'audyn', group: 'catalog', label: 'Audyn — livres audio et histoires du soir', hint: 'Contenus audio avec chapitres : livres audio pour les adultes, histoires du soir pour les enfants. Formule « Apprentissage », aperçu gratuit',
    rules: [{ re: '^/(audyn|studio/audyn|studio/audyn-rights|kids/stories|me/kids/profiles/[^/]+/stories)(/|$)' }] },
  // Apprentissage
  { id: 'quiz', group: 'learning', label: 'Quiz', hint: 'Questions après chaque vidéo, avec explication',
    rules: [{ re: '^/(talks/[^/]+/(studio/)?quiz|studio/quiz|me/quiz)(/|$)' }] },
  { id: 'practice', group: 'learning', label: 'Mise en pratique', hint: 'Écran « Et maintenant, que faire ? »', setting: 'practice_enabled' },
  { id: 'references', group: 'learning', label: 'Références citées', hint: 'Versets et hadiths cités dans la vidéo, avec lien vers le passage',
    rules: [{ re: '^/(talks/[^/]+/(studio/)?references|studio/references)(/|$)' }] },
  { id: 'corrections', group: 'learning', label: 'Corrections des sous-titres', hint: 'Les membres proposent une correction d\'une phrase ; l\'organisateur ou un modérateur la valide',
    rules: [{ re: '^/(talks/[^/]+/corrections|studio/corrections)(/|$)' }] },
  { id: 'revision', group: 'learning', label: 'Révision espacée', hint: 'Notions à revoir et rappels',
    rules: [{ re: '^/me/revision(/|$)' }, { re: '^/(talks/[^/]+/)?studio/reminders(/|$)' }] },
  { id: 'memorycards', group: 'learning', label: 'Cartes mémoire', hint: 'Cartes recto/verso tirées des quiz, avec révision espacée',
    rules: [{ re: '^/me/cards(/|$)' }] },
  { id: 'ask', group: 'learning', label: 'Questions sur la vidéo (assistant IA)', hint: 'Le membre « Apprentissage » pose une question ; réponse tirée de la transcription, avec le passage horodaté. Coût IA : plafonds dans Paramètres',
    rules: [{ re: '^/talks/[^/]+/ask(/|$)' }, { re: '^/admin/ask(/|$)' }] },
  { id: 'selfcheck', group: 'learning', label: 'Mon bilan personnel', hint: 'Objectifs et notes privées',
    rules: [{ re: '^/me/(selfcheck|evolution)(/|$)' }] },
  { id: 'learning', group: 'learning', label: 'Parcours et attestations', hint: 'Tableau de bord d\'apprentissage et attestations',
    rules: [{ re: '^/(me/learning|attestations)(/|$)' }] },
  { id: 'notes', group: 'learning', label: 'Notes sur les vidéos', hint: 'Prise de notes pendant la lecture',
    rules: [{ re: '^/(talks/[^/]+/notes|me/notes)(/|$)' }] },
  // Communauté
  { id: 'favorites', group: 'community', label: 'Favoris', hint: 'Cœur sur les vignettes',
    rules: [{ re: '^/me/favorites(/|$)' }] },
  { id: 'watchlater', group: 'community', label: 'À regarder plus tard', hint: 'Liste personnelle distincte des favoris : bouton sur les vignettes et la page de la vidéo, onglet dans Ma bibliothèque, rangée sur l’accueil',
    rules: [{ re: '^/me/watchlater(/|$)' }] },
  { id: 'events', group: 'community', label: 'Événements en direct', hint: 'Annonce de conférences en direct : page des événements, fichier agenda (.ics), « Me rappeler », direct YouTube / Vimeo intégré, rediffusion rattachée à une conférence',
    rules: [{ re: '^/(events|me/events|studio/events)(/|$)' }] },
  { id: 'lists', group: 'community', label: 'Listes de lecture', hint: 'Listes personnelles et partage par lien',
    rules: [{ re: '^/(me/lists|lists/shared)(/|$)' }] },
  { id: 'channels', group: 'catalog', label: 'Chaînes', hint: 'Pages de chaînes (ex-intervenants), propriétaire organisateur, Studio « Ma chaîne »',
    rules: [{ re: '^/(channels|studio/channels|studio/channel-owners)(/|$)' }] },
  { id: 'shorts', group: 'catalog', label: 'Shorts', hint: 'Extraits verticaux publiés par les chaînes : fil vertical, accueil, page de la chaîne ; l\'espace Kids n\'en montre que pour ses vidéos',
    rules: [{ re: '^/(shorts|studio/shorts)(/|$)' }] },
  { id: 'ads', group: 'catalog', label: 'Publicité au lancement de l\'application', hint: 'Publicité plein écran (photo ou vidéo) au lancement de l\'application, passable ; jamais dans l\'espace Kids ni pendant l\'heure de prière. Gérée dans Admin → Publicités',
    rules: [{ re: '^/(ads|admin/campaigns)(/|$)' }] },
  { id: 'experiments', group: 'catalog', label: 'Tests A/B', hint: 'Compare deux versions d\'une zone du site (ex. la bannière de l\'accueil visiteur) et mesure laquelle donne le plus d\'inscriptions. Gérés dans Admin → Tests A/B ; sans test en cours, le site est inchangé',
    rules: [{ re: '^/(xp|admin/experiments)(/|$)' }] },
  { id: 'media_import', group: 'catalog', label: 'Import de vidéos externes', hint: 'Copier chez nous une vidéo YouTube, Vimeo, archive.org ou d\'un autre site (déclaration des droits obligatoire, journal) pour la monter, la doubler et la mettre en extraits',
    rules: [{ re: '^/(talks/[^/]+/import|studio/imports)(/|$)' }] },
  { id: 'follow', group: 'community', label: 'Suivre un intervenant', hint: 'Bouton Suivre, alertes par e-mail et notifications sur téléphone',
    rules: [{ re: '^/me/(notifications|push-token)(/|$)' }, { re: '^/speakers/[^/]+/follow$' }] },
  { id: 'citations', group: 'community', label: 'Citation du jour', hint: 'Verset ou hadith affiché sur l\'accueil',
    rules: [{ re: '^/citation/today$' }] },
  // Étape 22a : site installable (manifeste, service worker, page « Télécharger l'application »). Partie web seulement : aucune route d'API.
  { id: 'webpush', group: 'comms', label: 'Notifications dans le navigateur', hint: 'Les membres peuvent recevoir les notifications (nouveautés, sélection de la semaine, révision) directement dans leur navigateur ou le site installé',
    rules: [{ re: '^/(web-push|me/web-push)(/|$)' }] },
  { id: 'app_install', group: 'access', label: 'Application installable', hint: 'Icône sur l’écran d’accueil, plein écran, page hors connexion, page « Télécharger l’application »' },
  { id: 'prayer', group: 'community', label: 'Prière : pause et horaires', hint: 'Pastille « Prochaine prière » dans l\'en-tête, pause de la lecture à l\'heure de la prière (blocage souple de 10 minutes), horaires calculés par le site selon l\'endroit où se trouve la personne',
    rules: [{ re: '^/me/prayer(/|$)' }] },
  { id: 'appupdates', group: 'access', label: "Mises à jour de l'application", hint: "L'application Android propose le nouvel APK et reçoit les mises à jour de son contenu depuis le serveur (la fabrication sur GitHub publie ici)",
    rules: [{ re: '^/app/(latest|download|updates|publish)(/|$)' }] },
  { id: 'offline', group: 'access', label: 'Hors connexion (application)', hint: "L'application Android permet de télécharger une vidéo (audio ou vidéo) pour la regarder sans connexion ; réservé aux abonnés, valable une durée réglable",
    rules: [{ re: '^/me/offline(/|$)' }] },
  { id: 'kids', group: 'community', label: 'Mejliss Kids', hint: 'Univers enfants séparé', setting: 'kids_enabled' },
  { id: 'showcase', group: 'access', label: 'Vitrine visiteur', hint: 'Page d\'accueil des visiteurs non connectés : méthode, exemple de vidéo avec quiz, tarifs',
    rules: [{ re: '^/showcase$' }] },
  { id: 'stats', group: 'community', label: 'Statistiques d\'audience', hint: 'Mesure anonyme des vues', setting: 'stats_enabled' },
  // Argent
  { id: 'gifts', group: 'money', label: 'Cartes cadeaux', hint: 'Offrir un abonnement', setting: 'gift_enabled' },
  { id: 'regional_pricing', group: 'money', label: 'Tarifs par pays', hint: 'Prix adaptés au pays choisi par le membre sur la page Abonnement (groupes définis dans Admin → Tarifs par pays)',
    rules: [{ re: '^/admin/pricing-regions(/|$)' }] },
  { id: 'referral', group: 'money', label: 'Parrainage', hint: 'Lien personnel : un mois offert au parrain et au filleul au premier paiement du filleul',
    rules: [{ re: '^/(me/referral|admin/referrals)(/|$)' }] },
  { id: 'revenue', group: 'money', label: 'Rémunération des chaînes', hint: 'Partage des abonnements entre les chaînes selon le temps de visionnage ; relevés Studio, clôture mensuelle et suivi des paiements', def: 'false',
    rules: [{ re: '^/(studio|admin)/revenue(/|$)' }] },
  // Communication
  { id: 'weekly', group: 'comms', label: 'Sélection de la semaine', hint: 'E-mail hebdomadaire (pour les membres qui l\'ont demandé)', setting: 'weekly_enabled' },
  { id: 'announce', group: 'comms', label: 'Annonce des nouvelles vidéos', hint: 'E-mail aux abonnés d\'un intervenant', setting: 'notify_speakers_enabled' },
  // Accès
  { id: 'registration', group: 'access', label: 'Inscription ouverte', hint: 'Création de compte par le public',
    rules: [{ re: '^/auth/register$', methods: ['POST'] }] },
  { id: 'maintenance', group: 'access', label: 'Mode maintenance', hint: 'Le site affiche une page d\'attente aux visiteurs ; les administrateurs gardent l\'accès', def: 'false', inverted: true },
];

// Étape M3a : module qui porte chaque fonction (dossier api/src/modules/<module>). Si ce dossier est absent, la fonction est
// considérée comme coupée et disparaît de Admin → Fonctions ; les fonctions sans module (inscription, maintenance) restent au socle.
const MODULE_OF = { weekly: 'follow', announce: 'follow' };
const MODULE_FEATURES = ['series', 'collections', 'books', 'quiz', 'practice', 'references', 'corrections', 'audyn', 'revision', 'selfcheck', 'learning', 'notes', 'favorites', 'lists', 'events',
  'channels', 'shorts', 'follow', 'citations', 'prayer', 'appupdates', 'offline', 'kids', 'showcase', 'stats', 'gifts', 'revenue'];
for (const f of FEATURES) { const m = MODULE_OF[f.id] || (MODULE_FEATURES.includes(f.id) ? f.id : null); if (m) f.module = m; }

export const BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
export const settingKey = (f) => f.setting || `feat_${f.id}`;
