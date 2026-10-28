// Paramètres de l'application modifiables depuis le back-office (table app_settings).
// Valeur utilisée = valeur saisie dans le back-office, sinon variable d'environnement (ancienne méthode), sinon valeur par défaut.
import { pool } from './db.js';
import { cryptoReady, encrypt, decrypt } from './crypto.js';
import { TRANSLATION_LANGS } from './langs.js';
import { FEATURES, settingKey } from './featuresList.js';

export const GROUPS = [
  { id: 'general', label: 'Général' },
  { id: 'ads', label: 'Publicité au lancement' },
  { id: 'home', label: "Page d'accueil" },
  { id: 'cards', label: 'Vignettes des conférences' },
  { id: 'payment', label: 'Paiement (Stripe)' },
  { id: 'email', label: 'E-mails' },
  { id: 'translation', label: 'Traduction des sous-titres' },
  { id: 'insights', label: 'Résumés et chapitres' },
  { id: 'quiz', label: 'Quiz de compréhension' },
  { id: 'ask', label: 'Questions sur la conférence (assistant IA)' },
  { id: 'moderation', label: 'Modération' },
  { id: 'notifications', label: 'Notifications (e-mails et téléphone)' },
  { id: 'lifecycle', label: 'E-mails de cycle de vie (reprise, bienvenue, retour)' },
  { id: 'gifts', label: 'Cartes cadeaux' },
  { id: 'revenue', label: 'Rémunération des chaînes' },
  { id: 'practice', label: 'Mise en pratique (Et maintenant, que faire ?)' },
  { id: 'books', label: 'Ouvrages' },
  { id: 'kids', label: 'Mejliss Kids' },
  { id: 'stats', label: "Statistiques d'audience" },
  { id: 'citations', label: 'Citations (versets et hadiths)' },
  { id: 'transcription', label: 'Transcription (Whisper)' },
  { id: 'external', label: 'Vidéos YouTube, Vimeo et Dailymotion' },
  { id: 'search', label: 'Recherche (Meilisearch)' },
  { id: 'activity', label: 'Activité (tâches lourdes)' },
  { id: 'health', label: 'Santé du serveur' },
];

