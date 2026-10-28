// Modèles des e-mails transactionnels (français, anglais, arabe). Chaque modèle renvoie { subject, html, text }.
// Les valeurs injectées sont échappées : aucun HTML venant d'un utilisateur n'est interprété.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOCALES = ['fr', 'en', 'ar'];
export const pickLocale = (l) => (LOCALES.includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

const INTL = { fr: 'fr-FR', en: 'en-GB', ar: 'ar' };
export const fmtDate = (d, locale) => new Intl.DateTimeFormat(INTL[pickLocale(locale)], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(d));
export const fmtMoney = (cents, currency, locale) => new Intl.NumberFormat(INTL[pickLocale(locale)], { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format((cents || 0) / 100);

// Textes : {name}, {date}… sont remplacés par les valeurs (échappées dans la version HTML).
const T = {
  fr: {
    hello: 'Bonjour {name},', team: "L'équipe {app}", footer: 'Vous recevez cet e-mail car vous avez un compte sur {app}.',
    welcome: { subject: 'Bienvenue sur {app}', lines: ['Votre compte est créé. Vous pouvez dès maintenant regarder les conférences gratuites et l\'aperçu de chaque conférence premium.', 'Pour tout voir, essayez l\'abonnement gratuitement.'], button: 'Découvrir les conférences' },
    password_reset: { subject: 'Réinitialiser votre mot de passe', lines: ['Vous avez demandé à changer votre mot de passe. Ce lien est valable 1 heure.', 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.'], button: 'Choisir un nouveau mot de passe' },
    trial_ending: { subject: 'Votre essai gratuit se termine le {date}', lines: ['Votre essai gratuit se termine le {date}.', 'Sans action de votre part, votre abonnement {plan} démarrera et {amount} seront prélevés à cette date.', 'Vous pouvez résilier à tout moment avant cette date depuis Mon compte : aucun prélèvement ne sera fait.'], button: 'Gérer mon abonnement' },
    payment_succeeded: { subject: 'Paiement reçu : {amount}', lines: ['Nous avons bien reçu votre paiement de {amount}. Merci pour votre confiance.', 'Votre facture est disponible en ligne.'], button: 'Voir ma facture' },
    payment_failed: { subject: 'Échec du paiement de votre abonnement', lines: ['Le paiement de {amount} n\'a pas abouti. Votre accès reste ouvert quelques jours.', 'Mettez à jour votre moyen de paiement pour continuer à regarder les conférences.'], button: 'Mettre à jour ma carte' },
    subscription_canceled: { subject: 'Résiliation enregistrée', lines: ['Votre résiliation est bien prise en compte.', 'Vous gardez l\'accès à toutes les conférences jusqu\'au {date}. Vous pouvez reprendre votre abonnement à tout moment avant cette date.'], button: 'Mon compte' },
    subscription_ended: { subject: 'Votre abonnement est terminé', lines: ['Votre abonnement est arrivé à son terme. Les conférences gratuites restent accessibles.', 'Vous pouvez vous réabonner quand vous le souhaitez.'], button: 'Voir les formules' },
    revision_daily: { subject: '{count} à réviser aujourd\'hui', lines: ['Vos révisions du jour ({count}) :', '{titles}', '?Rappel du jour : « {reminder} » ({source})', 'Quelques minutes suffisent : refaire le quiz fait remonter votre score.'], button: 'Commencer mes révisions' },
    selfcheck_weekly: { subject: 'Votre point de la semaine', lines: ['C\'est le moment de faire le point, tranquillement.', '?Engagements en cours : {commitments}', '?Objectifs dont le bilan de la semaine reste à faire : {goals}', 'Quelques minutes suffisent. Ce que vous y écrivez n\'est visible que de vous. Vous pouvez désactiver ce rappel dans Mon apprentissage.'], button: 'Faire mon point' },
    kids_report: { subject: 'Le point de la semaine sur {children}', lines: ['Voici ce que vos enfants ont fait ces {days} derniers jours :', '{summary}', '?À reprendre en douceur : {retry}', 'Vous pouvez régler la durée quotidienne et le catalogue de chaque enfant, ou désactiver cet e-mail, dans l\'espace Kids.'], button: 'Ouvrir l\'espace Kids' },
    review_approved: { subject: 'Votre conférence « {title} » est en ligne', lines: ['Après relecture, votre conférence « {title} » est validée.', '?Message de la relecture : {note}'], button: 'Ouvrir le Studio' },
    review_rejected: { subject: 'Votre conférence « {title} » n\'est pas en ligne', lines: ['Après relecture, votre conférence « {title} » n\'est pas publiée pour le moment.', 'Motif : {note}', 'Vous pouvez la corriger puis la renvoyer à la relecture depuis le Studio.'], button: 'Ouvrir le Studio' },
    health_alert: { subject: '{title}', lines: ['{summary}', '?{advice}'], button: 'Ouvrir la santé du serveur' },
    resume_talk: { subject: 'Reprenez « {title} » là où vous vous êtes arrêté', lines: ['Vous avez regardé {minutes} min de « {title} », puis la vie a repris le dessus.', '?{cards}', '?Une conférence de {speaker}.', 'Votre lecture vous attend, à la minute exacte où vous l\'avez quittée.'], button: 'Reprendre la conférence', footer: 'Vous recevez cet e-mail car vous avez commencé cette conférence sur {app}.' },
    welcome_nudge: { subject: 'Par où commencer sur {app} ?', lines: ['Votre compte est prêt, mais vous n\'avez encore rien regardé. Voici trois conférences pour commencer :', '{titles}', 'Dix minutes suffisent pour sentir si cela vous parle.'], button: 'Commencer', footer: 'Vous recevez cet e-mail car vous avez créé un compte sur {app}.' },
    winback: { subject: 'Du nouveau sur {app} depuis votre départ', lines: ['Votre abonnement est terminé, mais la bibliothèque continue de s\'agrandir. Voici ce qui est arrivé récemment :', '{titles}', 'Vous pouvez reprendre quand vous voulez, sans engagement de durée.'], button: 'Revenir sur {app}', footer: 'Vous recevez cet e-mail car vous avez été abonné(e) à {app}.' },
    weekly_letter: { subject: 'Votre semaine sur {app}', lines: ['Voici votre semaine sur {app}.', '?{cardsResume}', '?Notions à réviser cette semaine : {due}.', '?{cardsFollow}', '?{cardsSelection}'], button: 'Ouvrir {app}', footer: 'Vous recevez cette lettre car vous avez demandé la sélection de la semaine sur {app}.' },
    sec: { cardsResume: 'À reprendre', cardsFollow: 'Nouveau chez vos intervenants', cardsSelection: 'Notre sélection' },
    account_deleted: { subject: 'Votre compte {app} a été supprimé', lines: ['Votre compte {app} et vos données personnelles ont été supprimés, comme vous l\'avez demandé.', 'Si un abonnement était en cours, il a été arrêté. Conformément à la loi, nos prestataires de paiement conservent les factures déjà émises, et nous gardons la preuve de votre acceptation des conditions générales.', 'Si vous n\'êtes pas à l\'origine de cette demande, répondez à cet e-mail sans attendre.'], button: '', footer: 'Cet e-mail confirme la suppression de votre compte sur {app}.' },
    test: { subject: 'Test d\'envoi {app}', lines: ['Cet e-mail confirme que les réglages d\'envoi fonctionnent.'], button: 'Ouvrir le site' },
    dub_ready: { subject: 'La version française de « {title} » est disponible', lines: ['La version française que vous avez demandée est prête : « {title} ».', 'Dans le lecteur, choisissez « Version française » sous « Langue de l\'audio ».'], button: 'Écouter la conférence' },
    helloAnon: 'Bonjour,', unsub: 'Se désabonner en un clic', manage: 'Gérer mes e-mails',
    speaker_new: { subject: 'Nouveau chez les intervenants que vous suivez', lines: ['Du nouveau chez les intervenants que vous suivez :', '{titles}'], button: 'Voir les conférences' },
    weekly_selection: { subject: 'La sélection de la semaine', lines: ['Voici notre sélection de la semaine :', '{titles}'], button: 'Découvrir la sélection' },
    gift_purchased: { subject: 'Votre carte cadeau {months} est prête', lines: ['Merci ! Votre carte cadeau ({months}) est payée.', 'Son code : {code}', '?Nous l\'avons aussi envoyée à {recipient}.', 'Vous pouvez aussi l\'offrir vous-même : le destinataire la saisit dans « Activer une carte cadeau ». Retrouvez-la à tout moment dans Mon compte.'], button: 'Mes cartes cadeaux', footer: 'Vous recevez cet e-mail car vous avez acheté une carte cadeau sur {app}.' },
    gift_received: { subject: '{from} vous offre un abonnement {app}', lines: ['{from} vous offre {months} d\'accès à toutes les conférences de {app}.', '?Son message : « {message} »', 'Votre code : {code}', 'Pour l\'activer, connectez-vous (ou créez un compte gratuit) puis saisissez ce code. Il n\'engage à rien : aucun paiement, aucun renouvellement automatique.'], button: 'Activer ma carte cadeau', footer: '{from} a choisi de vous envoyer cette carte cadeau. Aucun autre e-mail ne sera envoyé à cette adresse à ce sujet.' },
    gift_redeemed: { subject: 'Votre carte cadeau a été activée', lines: ['{redeemer} a activé la carte cadeau que vous avez offerte ({months}). Merci pour ce beau geste !'], button: 'Mes cartes cadeaux' },
    gift_activated: { subject: 'Votre carte cadeau est activée', lines: ['Votre carte cadeau est activée : vous avez accès à toutes les conférences jusqu\'au {date}.'], button: 'Regarder les conférences' },
    referral_reward_referee: { subject: 'Votre mois offert grâce au parrainage', lines: ['Merci pour votre abonnement à {app} ! Grâce au parrainage, {months} vous est offert.', 'Votre accès est prolongé jusqu\'au {date}.', '?Votre parrain : {referrer}.'], button: 'Voir mon compte' },
    referral_reward_referrer: { subject: 'Votre filleul s\'est abonné : {months} offert', lines: ['{friend} s\'est abonné grâce à vous. Merci de faire connaître {app} !', '{months} vous est offert : votre accès est prolongé jusqu\'au {date}.'], button: 'Mon parrainage' },
    plans: { month: 'mensuel', year: 'annuel' },
  },
  en: {
    hello: 'Hello {name},', team: 'The {app} team', footer: 'You are receiving this email because you have an account on {app}.',
    welcome: { subject: 'Welcome to {app}', lines: ['Your account is ready. You can already watch the free conferences and a preview of every premium conference.', 'To watch everything, try the subscription for free.'], button: 'Browse conferences' },
    password_reset: { subject: 'Reset your password', lines: ['You asked to change your password. This link is valid for 1 hour.', 'If you did not request this, ignore this email: your password stays the same.'], button: 'Choose a new password' },
    trial_ending: { subject: 'Your free trial ends on {date}', lines: ['Your free trial ends on {date}.', 'Unless you cancel, your {plan} subscription will start and {amount} will be charged on that date.', 'You can cancel any time before then from My account: you will not be charged.'], button: 'Manage my subscription' },
    payment_succeeded: { subject: 'Payment received: {amount}', lines: ['We received your payment of {amount}. Thank you.', 'Your invoice is available online.'], button: 'View my invoice' },
    payment_failed: { subject: 'Your subscription payment failed', lines: ['The payment of {amount} did not go through. Your access stays open for a few days.', 'Update your payment method to keep watching.'], button: 'Update my card' },
    subscription_canceled: { subject: 'Cancellation confirmed', lines: ['Your cancellation is confirmed.', 'You keep full access until {date}. You can resume your subscription any time before then.'], button: 'My account' },
    subscription_ended: { subject: 'Your subscription has ended', lines: ['Your subscription has ended. Free conferences remain available.', 'You can subscribe again whenever you like.'], button: 'See plans' },
    revision_daily: { subject: '{count} to review today', lines: ['Your reviews for today ({count}):', '{titles}', '?Reminder of the day: "{reminder}" ({source})', 'A few minutes are enough: retaking the quiz lifts your score.'], button: 'Start my reviews' },
    selfcheck_weekly: { subject: 'Your weekly check-in', lines: ['It is time to take stock, calmly.', '?Commitments in progress: {commitments}', '?Goals still waiting for this week\'s check-in: {goals}', 'A few minutes are enough. What you write there is visible to you only. You can turn this reminder off in My learning.'], button: 'Do my check-in' },
    kids_report: { subject: 'This week with {children}', lines: ['Here is what your children did over the last {days} days:', '{summary}', '?To revisit gently: {retry}', 'You can set the daily time and the catalogue for each child, or turn this e-mail off, in the Kids area.'], button: 'Open the Kids area' },
    review_approved: { subject: 'Your talk “{title}” is live', lines: ['After review, your talk “{title}” has been approved.', '?Message from the review: {note}'], button: 'Open the Studio' },
    review_rejected: { subject: 'Your talk “{title}” is not live', lines: ['After review, your talk “{title}” is not published for now.', 'Reason: {note}', 'You can fix it and send it back for review from the Studio.'], button: 'Open the Studio' },
    health_alert: { subject: '{title}', lines: ['{summary}', '?{advice}'], button: 'Open server health' },
    resume_talk: { subject: 'Pick up "{title}" where you left off', lines: ['You watched {minutes} min of "{title}", then life got in the way.', '?{cards}', '?A talk by {speaker}.', 'It is waiting for you at the exact minute you left it.'], button: 'Resume the talk', footer: 'You are receiving this email because you started this talk on {app}.' },
    welcome_nudge: { subject: 'Where to start on {app}?', lines: ['Your account is ready, but you have not watched anything yet. Here are three talks to start with:', '{titles}', 'Ten minutes is enough to tell whether it speaks to you.'], button: 'Get started', footer: 'You are receiving this email because you created an account on {app}.' },
    winback: { subject: 'What is new on {app} since you left', lines: ['Your subscription has ended, but the library keeps growing. Here is what arrived recently:', '{titles}', 'You can come back whenever you like, with no minimum commitment.'], button: 'Come back to {app}', footer: 'You are receiving this email because you were subscribed to {app}.' },
    weekly_letter: { subject: 'Your week on {app}', lines: ['Here is your week on {app}.', '?{cardsResume}', '?Notions to review this week: {due}.', '?{cardsFollow}', '?{cardsSelection}'], button: 'Open {app}', footer: 'You are receiving this letter because you asked for the weekly selection on {app}.' },
    sec: { cardsResume: 'Pick up where you left off', cardsFollow: 'New from your speakers', cardsSelection: 'Our selection' },
    account_deleted: { subject: 'Your {app} account has been deleted', lines: ['Your {app} account and personal data have been deleted, as you requested.', 'If a subscription was running, it has been stopped. As required by law, our payment providers keep the invoices already issued, and we keep the record of your acceptance of the terms.', 'If you did not make this request, reply to this email right away.'], button: '', footer: 'This email confirms the deletion of your account on {app}.' },
    test: { subject: '{app} test email', lines: ['This email confirms that the sending settings work.'], button: 'Open the site' },
    dub_ready: { subject: 'The French version of "{title}" is available', lines: ['The French version you requested is ready: "{title}".', 'In the player, pick "French version" under "Audio language".'], button: 'Listen to the talk' },
    helloAnon: 'Hello,', unsub: 'Unsubscribe in one click', manage: 'Manage my emails',
    speaker_new: { subject: 'New from the speakers you follow', lines: ['There is something new from the speakers you follow:', '{titles}'], button: 'See the talks' },
    weekly_selection: { subject: 'This week\'s selection', lines: ['Here is our selection for the week:', '{titles}'], button: 'Discover the selection' },
    gift_purchased: { subject: 'Your {months} gift card is ready', lines: ['Thank you! Your gift card ({months}) is paid.', 'Its code: {code}', '?We also sent it to {recipient}.', 'You can also give it yourself: the recipient enters it under “Redeem a gift card”. You will find it any time in My account.'], button: 'My gift cards', footer: 'You are receiving this email because you bought a gift card on {app}.' },
    gift_received: { subject: '{from} is giving you a {app} subscription', lines: ['{from} is giving you {months} of access to all the talks on {app}.', '?Their message: “{message}”', 'Your code: {code}', 'To redeem it, sign in (or create a free account) and enter this code. No payment, no automatic renewal.'], button: 'Redeem my gift card', footer: '{from} chose to send you this gift card. No other email will be sent to this address about it.' },
    gift_redeemed: { subject: 'Your gift card was redeemed', lines: ['{redeemer} redeemed the gift card you gave ({months}). Thank you for the kind gesture!'], button: 'My gift cards' },
    gift_activated: { subject: 'Your gift card is active', lines: ['Your gift card is active: you have access to all talks until {date}.'], button: 'Watch the talks' },
    referral_reward_referee: { subject: 'Your free month through referral', lines: ['Thank you for subscribing to {app}! Through referral, {months} is on us.', 'Your access now runs until {date}.', '?Your referrer: {referrer}.'], button: 'View my account' },
    referral_reward_referrer: { subject: 'Your friend subscribed: {months} on us', lines: ['{friend} subscribed thanks to you. Thank you for spreading the word about {app}!', '{months} is on us: your access now runs until {date}.'], button: 'My referrals' },
    plans: { month: 'monthly', year: 'yearly' },
  },
  ar: {
    hello: 'مرحبًا {name}،', team: 'فريق {app}', footer: 'تصلك هذه الرسالة لأن لديك حسابًا على {app}.',
    welcome: { subject: 'أهلًا بك في {app}', lines: ['تم إنشاء حسابك. يمكنك الآن مشاهدة المحاضرات المجانية ومعاينة كل محاضرة مميزة.', 'لمشاهدة كل شيء، جرّب الاشتراك مجانًا.'], button: 'اكتشف المحاضرات' },
    password_reset: { subject: 'إعادة تعيين كلمة المرور', lines: ['طلبت تغيير كلمة المرور. هذا الرابط صالح لمدة ساعة واحدة.', 'إن لم تكن صاحب الطلب فتجاهل هذه الرسالة: كلمة المرور لن تتغير.'], button: 'اختر كلمة مرور جديدة' },
    trial_ending: { subject: 'تنتهي تجربتك المجانية في {date}', lines: ['تنتهي تجربتك المجانية في {date}.', 'ما لم تُلغِ، سيبدأ اشتراكك ({plan}) وسيُخصم مبلغ {amount} في هذا التاريخ.', 'يمكنك الإلغاء في أي وقت قبل ذلك من صفحة حسابي دون أي خصم.'], button: 'إدارة اشتراكي' },
    payment_succeeded: { subject: 'تم استلام الدفع: {amount}', lines: ['استلمنا دفعتك بمبلغ {amount}. شكرًا لثقتك.', 'فاتورتك متاحة على الإنترنت.'], button: 'عرض الفاتورة' },
    payment_failed: { subject: 'تعذّر دفع اشتراكك', lines: ['لم يتم دفع مبلغ {amount}. يبقى وصولك مفتوحًا لبضعة أيام.', 'حدّث وسيلة الدفع لمتابعة المشاهدة.'], button: 'تحديث البطاقة' },
    subscription_canceled: { subject: 'تم تسجيل الإلغاء', lines: ['تم تسجيل إلغاء اشتراكك.', 'يبقى لك الوصول الكامل حتى {date}. يمكنك استئناف الاشتراك في أي وقت قبل ذلك.'], button: 'حسابي' },
    subscription_ended: { subject: 'انتهى اشتراكك', lines: ['انتهى اشتراكك. تبقى المحاضرات المجانية متاحة.', 'يمكنك الاشتراك من جديد متى شئت.'], button: 'عرض الباقات' },
    revision_daily: { subject: '{count} للمراجعة اليوم', lines: ['مراجعاتك اليوم ({count}):', '{titles}', '?تذكير اليوم: «{reminder}» ({source})', 'دقائق قليلة تكفي: إعادة الاختبار ترفع درجتك.'], button: 'ابدأ مراجعتي' },
    selfcheck_weekly: { subject: 'وقفتك الأسبوعية', lines: ['حان وقت الوقفة مع النفس بهدوء.', '?التزامات جارية: {commitments}', '?أهداف لم تُسجَّل وقفتها هذا الأسبوع: {goals}', 'دقائق قليلة تكفي. ما تكتبه لا يراه غيرك. يمكنك إيقاف هذا التذكير من «تعلّمي».'], button: 'أبدأ وقفتي' },
    kids_report: { subject: 'ملخص الأسبوع لـ {children}', lines: ['هذا ما فعله أطفالك خلال آخر {days} أيام:', '{summary}', '?للإعادة بهدوء: {retry}', 'يمكنك ضبط المدة اليومية والمحتوى لكل طفل، أو إيقاف هذه الرسالة، من فضاء الأطفال.'], button: 'فتح فضاء الأطفال' },
    review_approved: { subject: 'محاضرتك «{title}» منشورة', lines: ['بعد المراجعة، تمت الموافقة على محاضرتك «{title}».', '?رسالة المراجعة: {note}'], button: 'فتح الاستوديو' },
    review_rejected: { subject: 'محاضرتك «{title}» غير منشورة', lines: ['بعد المراجعة، لم تُنشر محاضرتك «{title}» في الوقت الحالي.', 'السبب: {note}', 'يمكنك تصحيحها ثم إعادة إرسالها للمراجعة من الاستوديو.'], button: 'فتح الاستوديو' },
    health_alert: { subject: '{title}', lines: ['{summary}', '?{advice}'], button: 'فتح صحة الخادم' },
    resume_talk: { subject: 'أكمل «{title}» من حيث توقفت', lines: ['شاهدت {minutes} دقيقة من «{title}» ثم شغلتك الحياة.', '?{cards}', '?محاضرة {speaker}.', 'مشاهدتك بانتظارك عند الدقيقة التي توقفت عندها تمامًا.'], button: 'متابعة المحاضرة', footer: 'تصلك هذه الرسالة لأنك بدأت مشاهدة هذه المحاضرة على {app}.' },
    welcome_nudge: { subject: 'من أين تبدأ على {app}؟', lines: ['حسابك جاهز لكنك لم تشاهد شيئًا بعد. إليك ثلاث محاضرات للبداية:', '{titles}', 'عشر دقائق تكفي لتعرف إن كانت تناسبك.'], button: 'ابدأ الآن', footer: 'تصلك هذه الرسالة لأنك أنشأت حسابًا على {app}.' },
    winback: { subject: 'الجديد على {app} منذ رحيلك', lines: ['انتهى اشتراكك لكن المكتبة تواصل النمو. إليك ما وصل مؤخرًا:', '{titles}', 'يمكنك العودة متى شئت دون التزام بمدة.'], button: 'العودة إلى {app}', footer: 'تصلك هذه الرسالة لأنك كنت مشتركًا في {app}.' },
    weekly_letter: { subject: 'أسبوعك على {app}', lines: ['هذا أسبوعك على {app}.', '?{cardsResume}', '?مفاهيم للمراجعة هذا الأسبوع: {due}.', '?{cardsFollow}', '?{cardsSelection}'], button: 'افتح {app}', footer: 'تصلك هذه الرسالة لأنك طلبت اختيارات الأسبوع على {app}.' },
    sec: { cardsResume: 'تابع من حيث توقفت', cardsFollow: 'جديد من محاضريك', cardsSelection: 'اختيارنا لك' },
    account_deleted: { subject: 'تم حذف حسابك على {app}', lines: ['تم حذف حسابك على {app} وبياناتك الشخصية بناءً على طلبك.', 'إن كان لديك اشتراك فقد أُوقف. وفقًا للقانون يحتفظ مزوّدو الدفع بالفواتير الصادرة، ونحتفظ بما يثبت موافقتك على الشروط.', 'إن لم تكن أنت صاحب الطلب فردّ على هذه الرسالة فورًا.'], button: '', footer: 'تؤكد هذه الرسالة حذف حسابك على {app}.' },
    test: { subject: 'رسالة اختبار من {app}', lines: ['تؤكد هذه الرسالة أن إعدادات الإرسال تعمل.'], button: 'فتح الموقع' },
    dub_ready: { subject: 'النسخة الفرنسية من «{title}» متاحة', lines: ['النسخة الفرنسية التي طلبتها جاهزة: «{title}».', 'في المشغّل، اختر «النسخة الفرنسية» ضمن «لغة الصوت».'], button: 'استمع إلى المحاضرة' },
    helloAnon: 'مرحبًا،', unsub: 'إلغاء الاشتراك بنقرة واحدة', manage: 'إدارة رسائلي',
    speaker_new: { subject: 'جديد من المحاضرين الذين تتابعهم', lines: ['جديد من المحاضرين الذين تتابعهم:', '{titles}'], button: 'عرض المحاضرات' },
    weekly_selection: { subject: 'اختيارات الأسبوع', lines: ['هذه اختياراتنا لهذا الأسبوع:', '{titles}'], button: 'اكتشف الاختيارات' },
    gift_purchased: { subject: 'بطاقة الهدية ({months}) جاهزة', lines: ['شكرًا لك! تم دفع بطاقة الهدية ({months}).', 'رمزها: {code}', '?أرسلناها أيضًا إلى {recipient}.', 'يمكنك أيضًا إهداؤها بنفسك: يدخل المستلم الرمز في «تفعيل بطاقة هدية». تجدها دائمًا في حسابي.'], button: 'بطاقات الهدايا', footer: 'تصلك هذه الرسالة لأنك اشتريت بطاقة هدية على {app}.' },
    gift_received: { subject: '{from} يهديك اشتراكًا في {app}', lines: ['يهديك {from} {months} من الوصول إلى جميع محاضرات {app}.', '?رسالته: «{message}»', 'رمزك: {code}', 'لتفعيله، سجّل الدخول (أو أنشئ حسابًا مجانيًا) ثم أدخل هذا الرمز. بلا دفع وبلا تجديد تلقائي.'], button: 'تفعيل بطاقة الهدية', footer: 'اختار {from} أن يرسل إليك بطاقة الهدية هذه. لن تصلك رسائل أخرى على هذا العنوان بهذا الشأن.' },
    gift_redeemed: { subject: 'تم تفعيل بطاقة الهدية', lines: ['فعّل {redeemer} بطاقة الهدية التي أهديتها ({months}). شكرًا على هذه اللفتة الكريمة!'], button: 'بطاقات الهدايا' },
    gift_activated: { subject: 'بطاقة الهدية مفعّلة', lines: ['بطاقة الهدية مفعّلة: يمكنك مشاهدة جميع المحاضرات حتى {date}.'], button: 'مشاهدة المحاضرات' },
    referral_reward_referee: { subject: 'شهرك المجاني بفضل الإحالة', lines: ['شكرًا لاشتراكك في {app}! بفضل الإحالة، لديك {months} مجانًا.', 'تم تمديد وصولك حتى {date}.', '?صاحب الدعوة: {referrer}.'], button: 'عرض حسابي' },
    referral_reward_referrer: { subject: 'اشترك صديقك: {months} مجانًا', lines: ['اشترك {friend} بفضلك. شكرًا لأنك عرّفت بـ {app}!', 'لديك {months} مجانًا: تم تمديد وصولك حتى {date}.'], button: 'إحالاتي' },
    plans: { month: 'شهري', year: 'سنوي' },
  },
};

const fill = (str, vars, escape) => str.replace(/\{(\w+)\}/g, (_, k) => (escape ? esc(vars[k] ?? '') : String(vars[k] ?? '')));

// vars : name, app, url (bouton), date, amount, plan, webUrl (logo).
export function renderEmail(kind, locale, vars) {
  const l = pickLocale(locale);
  const t = T[l];
  const m = t[kind];
  if (!m) throw new Error(`Modèle d'e-mail inconnu : ${kind}`);
  const v = { ...vars, plan: vars.interval ? t.plans[vars.interval] || vars.interval : vars.plan };
  const helloTxt = String(v.name ?? '').trim() ? t.hello : t.helloAnon;
  const footTxt = m.footer || t.footer;
  const subject = fill(m.subject, v, false);
  const dir = l === 'ar' ? 'rtl' : 'ltr';
  const align = l === 'ar' ? 'right' : 'left';
  const logo = v.webUrl ? `<img src="${esc(v.webUrl)}/brand/email-logo.png" alt="${esc(v.app)}" height="40" style="display:block;height:40px;border:0">` : `<span style="font:700 20px Arial,sans-serif;color:#F7C863">${esc(v.app)}</span>`;
  // Ligne commençant par « ? » : facultative, retirée si l'une de ses valeurs est vide.
  const lines = m.lines
    .filter((x) => !x.startsWith('?') || [...x.matchAll(/\{(\w+)\}/g)].every((g) => String(v[g[1]] ?? '').trim() !== ''))
    .map((x) => (/^\?\{cards\w*\}$/.test(x) ? x : x.replace(/^\?/, '')));
  // Cartes avec la couverture : v.cards (ou v.cardsXxx) = [{ id, title, speaker, path, poster }].
  // « {titles} » est remplacée par les cartes de v.cards (liste à puces conservée dans la version texte) ; une ligne « ?{cardsXxx} » affiche
  // les cartes d'une section (titre de section t.sec.cardsXxx, version texte en puces) ; la ligne « ?{cards} » n'existe qu'en HTML.
  const listOf = (k) => (Array.isArray(v[k]) ? v[k].filter((c) => c && c.title) : []);
  const cardKey = (x) => (/^\?\{(cards\w*)\}$/.exec(x) || [])[1];
  const cardsTable = (list) => (list.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${list.map((c) => {
    const href = v.webUrl && c.path ? v.webUrl + c.path : v.url || '#';
    const img = c.poster && v.webUrl && c.id ? `<td width="132" valign="top" style="padding:0 12px 12px 0"><a href="${esc(href)}"><img src="${esc(v.webUrl)}/api/seo/poster/talks/${esc(c.id)}" alt="${esc(c.title)}" width="120" style="display:block;width:120px;max-width:100%;height:auto;border:0;border-radius:8px;background:#EFE7DA"></a></td>` : '';
    return `<tr>${img}<td valign="top" style="padding:0 0 12px;font:15px/1.4 Arial,sans-serif;color:#2B241A"><a href="${esc(href)}" style="color:#120D06;font-weight:700;text-decoration:none">${esc(c.title)}</a>${c.speaker ? `<br><span style="color:#7A6F5F">${esc(c.speaker)}</span>` : ''}</td></tr>`;
  }).join('')}</table>` : '');
  const secHead = (k) => (t.sec?.[k] ? `<p style="margin:18px 0 8px;font:700 13px Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#B07A12">${esc(t.sec[k])}</p>` : '');
  const bullets = (list) => list.map((c) => `• ${c.title}${c.speaker ? ` — ${c.speaker}` : ''}${v.webUrl && c.path ? ` : ${v.webUrl}${c.path}` : ''}`).join('\n');
  const paras = lines.filter((x) => !(cardKey(x) && !listOf(cardKey(x)).length)).map((line) => {
    const k = cardKey(line);
    if (k) return secHead(k) + cardsTable(listOf(k));
    if (line === '{titles}' && listOf('cards').length) return cardsTable(listOf('cards'));
    return `<p style="margin:0 0 14px;font:16px/1.55 Arial,sans-serif;color:#2B241A">${fill(line, v, true).replace(/\n/g, '<br>')}</p>`;
  }).join('');
  const unsubHtml = v.unsubUrl ? `<br><a href="${esc(v.unsubUrl)}" style="color:#7A6F5F">${esc(t.unsub)}</a>${v.prefsUrl ? ` · <a href="${esc(v.prefsUrl)}" style="color:#7A6F5F">${esc(t.manage)}</a>` : ''}` : '';
  const button = v.url ? `<p style="margin:22px 0 6px"><a href="${esc(v.url)}" style="display:inline-block;background:#E6A739;color:#120D06;font:700 16px Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:999px">${fill(m.button, v, true)}</a></p>` : '';
  const html = `<!doctype html><html lang="${l}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#F4EFE6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B0906;padding:18px 24px;text-align:${align}">${logo}</td></tr>
<tr><td dir="${dir}" style="padding:28px 24px 20px;text-align:${align}">
<p style="margin:0 0 16px;font:700 17px Arial,sans-serif;color:#120D06">${fill(helloTxt, v, true)}</p>
${paras}${button}
<p style="margin:22px 0 0;font:15px Arial,sans-serif;color:#5C5244">${fill(t.team, v, true)}</p>
</td></tr>
<tr><td dir="${dir}" style="padding:14px 24px 22px;border-top:1px solid #EFE7DA;font:12px/1.5 Arial,sans-serif;color:#7A6F5F;text-align:${align}">${fill(footTxt, v, true)}${unsubHtml}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [fill(helloTxt, v, false), '', ...lines.flatMap((x) => { const k = cardKey(x); return k ? (t.sec?.[k] && listOf(k).length ? ['', t.sec[k].toUpperCase(), bullets(listOf(k))] : []) : [fill(x, v, false)]; }), '', v.url ? `${fill(m.button, v, false)} : ${v.url}` : '', '', fill(t.team, v, false), '', fill(footTxt, v, false), v.unsubUrl ? `${t.unsub} : ${v.unsubUrl}` : '']
    .filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  return { subject, html, text };
}