const PROVIDERS = ['claude', 'azure', 'deepseek'];
// type : text | secret | number | bool | select | langs | url
export const FIELDS = [
  { key: 'app_name', group: 'general', type: 'text', label: 'Nom du site', env: 'APP_NAME', def: 'Mejliss TV' },
  { key: 'web_url', group: 'general', type: 'url', label: 'Adresse publique du site', env: 'WEB_URL',
    help: 'Utilisée pour le retour après paiement (ex. https://majlisstv.le-publicitaire.fr).' },
  { key: 'seo_description', group: 'general', type: 'text', label: 'Description du site (Google et réseaux sociaux)', env: 'SEO_DESCRIPTION',
    def: 'Conférences vidéo sur l\'islam, la religion et l\'histoire : regardez à la demande, avec sous-titres traduits et transcription.',
    help: 'Phrase affichée sous le nom du site dans les résultats de recherche et lors d\'un partage de lien (150 caractères conseillés).' },
  { key: 'preview_seconds', group: 'general', type: 'number', label: "Aperçu gratuit des conférences premium (secondes)", env: 'PREVIEW_SECONDS', def: '120', min: 0, max: 1800 },

  { key: 'home_hero_mode', group: 'home', type: 'select', options: ['featured', 'custom', 'text'], label: 'Bannière du haut de page', env: 'HOME_HERO_MODE', def: 'featured',
    help: 'featured : les conférences mises en avant défilent en bannière · custom : ta propre bannière (image, texte, bouton) · text : simple titre sans image.' },
  { key: 'home_hero_title', group: 'home', type: 'text', label: 'Bannière personnalisée : titre', env: 'HOME_HERO_TITLE', help: 'Vide = titre par défaut du site.' },
  { key: 'home_hero_subtitle', group: 'home', type: 'text', label: 'Bannière personnalisée : texte', env: 'HOME_HERO_SUBTITLE' },
  { key: 'home_hero_cta_label', group: 'home', type: 'text', label: 'Bannière personnalisée : texte du bouton', env: 'HOME_HERO_CTA_LABEL', help: 'Vide = pas de bouton.' },
  { key: 'home_hero_cta_url', group: 'home', type: 'text', label: 'Bannière personnalisée : lien du bouton', env: 'HOME_HERO_CTA_URL', help: 'Ex. /pricing, /register ou https://…' },
  { key: 'home_hero_video_url', group: 'home', type: 'url', label: 'Bannière personnalisée : vidéo d\'ambiance (facultatif)', env: 'HOME_HERO_VIDEO_URL',
    help: 'Adresse d\'un fichier .mp4 / .webm (court, léger, sans son). Jouée en boucle par-dessus l\'image, sauf si le visiteur a demandé de limiter les animations.' },
  { key: 'home_hero_image_key', group: 'home', type: 'text', hidden: true, label: 'Image de bannière (interne)' },
  { key: 'home_row_new', group: 'home', type: 'bool', label: 'Afficher la rangée « Nouveautés »', env: 'HOME_ROW_NEW', def: 'true' },
  { key: 'home_row_beginner', group: 'home', type: 'bool', label: 'Afficher la rangée « Pour commencer » (niveau débutant)', env: 'HOME_ROW_BEGINNER', def: 'true',
    help: 'Reprend les conférences marquées « Débutant » par l\'organisateur. La rangée n\'apparaît que s\'il y en a.' },
  { key: 'home_row_series', group: 'home', type: 'bool', label: 'Afficher la rangée « Séries »', env: 'HOME_ROW_SERIES', def: 'true' },
  { key: 'home_rows_categories', group: 'home', type: 'bool', label: 'Afficher une rangée par catégorie', env: 'HOME_ROWS_CATEGORIES', def: 'true' },
  { key: 'home_row_size', group: 'home', type: 'number', label: 'Nombre de conférences par rangée', env: 'HOME_ROW_SIZE', def: '16', min: 4, max: 40 },

  { key: 'card_hover', group: 'cards', type: 'bool', label: 'Agrandir la vignette au survol (ordinateur)', env: 'CARD_HOVER', def: 'true',
    help: 'La vignette grossit et affiche plus d\'informations quand la souris reste dessus. Sur téléphone et tablette, la vignette reste simple.' },
  { key: 'card_preview', group: 'cards', type: 'bool', label: 'Aperçu vidéo au survol', env: 'CARD_PREVIEW', def: 'true',
    help: 'Si la souris reste sur la vignette, un court extrait muet démarre. Vidéos envoyées : le début de la vidéo (jamais plus que l\'aperçu gratuit). YouTube / Vimeo : seulement pour les conférences gratuites.' },
  { key: 'card_preview_delay', group: 'cards', type: 'number', label: "Délai avant l'aperçu (millisecondes)", env: 'CARD_PREVIEW_DELAY', def: '1500', min: 500, max: 6000 },
  { key: 'card_preview_seconds', group: 'cards', type: 'number', label: "Durée de l'extrait (secondes, rejoué en boucle)", env: 'CARD_PREVIEW_SECONDS', def: '20', min: 5, max: 60 },
  { key: 'card_show_access', group: 'cards', type: 'bool', label: 'Afficher « Gratuit » / « Premium »', env: 'CARD_SHOW_ACCESS', def: 'true' },
  { key: 'card_show_duration', group: 'cards', type: 'bool', label: 'Afficher la durée', env: 'CARD_SHOW_DURATION', def: 'true' },
  { key: 'card_show_speaker', group: 'cards', type: 'bool', label: "Afficher l'intervenant", env: 'CARD_SHOW_SPEAKER', def: 'true' },
  { key: 'card_show_category', group: 'cards', type: 'bool', label: 'Afficher la catégorie', env: 'CARD_SHOW_CATEGORY', def: 'true' },
  { key: 'card_show_language', group: 'cards', type: 'bool', label: 'Afficher la langue (au survol)', env: 'CARD_SHOW_LANGUAGE', def: 'true' },
  { key: 'card_show_description', group: 'cards', type: 'bool', label: 'Afficher un extrait de la description (au survol)', env: 'CARD_SHOW_DESCRIPTION', def: 'true' },
  { key: 'card_show_favorite', group: 'cards', type: 'bool', label: 'Afficher le bouton favori (au survol)', env: 'CARD_SHOW_FAVORITE', def: 'true' },
  { key: 'card_show_progress', group: 'cards', type: 'bool', label: 'Afficher la barre de progression (« Continuer à regarder »)', env: 'CARD_SHOW_PROGRESS', def: 'true' },

  { key: 'stripe_secret_key', group: 'payment', type: 'secret', label: 'Clé secrète Stripe', env: 'STRIPE_SECRET_KEY', test: 'stripe',
    help: 'sk_test_… pour tester, sk_live_… en production. Changer de compte ou de mode remet les abonnements à zéro (confirmation demandée).' },
  { key: 'stripe_webhook_secret', group: 'payment', type: 'secret', label: 'Secret de signature du webhook', env: 'STRIPE_WEBHOOK_SECRET', help: 'whsec_… (Stripe → Développeurs → Webhooks).' },
  { key: 'stripe_price_monthly', group: 'payment', type: 'text', label: 'Identifiant du prix mensuel', env: 'STRIPE_PRICE_MONTHLY', help: 'price_…' },
  { key: 'stripe_price_yearly', group: 'payment', type: 'text', label: 'Identifiant du prix annuel', env: 'STRIPE_PRICE_YEARLY', help: 'price_…' },
  { key: 'stripe_price_learn_monthly', group: 'payment', type: 'text', label: 'Apprentissage : identifiant du prix mensuel', env: 'STRIPE_PRICE_LEARN_MONTHLY', help: 'price_… du palier Mejliss Apprentissage (9,99 €/mois). Vide = palier Apprentissage non vendu.' },
  { key: 'stripe_price_learn_yearly', group: 'payment', type: 'text', label: 'Apprentissage : identifiant du prix annuel', env: 'STRIPE_PRICE_LEARN_YEARLY', help: 'price_… du palier Mejliss Apprentissage (99,99 €/an).' },
  { key: 'trial_days', group: 'payment', type: 'number', label: "Essai gratuit (jours, 0 = aucun)", env: 'TRIAL_DAYS', def: '7', min: 0, max: 90 },

  { key: 'plan_price_monthly', group: 'payment', type: 'price', label: 'Prix mensuel affiché (TTC)', env: 'PLAN_PRICE_MONTHLY', def: '6.99',
    help: 'Montant montré sur la page Abonnement tant que Stripe n\'est pas configuré (ex. 6.99). Une fois Stripe actif, ce sont les prix de Stripe qui s\'affichent et qui sont facturés : mettez les mêmes ici.' },
  { key: 'plan_price_yearly', group: 'payment', type: 'price', label: 'Prix annuel affiché (TTC)', env: 'PLAN_PRICE_YEARLY', def: '69.99', help: 'Même principe que le prix mensuel (ex. 69.99). Vide ou 0 = pas de formule annuelle affichée.' },
  { key: 'plan_learn_price_monthly', group: 'payment', type: 'price', label: 'Apprentissage : prix mensuel affiché (TTC)', env: 'PLAN_LEARN_PRICE_MONTHLY', def: '9.99', help: 'Même principe que le prix mensuel standard. 0 = palier Apprentissage non affiché.' },
  { key: 'plan_learn_price_yearly', group: 'payment', type: 'price', label: 'Apprentissage : prix annuel affiché (TTC)', env: 'PLAN_LEARN_PRICE_YEARLY', def: '99.99', help: 'Vide ou 0 = pas de formule annuelle Apprentissage.' },
  { key: 'plan_currency', group: 'payment', type: 'select', options: ['eur', 'usd', 'gbp', 'chf', 'cad'], label: 'Devise affichée', env: 'PLAN_CURRENCY', def: 'eur' },
  { key: 'paypal_enabled', group: 'payment', type: 'bool', label: 'Proposer PayPal en plus de la carte bancaire', env: 'PAYPAL_ENABLED', def: 'false',
    help: 'À activer APRÈS avoir activé PayPal dans Stripe (Paramètres → Moyens de paiement). Si PayPal est refusé par Stripe, le paiement retombe automatiquement sur la carte bancaire.' },
  { key: 'stripe_automatic_tax', group: 'payment', type: 'bool', label: 'TVA automatique (Stripe Tax)', env: 'STRIPE_AUTOMATIC_TAX', def: 'false',
    help: 'Activer seulement après avoir configuré Stripe Tax (Stripe → Taxes) et défini vos prix « taxes incluses ». L\'adresse de facturation est alors demandée au paiement.' },

  { key: 'rev_share_pct', group: 'revenue', type: 'number', label: 'Part reversée aux chaînes (% des abonnements)', env: 'REV_SHARE_PCT', def: '55', min: 0, max: 100,
    help: 'Pourcentage des abonnements encaissés (hors taxes, après frais de paiement) réparti entre les chaînes selon le temps de visionnage. YouTube reverse 55 %.' },
  { key: 'rev_costs_pct', group: 'revenue', type: 'number', label: 'Frais de paiement retenus avant partage (%)', env: 'REV_COSTS_PCT', def: '3', min: 0, max: 30,
    help: 'Estimation des frais Stripe, retirée avant de calculer la part reversée.' },
  { key: 'rev_min_payout', group: 'revenue', type: 'number', label: 'Seuil de paiement (en devise du site)', env: 'REV_MIN_PAYOUT', def: '20', min: 0, max: 1000,
    help: 'En dessous, la somme est reportée au mois suivant. 0 = tout est payé.' },
  { key: 'rev_count_free', group: 'revenue', type: 'bool', label: 'Compter aussi le visionnage des membres gratuits', env: 'REV_COUNT_FREE', def: 'true',
    help: 'Activé : les conférences gratuites regardées par des membres sans abonnement comptent dans la répartition. Désactivé : seul le visionnage des abonnés compte.' },
  { key: 'rev_user_day_cap', group: 'revenue', type: 'number', label: "Visionnage maximum compté par membre et par jour (minutes)", env: 'REV_USER_DAY_CAP', def: '480', min: 30, max: 1440,
    help: 'Limite l’effet d’une lecture laissée tournante. Au-delà, le temps n’est plus compté pour la journée.' },
  { key: 'rev_show_estimate', group: 'revenue', type: 'bool', label: 'Montrer aux propriétaires de chaîne leur estimation du mois en cours', env: 'REV_SHOW_ESTIMATE', def: 'true',
    help: 'Désactivé : ils voient seulement leur temps de visionnage et les montants des mois clôturés.' },

  { key: 'smtp_host', group: 'email', type: 'text', label: 'Serveur SMTP', env: 'SMTP_HOST', help: 'Ex. smtp-relay.brevo.com, smtp.mailgun.org, ssl0.ovh.net. Vide = aucun e-mail envoyé.' },
  { key: 'smtp_port', group: 'email', type: 'number', label: 'Port', env: 'SMTP_PORT', def: '587', min: 1, max: 65535 },
  { key: 'smtp_security', group: 'email', type: 'select', options: ['starttls', 'ssl', 'none'], label: 'Sécurité', env: 'SMTP_SECURITY', def: 'starttls',
    help: 'starttls pour le port 587 (le plus courant), ssl pour le port 465.' },
  { key: 'smtp_user', group: 'email', type: 'text', label: 'Identifiant SMTP', env: 'SMTP_USER' },
  { key: 'smtp_password', group: 'email', type: 'secret', label: 'Mot de passe ou clé SMTP', env: 'SMTP_PASSWORD', test: 'smtp',
    help: 'Le test envoie un e-mail à votre propre adresse.' },
  { key: 'mail_from', group: 'email', type: 'text', label: 'Expéditeur', env: 'MAIL_FROM',
    help: 'Ex. Mejliss TV <noreply@votre-domaine.fr>. Le domaine doit être autorisé chez votre fournisseur (SPF/DKIM), sinon les e-mails finissent en indésirables.' },
  { key: 'mail_reply_to', group: 'email', type: 'text', label: 'Adresse de réponse (facultatif)', env: 'MAIL_REPLY_TO', help: 'Ex. contact@votre-domaine.fr' },

  { key: 'translate_provider', group: 'translation', type: 'select', options: PROVIDERS, label: 'Moteur par défaut', env: 'TRANSLATE_PROVIDER', def: 'claude',
    help: 'claude : meilleure qualité · azure : gratuit jusqu\'à 2 M caractères/mois · deepseek : très économique.' },
  { key: 'translate_claude_langs', group: 'translation', type: 'langs', label: 'Langues forcées vers Claude', env: 'TRANSLATE_CLAUDE_LANGS' },
  { key: 'translate_azure_langs', group: 'translation', type: 'langs', label: 'Langues forcées vers Azure', env: 'TRANSLATE_AZURE_LANGS' },
  { key: 'translate_deepseek_langs', group: 'translation', type: 'langs', label: 'Langues forcées vers DeepSeek', env: 'TRANSLATE_DEEPSEEK_LANGS' },
  { key: 'anthropic_key', group: 'translation', type: 'secret', label: 'Clé API Claude (Anthropic)', env: 'ANTHROPIC_API_KEY', test: 'claude', help: 'Sert aux traductions et aux résumés.' },
  { key: 'claude_model', group: 'translation', type: 'text', label: 'Modèle Claude', env: 'CLAUDE_MODEL', def: 'claude-haiku-5-5', help: 'claude-sonnet-5-5 : meilleure qualité, plus cher.' },
  { key: 'azure_key', group: 'translation', type: 'secret', label: 'Clé Azure AI Translator', env: 'AZURE_TRANSLATOR_KEY', test: 'azure' },
  { key: 'azure_region', group: 'translation', type: 'text', label: 'Région Azure', env: 'AZURE_TRANSLATOR_REGION', help: 'ex. francecentral' },
  { key: 'azure_endpoint', group: 'translation', type: 'url', label: 'Adresse Azure', env: 'AZURE_TRANSLATOR_ENDPOINT', def: 'https://api.cognitive.microsofttranslator.com' },
  { key: 'azure_chars_per_minute', group: 'translation', type: 'number', label: 'Débit Azure (caractères/minute, 0 = illimité)', env: 'AZURE_CHARS_PER_MINUTE', def: '30000', min: 0, max: 10000000 },
  { key: 'deepseek_key', group: 'translation', type: 'secret', label: 'Clé API DeepSeek', env: 'DEEPSEEK_API_KEY', test: 'deepseek', help: 'Sert aux traductions et aux résumés.' },
  { key: 'deepseek_model', group: 'translation', type: 'text', label: 'Modèle DeepSeek', env: 'DEEPSEEK_MODEL', def: 'deepseek-flash' },
  { key: 'translate_max_chars', group: 'translation', type: 'number', label: 'Garde-fou : longueur maximale d\'une transcription (caractères)', env: 'TRANSLATE_MAX_CHARS', def: '600000', min: 1000, max: 5000000 },

  { key: 'quiz_default_enabled', group: 'quiz', type: 'bool', label: 'Quiz de fin de vidéo activé par défaut', env: 'QUIZ_DEFAULT_ENABLED', def: 'true',
    help: 'Chaque organisateur peut l\'activer ou le désactiver conférence par conférence. Un quiz n\'est proposé que s\'il a assez de questions validées.' },
  { key: 'quiz_language', group: 'quiz', type: 'select', options: ['fr', 'en', 'ar'], label: 'Langue des questions générées', env: 'QUIZ_LANGUAGE', def: 'fr',
    help: 'Les questions sont écrites dans cette langue, quelle que soit celle de la vidéo (une conférence en arabe aura un quiz en français). La citation est affichée dans cette langue si la transcription traduite existe, sinon dans la langue d\'origine.' },
  { key: 'revision_daily_max', group: 'quiz', type: 'number', label: 'Révisions proposées par jour (Apprentissage)', env: 'REVISION_DAILY_MAX', def: '5', min: 1, max: 20,
    help: 'Calendrier fixe : J+1, J+3, J+7 puis J+21 après un quiz. Au-delà de ce nombre, les révisions en retard passent au lendemain.' },
  { key: 'cards_daily_max', group: 'quiz', type: 'number', label: 'Cartes mémoire par séance (Apprentissage)', env: 'CARDS_DAILY_MAX', def: '20', min: 1, max: 100,
    help: 'Nombre maximal de cartes proposées dans une séance du jour (à échéance d\'abord, puis nouvelles).' },
  { key: 'cards_new_per_day', group: 'quiz', type: 'number', label: 'Nouvelles cartes mémoire par jour', env: 'CARDS_NEW_PER_DAY', def: '5', min: 0, max: 50,
    help: 'Nouvelles cartes introduites chaque jour (tirées des quiz déjà passés). 0 = seulement les cartes déjà commencées.' },
  { key: 'revision_email_enabled', group: 'quiz', type: 'bool', label: 'E-mail quotidien « à réviser aujourd\'hui »', env: 'REVISION_EMAIL_ENABLED', def: 'true',
    help: 'Envoyé aux membres Apprentissage qui ont au moins une révision du jour (chacun peut le désactiver). Nécessite l\'envoi d\'e-mails configuré.' },
  { key: 'revision_email_hour', group: 'quiz', type: 'number', label: 'Heure d\'envoi de l\'e-mail quotidien (heure de Paris)', env: 'REVISION_EMAIL_HOUR', def: '8', min: 0, max: 23 },
  { key: 'notify_speakers_enabled', group: 'notifications', type: 'bool', label: 'Prévenir par e-mail des nouvelles conférences des intervenants suivis', env: 'NOTIFY_SPEAKERS_ENABLED', def: 'true',
    help: "Chaque membre choisit les intervenants qu'il suit ; il reçoit un seul e-mail groupé quand de nouvelles conférences sont publiées (vérification toutes les 10 minutes). Désinscription en un clic dans chaque e-mail. Nécessite l'envoi d'e-mails configuré." },
  { key: 'weekly_enabled', group: 'notifications', type: 'bool', label: 'Envoyer la sélection de la semaine (aux membres qui l\'ont demandée)', env: 'WEEKLY_ENABLED', def: 'false',
    help: "Réservée aux membres qui cochent « Recevoir la sélection de la semaine » dans Mon compte (jamais activée d'office). Si une collection est choisie ci-dessous, c'est elle qui est envoyée ; sinon les conférences publiées ces 7 derniers jours." },
  { key: 'weekly_personal', group: 'notifications', type: 'bool', label: 'Lettre personnalisée (à reprendre, nouveautés des intervenants suivis, notions à réviser)', env: 'WEEKLY_PERSONAL', def: 'true',
    help: "Pour chaque membre, la lettre de la semaine ajoute ce qui le concerne : la conférence à reprendre, les nouveautés des intervenants qu'il suit, le nombre de notions à réviser. S'il n'a rien de personnel, il reçoit la sélection simple. Décochez pour envoyer à tous la même sélection." },
  { key: 'weekly_collection', group: 'notifications', type: 'text', label: 'Collection envoyée comme « sélection de la semaine » (identifiant, facultatif)', env: 'WEEKLY_COLLECTION',
    help: "Copiez l'identifiant d'une collection publiée (Studio → Collections). Vide = les nouveautés des 7 derniers jours. Changez-la chaque semaine pour une vraie sélection éditoriale." },
  { key: 'weekly_weekday', group: 'notifications', type: 'number', label: 'Jour d\'envoi de la sélection (1 = lundi … 7 = dimanche)', env: 'WEEKLY_WEEKDAY', def: '4', min: 1, max: 7 },
  { key: 'weekly_count', group: 'notifications', type: 'number', label: 'Nombre de conférences dans la sélection', env: 'WEEKLY_COUNT', def: '5', min: 3, max: 10 },
  { key: 'weekly_hour', group: 'notifications', type: 'number', label: 'Heure d\'envoi de la sélection (heure de Paris)', env: 'WEEKLY_HOUR', def: '9', min: 0, max: 23 },
  { key: 'fcm_service_account', group: 'notifications', type: 'secret_text', label: 'Notifications sur téléphone : fichier de clé Firebase (JSON)', env: 'FCM_SERVICE_ACCOUNT', test: 'push',
    help: "Firebase → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée, puis collez ici tout le contenu du fichier .json. Vide = aucune notification sur téléphone. Le test envoie une notification à vos propres appareils." },
  { key: 'gift_enabled', group: 'gifts', type: 'bool', label: 'Vendre des cartes cadeaux', env: 'GIFT_ENABLED', def: 'false',
    help: "Nécessite Stripe configuré (Paiement). Paiement unique, sans renouvellement. La carte donne l'accès à toutes les conférences (formule standard) pour la durée achetée." },
  { key: 'gift_price_1', group: 'gifts', type: 'price', label: 'Carte 1 mois : prix (TTC)', env: 'GIFT_PRICE_1', def: '6.99', help: 'Montant réellement facturé par Stripe. 0 ou vide = cette durée n\'est pas vendue.' },
  { key: 'gift_price_3', group: 'gifts', type: 'price', label: 'Carte 3 mois : prix (TTC)', env: 'GIFT_PRICE_3', def: '19.99', help: '0 ou vide = cette durée n\'est pas vendue.' },
  { key: 'gift_price_12', group: 'gifts', type: 'price', label: 'Carte 12 mois : prix (TTC)', env: 'GIFT_PRICE_12', def: '69.99', help: '0 ou vide = cette durée n\'est pas vendue.' },
  { key: 'practice_enabled', group: 'practice', type: 'bool', label: 'Écran « Et maintenant, que faire ? » activé', env: 'PRACTICE_ENABLED', def: 'true',
    help: "Affiché sous la conférence et à la fin du quiz, seulement pour les conférences qui ont au moins une proposition validée. L'enregistrement des engagements est réservé à l'offre Apprentissage." },
  { key: 'practice_generate_count', group: 'practice', type: 'number', label: "Propositions d'action générées par l'IA", env: 'PRACTICE_GENERATE_COUNT', def: '4', min: 3, max: 5,
    help: "L'IA propose des idées d'actions concrètes tirées de ce que dit l'intervenant ; elle n'écrit jamais de texte religieux. Chaque proposition est relue et validée par un humain avant d'être publique." },
  { key: 'review_required', group: 'moderation', type: 'bool', label: 'Relire les conférences des organisateurs avant leur mise en ligne', env: 'REVIEW_REQUIRED', def: 'false',
    help: "Quand c'est activé, toute conférence qu'un organisateur publie ou programme attend la validation d'un modérateur ou d'un administrateur. Les conférences déjà en ligne ne sont pas touchées. Les organisateurs « de confiance » (fiche de l'utilisateur) et les administrateurs sont dispensés de relecture." },
  { key: 'practice_themes_on', group: 'practice', type: 'bool', label: 'Proposer la base de thèmes (qualités et défauts) pour les objectifs', env: 'PRACTICE_THEMES_ON', def: 'false',
    help: "Base de départ inspirée de l'Ihyâ' 'ulûm ad-dîn d'al-Ghazâlî (24 thèmes). À ACTIVER seulement après relecture (docs/themes-tazkiya-base.md). Désactivée, chacun écrit ses propres objectifs." },
  { key: 'practice_email_enabled', group: 'practice', type: 'bool', label: 'Rappel hebdomadaire du bilan personnel par e-mail', env: 'PRACTICE_EMAIL_ENABLED', def: 'true',
    help: "Un seul e-mail par semaine, au jour choisi par chacun (vendredi par défaut), avec des chiffres et un lien : jamais le texte des objectifs. Chacun peut le désactiver. Nécessite l'envoi d'e-mails (Paramètres → E-mails)." },
  { key: 'practice_email_hour', group: 'practice', type: 'number', label: "Heure d'envoi du rappel hebdomadaire (heure de Paris)", env: 'PRACTICE_EMAIL_HOUR', def: '17', min: 0, max: 23 },
  { key: 'book_pdf_max_mb', group: 'books', type: 'number', label: 'Taille maximale d\'un PDF (Mo)', env: 'BOOK_PDF_MAX_MB', def: '60', min: 1, max: 500 },
  { key: 'book_link_minutes', group: 'books', type: 'number', label: 'Durée de validité du lien de téléchargement (minutes)', env: 'BOOK_LINK_MINUTES', def: '10', min: 1, max: 120,
    help: 'Le membre Apprentissage reçoit un lien personnel à durée limitée ; chaque téléchargement porte son adresse e-mail et la date en filigrane.' },
  { key: 'book_download_daily_max', group: 'books', type: 'number', label: 'Téléchargements par membre et par jour', env: 'BOOK_DOWNLOAD_DAILY_MAX', def: '10', min: 1, max: 200 },
  { key: 'stats_enabled', group: 'stats', type: 'bool', label: "Statistiques d'audience activées", env: 'STATS_ENABLED', def: 'true',
    help: "Compteurs anonymes (visites, lectures, temps regardé) affichés dans Administration → Statistiques et dans le Studio. Aucun cookie, aucune adresse IP conservée ; les visiteurs qui envoient « Do Not Track » ne sont pas comptés. Désactiver arrête la collecte (les chiffres déjà enregistrés restent)." },
  { key: 'kids_enabled', group: 'kids', type: 'bool', label: 'Espace Kids activé', env: 'KIDS_ENABLED', def: 'true',
    help: "Profils enfants sous le compte du parent, code parental, conférences marquées « Kids » par tranche d'âge." },
  { key: 'kids_max_standard', group: 'kids', type: 'number', label: "Profils enfants : abonnement Mejliss", env: 'KIDS_MAX_STANDARD', def: '1', min: 1, max: 10 },
  { key: 'kids_max_learning', group: 'kids', type: 'number', label: "Profils enfants : abonnement Mejliss Apprentissage", env: 'KIDS_MAX_LEARNING', def: '5', min: 1, max: 10 },
  { key: 'kids_report_enabled', group: 'kids', type: 'bool', label: 'Rapport hebdomadaire envoyé aux parents', env: 'KIDS_REPORT_ENABLED', def: 'true',
    help: "Un e-mail par semaine par parent qui a au moins un profil enfant actif (chaque parent peut le désactiver). Nécessite l'envoi d'e-mails configuré." },
  { key: 'kids_report_weekday', group: 'kids', type: 'number', label: "Jour d'envoi du rapport (0 = dimanche, 1 = lundi … 6 = samedi)", env: 'KIDS_REPORT_WEEKDAY', def: '0', min: 0, max: 6 },
  { key: 'kids_report_hour', group: 'kids', type: 'number', label: "Heure d'envoi du rapport (heure de Paris)", env: 'KIDS_REPORT_HOUR', def: '18', min: 0, max: 23 },

  { key: 'citations_auto', group: 'citations', type: 'bool', label: 'Générer automatiquement des citations (versets et hadiths)', env: 'CITATIONS_AUTO', def: 'true',
    help: "Quand le stock de citations publiées passe sous le minimum ci-dessous, l'IA en choisit de nouvelles dans le corpus importé. Elle ne rédige jamais le texte : elle choisit des références, le texte affiché est celui de la source." },
  { key: 'citations_review', group: 'citations', type: 'bool', label: 'Validation humaine avant diffusion', env: 'CITATIONS_REVIEW', def: 'false',
    help: 'Activé : les citations choisies par l\'IA arrivent en brouillon dans Studio → Rappels et ne sont diffusées qu\'après validation.' },
  { key: 'citations_min_stock', group: 'citations', type: 'number', label: 'Stock minimum de citations publiées', env: 'CITATIONS_MIN_STOCK', def: '30', min: 5, max: 500 },
  { key: 'citations_per_run', group: 'citations', type: 'number', label: 'Citations choisies à chaque génération', env: 'CITATIONS_PER_RUN', def: '15', min: 1, max: 50 },
  { key: 'quran_edition_fr', group: 'citations', type: 'select', options: ['fra-muhammadhamidul', 'fra-islamicfoundati', 'fra-rashidmaash', 'fra-shahnazsaidiben'], label: 'Traduction française du Coran', env: 'QURAN_EDITION_FR', def: 'fra-muhammadhamidul',
    help: 'Muhammad Hamidullah par défaut. Après un changement, relancer l\'import du corpus (Studio → Rappels).' },
  { key: 'hadith_collections', group: 'citations', type: 'text', label: 'Recueils de hadiths importés', env: 'HADITH_COLLECTIONS', def: 'bukhari,muslim,nawawi,qudsi',
    help: 'Séparés par des virgules, parmi : bukhari, muslim, nawawi, qudsi, abudawud, ibnmajah, malik, nasai. Seuls les hadiths disponibles en arabe ET en français sont importés.' },
  { key: 'corpus_base_url', group: 'citations', type: 'url', label: 'Adresse des fichiers du corpus', env: 'CORPUS_BASE_URL', def: 'https://raw.githubusercontent.com/fawazahmed0',
    help: 'Dépôts GitHub fawazahmed0/hadith-api et fawazahmed0/quran-api (branche 1). À ne changer que pour utiliser une copie.' },

  { key: 'quiz_pass_percent', group: 'quiz', type: 'number', label: 'Seuil de réussite du quiz (%)', env: 'QUIZ_PASS_PERCENT', def: '70', min: 50, max: 100 },
  { key: 'quiz_min_questions', group: 'quiz', type: 'number', label: 'Nombre minimum de questions validées pour proposer le quiz', env: 'QUIZ_MIN_QUESTIONS', def: '3', min: 1, max: 10 },
  { key: 'quiz_max_questions', group: 'quiz', type: 'number', label: 'Nombre maximum de questions par quiz', env: 'QUIZ_MAX_QUESTIONS', def: '10', min: 3, max: 20 },
  { key: 'quiz_generate_count', group: 'quiz', type: 'number', label: 'Questions proposées par la génération automatique', env: 'QUIZ_GENERATE_COUNT', def: '8', min: 3, max: 15,
    help: 'Le moteur utilisé est celui des résumés (Résumés et chapitres). Toute question générée doit être relue et validée dans le Studio avant d\'être publiée.' },
  { key: 'ask_daily_max', group: 'ask', type: 'number', label: 'Questions par membre et par jour', env: 'ASK_DAILY_MAX', def: '20', min: 1, max: 500,
    help: 'Plafond individuel (jour de Paris). Chaque question coûte un appel à Claude : réservé au palier Apprentissage.' },
  { key: 'ask_global_daily_max', group: 'ask', type: 'number', label: 'Questions par jour pour tout le site', env: 'ASK_GLOBAL_DAILY_MAX', def: '1000', min: 1, max: 1000000,
    help: 'Garde-fou de coût : une fois atteint, l\'assistant s\'arrête jusqu\'au lendemain pour tout le monde.' },
  { key: 'ask_model', group: 'ask', type: 'text', label: 'Modèle Claude de l\'assistant (vide = modèle de traduction)', env: 'ASK_MODEL',
    help: 'claude-haiku-5-5 : économique ; claude-sonnet-5-5 : réponses plus fines, plus cher. La clé est celle de « Traduction des sous-titres ».' },
  { key: 'ask_context_chars', group: 'ask', type: 'number', label: 'Taille des passages envoyés à l\'IA (caractères)', env: 'ASK_CONTEXT_CHARS', def: '18000', min: 4000, max: 60000,
    help: 'Plus grand = réponses mieux fondées sur les longues conférences, mais plus cher par question. 18 000 ≈ 5 000 jetons.' },
  { key: 'ask_keep_days', group: 'ask', type: 'number', label: 'Durée de conservation des questions (jours)', env: 'ASK_KEEP_DAYS', def: '90', min: 1, max: 365,
    help: 'Passé ce délai, la question et la réponse sont supprimées automatiquement.' },
  { key: 'insights_enabled', group: 'insights', type: 'bool', label: 'Générer résumé et chapitres', env: 'INSIGHTS_ENABLED', def: 'true' },
  { key: 'insights_provider', group: 'insights', type: 'select', options: ['auto', 'deepseek', 'claude'], label: 'Moteur', env: 'INSIGHTS_PROVIDER', def: 'auto', help: 'auto : DeepSeek s\'il a une clé, sinon Claude.' },
  { key: 'insights_langs', group: 'insights', type: 'langs', label: 'Résumé toujours produit dans ces langues', env: 'INSIGHTS_LANGS', def: 'fr',
    help: 'Le résumé et les chapitres sont traduits dans ces langues pour toutes les conférences, même sans sous-titres dans cette langue. Le site affiche celui de la langue du visiteur.' },
  { key: 'insights_claude_model', group: 'insights', type: 'text', label: 'Modèle Claude pour les résumés (vide = modèle de traduction)', env: 'INSIGHTS_CLAUDE_MODEL' },
  { key: 'insights_max_chars', group: 'insights', type: 'number', label: 'Garde-fou : longueur maximale (caractères)', env: 'INSIGHTS_MAX_CHARS', def: '200000', min: 1000, max: 5000000 },

  { key: 'whisper_language_mode', group: 'transcription', type: 'select', options: ['declared', 'auto'], label: 'Langue de la parole', env: 'WHISPER_LANGUAGE_MODE', def: 'declared',
    help: 'declared : langue indiquée par l\'organisateur (recommandé) · auto : détection automatique.' },
  { key: 'whisper_model', group: 'transcription', type: 'select', options: ['small', 'medium', 'large-v3-turbo', 'large-v3'], label: 'Modèle Whisper', env: 'WHISPER_MODEL', def: 'small',
    help: 'Plus gros = plus précis mais plus lent. Un nouveau modèle est téléchargé au premier usage.' },
  { key: 'whisper_threads', group: 'transcription', type: 'number', label: 'Cœurs CPU utilisés', env: 'WHISPER_THREADS', def: '4', min: 1, max: 32 },
  { key: 'whisper_beam', group: 'transcription', type: 'number', label: 'Précision de recherche (beam)', env: 'WHISPER_BEAM', def: '3', min: 1, max: 10 },
  { key: 'whisper_word_timestamps', group: 'transcription', type: 'bool', label: 'Horodater chaque mot (montage par le texte)', env: 'WHISPER_WORD_TIMESTAMPS', def: 'true',
    help: 'Nécessaire pour couper la vidéo mot à mot dans l\'éditeur de montage. Environ 10 à 20 % de calcul en plus. Désactivé : l\'éditeur estime la place des mots dans chaque phrase.' },

  { key: 'external_mode', group: 'external', type: 'select', options: ['subtitles_then_audio', 'audio_only', 'subtitles_only'], label: 'Méthode de transcription',
    env: 'EXTERNAL_MODE', def: 'subtitles_then_audio',
    help: 'subtitles_then_audio : sous-titres publiés par l\'auteur s\'ils existent, sinon téléchargement de l\'audio et Whisper (recommandé) · audio_only : toujours Whisper · subtitles_only : jamais de téléchargement.' },
  { key: 'external_auto_captions', group: 'external', type: 'bool', label: 'Utiliser les sous-titres automatiques de YouTube en dernier recours', env: 'EXTERNAL_AUTO_CAPTIONS', def: 'true',
    help: 'Moins bonne qualité (pas de ponctuation), utilisés seulement si l\'audio ne peut pas être récupéré.' },
  { key: 'dailymotion_player_id', group: 'external', type: 'text', label: 'Dailymotion : identifiant de lecteur (Player ID)', env: 'DAILYMOTION_PLAYER_ID',
    help: "Facultatif. Sans lui, les vidéos Dailymotion se lisent dans le lecteur simple (pas de reprise de lecture, pas de pause de prière, pas d'aperçu des conférences premium). Avec lui, le lecteur est piloté comme YouTube. Créez-le dans Dailymotion Studio → Players (lettres et chiffres, par exemple x8lr5)." },
  { key: 'ytdlp_cookies', group: 'external', type: 'secret_text', label: 'Cookies YouTube (si YouTube bloque le serveur)', env: 'YTDLP_COOKIES',
    help: 'Contenu d\'un fichier cookies.txt (format Netscape) exporté depuis un navigateur connecté à un compte Google dédié. Laisser vide si tout fonctionne.' },
  { key: 'ytdlp_proxy', group: 'external', type: 'secret', label: 'Proxy de sortie (facultatif)', env: 'YTDLP_PROXY', help: 'Ex. http://utilisateur:motdepasse@proxy:port. Pour contourner un blocage par adresse IP.' },
  // Étape 23b : veille des chaînes (lus par le transcripteur).
  { key: 'watch_interval_hours', group: 'external', type: 'number', label: 'Veille : vérifier les chaînes suivies toutes les … heures', env: 'WATCH_INTERVAL_HOURS', def: '6', min: 1, max: 48,
    help: 'Admin → Veille. Chaque chaîne suivie est relue à cet intervalle ; les nouvelles vidéos s\'ajoutent à la liste à traiter.' },
  { key: 'watch_max_videos', group: 'external', type: 'number', label: 'Veille : nombre de vidéos récentes lues à chaque contrôle', env: 'WATCH_MAX_VIDEOS', def: '30', min: 5, max: 200,
    help: 'Les plus récentes de la chaîne. À augmenter seulement si une chaîne publie plus que cela entre deux contrôles.' },
  // Étape 24c : publicité au lancement de l'application (lus par GET /ads/next).
  { key: 'ads_paid_subscribers', group: 'ads', type: 'select', options: ['masquer', 'afficher'], label: 'Abonnés payants : masquer ou afficher la publicité', env: 'ADS_PAID_SUBSCRIBERS', def: 'masquer',
    help: 'masquer = les abonnés payants (essai compris) ne voient jamais de publicité ; afficher = ils la voient comme les autres.' },
  { key: 'ads_per_launch', group: 'ads', type: 'number', label: 'Nombre de publicités à la suite à chaque lancement', env: 'ADS_PER_LAUNCH', def: '1', min: 1, max: 3,
    help: '1 = une seule publicité par lancement, différente à chaque fois (rotation). 2 ou 3 = plusieurs publicités l\'une après l\'autre.' },
  { key: 'ads_skip_seconds', group: 'ads', type: 'number', label: 'Bouton « Passer » disponible après … secondes', env: 'ADS_SKIP_SECONDS', def: '5', min: 0, max: 15 },
  { key: 'ads_image_seconds', group: 'ads', type: 'number', label: 'Durée d\'affichage d\'une photo (secondes)', env: 'ADS_IMAGE_SECONDS', def: '6', min: 3, max: 30,
    help: 'Une vidéo dure le temps de la vidéo.' },
  { key: 'import_max_videos', group: 'external', type: 'number', label: 'Nombre maximum de vidéos par import de playlist ou de chaîne', env: 'IMPORT_MAX_VIDEOS', def: '200', min: 1, max: 2000 },
  // Étape Import : copie d'une vidéo externe chez nous (lus par le transcripteur, qui télécharge).
  { key: 'import_max_gb', group: 'external', type: 'number', label: 'Taille maximale d\'une vidéo importée (Go)', env: 'IMPORT_MAX_GB', def: '8', min: 1, max: 100,
    help: 'Au-delà, l\'import est arrêté. Une heure de conférence en 1080p pèse en général 1 à 3 Go.' },
  { key: 'import_max_height', group: 'external', type: 'number', label: 'Qualité maximale importée (hauteur en pixels)', env: 'IMPORT_MAX_HEIGHT', def: '1080', min: 360, max: 2160,
    help: 'On télécharge la meilleure qualité qui ne dépasse pas cette hauteur (1080 = Full HD, la qualité maximale servie aux spectateurs).' },

  { key: 'meili_url', group: 'search', type: 'url', label: 'Adresse du serveur Meilisearch', env: 'MEILI_URL',
    help: 'Vide = recherche simple intégrée (sans tolérance aux fautes). Sur le VPS : http://IP_DU_CONTENEUR:3000 (docker inspect du service majlistv-search, comme pour la base de données).' },
  { key: 'meili_key', group: 'search', type: 'secret', label: 'Clé maître Meilisearch', env: 'MEILI_KEY', test: 'meili',
    help: 'La même valeur que la variable MEILI_MASTER_KEY du service majlistv-search. L\'index se remplit tout seul en quelques minutes.' },
  // Étape S3 : Studio → Activité. Lus aussi par les services (fonction SQL activity_allows).
  { key: 'activity_pause_all', group: 'activity', type: 'bool', label: 'Tâches lourdes en pause', def: 'false',
    help: 'Conversion des vidéos, transcription et doublage complet ne démarrent plus (une tâche déjà en cours se termine). Se règle aussi dans Studio → Activité.' },
  { key: 'activity_window_enabled', group: 'activity', type: 'bool', label: 'Limiter les tâches lourdes à une plage horaire', def: 'false' },
  { key: 'activity_window_start', group: 'activity', type: 'number', label: 'Début de la plage (heure de Paris, 0-23)', def: '22', min: 0, max: 23 },
  { key: 'activity_window_end', group: 'activity', type: 'number', label: 'Fin de la plage (heure de Paris, 0-23)', def: '7', min: 0, max: 23 },
  { key: 'health_alerts_enabled', group: 'health', type: 'bool', label: 'Envoyer des alertes e-mail (disque, mémoire)', env: 'HEALTH_ALERTS_ENABLED', def: 'true',
    help: "Nécessite l'envoi d'e-mails configuré (groupe E-mails). Mesure toutes les 10 minutes." },
  { key: 'health_disk_warn_pct', group: 'health', type: 'number', label: 'Disque : seuil « attention » (% utilisé)', env: 'HEALTH_DISK_WARN_PCT', def: '80', min: 10, max: 99 },
  { key: 'health_disk_crit_pct', group: 'health', type: 'number', label: 'Disque : seuil « critique » (% utilisé)', env: 'HEALTH_DISK_CRIT_PCT', def: '90', min: 10, max: 99 },
  { key: 'health_mem_crit_pct', group: 'health', type: 'number', label: 'Mémoire : seuil « critique » (% utilisée)', env: 'HEALTH_MEM_CRIT_PCT', def: '92', min: 10, max: 99 },
  { key: 'health_alert_to', group: 'health', type: 'text', label: "Destinataires des alertes (adresses séparées par des virgules)", env: 'HEALTH_ALERT_TO',
    help: 'Vide = tous les administrateurs.' },
  { key: 'errors_alerts_enabled', group: 'health', type: 'bool', label: 'Erreurs : alerte e-mail à chaque nouvelle erreur (serveur et site)', env: 'ERRORS_ALERTS_ENABLED', def: 'true',
    help: "Un e-mail à la première apparition d'une erreur, et quand une erreur marquée « résolue » revient (6 e-mails par heure au plus). Mêmes destinataires que la santé du serveur. Détail dans Admin → Erreurs." },
  // Étape 37 : suivi des sauvegardes (rapports envoyés par le VPS).
  { key: 'backup_report_token', group: 'health', type: 'secret', label: 'Sauvegardes : jeton des rapports du VPS',
    help: "Chaîne secrète (générée sur le VPS, voir ops/backup/README.md) que le VPS envoie avec chaque rapport de sauvegarde. Vide = suivi des sauvegardes désactivé." },
  { key: 'backup_max_age_hours', group: 'health', type: 'number', label: 'Sauvegardes : alerte si aucune sauvegarde depuis (heures)', env: 'BACKUP_MAX_AGE_HOURS', def: '30', min: 6, max: 336 },
  { key: 'backup_restore_max_days', group: 'health', type: 'number', label: 'Sauvegardes : alerte si aucun test de restauration réussi depuis (jours)', env: 'BACKUP_RESTORE_MAX_DAYS', def: '10', min: 1, max: 90 },
  { key: 'lifecycle_enabled', group: 'lifecycle', type: 'bool', label: 'Activer les e-mails de cycle de vie', env: 'LIFECYCLE_ENABLED', def: 'false',
    help: "Interrupteur général, désactivé d'office. Avant de l'activer, ouvrez Admin → E-mails de cycle de vie : l'aperçu indique combien d'e-mails partiraient. Chaque membre peut les refuser dans Mon compte, et chaque e-mail porte un lien de désinscription." },
  { key: 'lifecycle_resume_enabled', group: 'lifecycle', type: 'bool', label: 'Reprise : « Reprenez là où vous vous êtes arrêté »', env: 'LIFECYCLE_RESUME_ENABLED', def: 'true',
    help: "Conférence commencée (au moins 2 minutes, pas terminée) puis laissée de côté. Un seul e-mail par conférence." },
  { key: 'lifecycle_nudge_enabled', group: 'lifecycle', type: 'bool', label: 'Bienvenue : « Par où commencer »', env: 'LIFECYCLE_NUDGE_ENABLED', def: 'true',
    help: "Compte créé depuis quelques jours sans aucune conférence regardée : trois conférences à découvrir. Un seul e-mail par personne, à vie." },
  { key: 'lifecycle_winback_enabled', group: 'lifecycle', type: 'bool', label: 'Retour : « Vous nous manquez » après un abonnement terminé', env: 'LIFECYCLE_WINBACK_ENABLED', def: 'true',
    help: "Abonnement terminé (sans accès restant) : les nouveautés depuis son départ. Un seul e-mail par abonnement." },
  { key: 'lifecycle_resume_days', group: 'lifecycle', type: 'number', label: 'Reprise : jours sans regarder avant l\'e-mail', env: 'LIFECYCLE_RESUME_DAYS', def: '3', min: 1, max: 60 },
  { key: 'lifecycle_nudge_days', group: 'lifecycle', type: 'number', label: 'Bienvenue : jours après l\'inscription', env: 'LIFECYCLE_NUDGE_DAYS', def: '3', min: 1, max: 60 },
  { key: 'lifecycle_winback_days', group: 'lifecycle', type: 'number', label: 'Retour : jours après la fin de l\'abonnement', env: 'LIFECYCLE_WINBACK_DAYS', def: '14', min: 1, max: 180 },
  { key: 'lifecycle_gap_days', group: 'lifecycle', type: 'number', label: 'Délai minimum entre deux e-mails de ce type pour une même personne (jours)', env: 'LIFECYCLE_GAP_DAYS', def: '7', min: 1, max: 60 },
  { key: 'lifecycle_hour_from', group: 'lifecycle', type: 'number', label: 'Envoi à partir de (heure de Paris)', env: 'LIFECYCLE_HOUR_FROM', def: '10', min: 0, max: 23 },
  { key: 'lifecycle_hour_to', group: 'lifecycle', type: 'number', label: 'Envoi jusqu\'à (heure de Paris, exclue)', env: 'LIFECYCLE_HOUR_TO', def: '19', min: 0, max: 23,
    help: "Mêmes heures de début et de fin = toute la journée." },
  { key: 'lifecycle_daily_max', group: 'lifecycle', type: 'number', label: 'Plafond d\'e-mails de cycle de vie par jour', env: 'LIFECYCLE_DAILY_MAX', def: '100', min: 1, max: 5000,
    help: "Protège la réputation de votre domaine d'envoi : montez-le progressivement." },
];
// Interrupteurs des fonctions (étape A) : un réglage « feat_<id> » par fonction sans réglage existant.
// Masqués de la page Paramètres classique : ils se règlent dans Admin → Fonctions et paramètres.
for (const f of FEATURES) {
  if (f.setting) continue;
  FIELDS.push({ key: settingKey(f), group: 'features', type: 'bool', label: f.label, def: f.def || 'true', hidden: true });
}
export const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const isSecretType = (t) => t === 'secret' || t === 'secret_text';

let cache = { at: 0, rows: new Map() };
async function rows() {
  if (Date.now() - cache.at > 5000) {
    const { rows: r } = await pool.query('SELECT key, value, is_secret FROM app_settings');
    cache = { at: Date.now(), rows: new Map(r.map((x) => [x.key, x])) };
  }
  return cache.rows;
}
export const invalidateSettings = () => { cache.at = 0; };

function envFallback(f) {
  const v = f.env ? process.env[f.env] : undefined;
  if (v) return v;
  if (f.key === 'web_url') return (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',')[0].replace(/\/$/, '');
  return f.def ?? '';
}

// Valeur utilisée + origine ('db' | 'env' | 'default').
async function resolve(key) {
  const f = BY_KEY[key];
  const row = (await rows()).get(key);
  if (row && row.value !== '') {
    try { return { value: row.is_secret ? decrypt(row.value) : row.value, source: 'db' }; } catch { /* clé SETTINGS_KEY changée : valeur illisible, on retombe sur l'environnement */ }
  }
  const envVal = f.env ? process.env[f.env] : undefined;
  if (envVal) return { value: envVal, source: 'env' };
  return { value: envFallback(f), source: 'default' };
}

// « true / on / 1 / yes » = oui (les anciennes variables d'environnement acceptaient aussi off/0/no/false).
export const isOn = (v) => !['false', 'off', '0', 'no', ''].includes(String(v).trim().toLowerCase());

export async function getSetting(key) { return (await resolve(key)).value; }
export async function getNumber(key) { const n = Number(await getSetting(key)); return Number.isFinite(n) ? n : Number(BY_KEY[key].def || 0); }

// Description complète pour le back-office : jamais de clé en clair (seulement « défini » + 4 derniers caractères).
// Étape M3a : réglages propres à un module, masqués de Admin → Paramètres quand le dossier du module est absent.
const GROUP_MODULE = { gifts: 'gifts', revenue: 'revenue', practice: 'practice', books: 'books', kids: 'kids', stats: 'stats', citations: 'citations', notifications: 'follow', quiz: 'quiz', ask: 'ask' };
const FIELD_MODULE = { revision_daily_max: 'revision', revision_email_enabled: 'revision', revision_email_hour: 'revision' };
let moduleCheck = () => true;
export const setSettingsModuleCheck = (fn) => { moduleCheck = fn; };
const fieldVisible = (f) => { const m = FIELD_MODULE[f.key] || GROUP_MODULE[f.group]; return !m || moduleCheck(m); };

export async function describeSettings({ all = false } = {}) {
  const out = [];
  for (const f of FIELDS) {
    if (!all && !fieldVisible(f)) continue;
    const r = await resolve(f.key);
    const item = { key: f.key, group: f.group, type: f.type, label: f.label, help: f.help || '', options: f.options || null,
      test: f.test || null, hidden: Boolean(f.hidden), min: f.min ?? null, max: f.max ?? null, source: r.source };
    if (isSecretType(f.type)) {
      item.isSet = r.value !== '';
      item.hint = !r.value ? '' : f.type === 'secret_text' ? `(${r.value.split('\n').length} lignes)` : `••••${r.value.slice(-4)}`;
    } else {
      item.value = f.type === 'bool' ? String(isOn(r.value)) : r.value;
      item.default = f.def ?? '';
    }
    out.push(item);
  }
  return { groups: all ? GROUPS : GROUPS.filter((g) => !GROUP_MODULE[g.id] || moduleCheck(GROUP_MODULE[g.id]) || out.some((f) => f.group === g.id)), fields: out, encryption: cryptoReady, langs: TRANSLATION_LANGS };
}

// Contrôle d'une valeur reçue ; renvoie la valeur normalisée ou lève une Error lisible.
export function validateValue(f, raw) {
  const v = String(raw ?? '').trim();
  if (v.length > (f.type === 'secret_text' ? 200000 : 500)) throw new Error(`${f.label} : valeur trop longue`);
  switch (f.type) {
    case 'secret_text': // texte secret sur plusieurs lignes (ex. fichier de cookies)
      return v.replace(/\r\n/g, '\n');
    case 'secret':
      if (/\s/.test(v)) throw new Error(`${f.label} : la clé ne doit pas contenir d'espace`);
      return v;
    case 'number': {
      const n = Number(v);
      if (!Number.isFinite(n) || n < (f.min ?? -Infinity) || n > (f.max ?? Infinity)) throw new Error(`${f.label} : nombre entre ${f.min} et ${f.max} attendu`);
      return String(Math.trunc(n));
    }
    case 'price': { // « 6,99 » ou « 6.99 » → « 6.99 » (vide = aucun prix)
      if (!v) return '';
      if (!/^\d{1,5}([.,]\d{1,2})?$/.test(v)) throw new Error(`${f.label} : montant attendu, ex. 6.99`);
      return String(Number(v.replace(',', '.')));
    }
    case 'bool':
      if (!['true', 'false'].includes(v)) throw new Error(`${f.label} : oui ou non attendu`);
      return v;
    case 'select':
      if (!f.options.includes(v)) throw new Error(`${f.label} : valeur non autorisée`);
      return v;
    case 'langs': {
      const list = v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (list.some((l) => !TRANSLATION_LANGS.includes(l))) throw new Error(`${f.label} : langue inconnue`);
      return [...new Set(list)].join(',');
    }
    case 'url':
      if (v) { try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { throw new Error(`${f.label} : adresse invalide (https://…)`); } }
      return v.replace(/\/$/, '');
    default:
      return v;
  }
}

// Enregistre : valeur vide/null = retour à la variable d'environnement ou à la valeur par défaut.
export async function saveSettings(values, userId) {
  for (const [key, raw] of Object.entries(values)) {
    const f = BY_KEY[key];
    if (!f) throw new Error(`Paramètre inconnu : ${key}`);
    const v = raw === null ? '' : validateValue(f, raw);
    if (v === '') {
      await pool.query('DELETE FROM app_settings WHERE key = $1', [key]);
    } else {
      if (isSecretType(f.type) && !cryptoReady) throw new Error('La variable SETTINGS_KEY (16 caractères minimum) doit être définie sur l\'API, le traducteur et le transcripteur avant d\'enregistrer une clé.');
      await pool.query(
        `INSERT INTO app_settings (key, value, is_secret, updated_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [key, isSecretType(f.type) ? encrypt(v) : v, isSecretType(f.type), userId]
      );
    }
  }
  invalidateSettings();
}
