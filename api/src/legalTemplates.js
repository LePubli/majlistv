// Étape D — Pages légales : modèles en français (version qui fait foi), anglais et arabe, remplis avec Admin → Paramètres →
// Informations légales. Ils décrivent le service tel qu'il est construit (abonnements, achats à l'unité, cartes cadeaux, espace enfants,
// fonctions d'intelligence artificielle, applications, notifications…). À faire relire par un professionnel du droit avant le lancement.
//
// Syntaxe des modèles : « ## » titre, « - » élément de liste, ligne vide = paragraphe.
//   {{clé}}      remplacé par la valeur du réglage ; vide → « [à compléter : …] » (visible, pour ne rien oublier)
//   ligne « ?? » ligne facultative : retirée si l'un de ses {{…}} est vide (capital, RCS, TVA, téléphone…)

/** Réglages utilisés par les modèles : clé du modèle → réglage, et libellé de la mention « à compléter » (fr, en, ar). */
export const LEGAL_FIELDS = {
  company: ['legal_company', 'raison sociale ou nom de l’éditeur', 'company or publisher name', 'اسم الناشر أو الشركة'],
  status: ['legal_status', 'forme juridique', 'legal form', 'الشكل القانوني'],
  capital: ['legal_capital', 'capital', 'share capital', 'رأس المال'],
  address: ['legal_address', 'adresse du siège', 'registered address', 'عنوان المقر'],
  siret: ['legal_siret', 'numéro SIRET', 'SIRET number', 'رقم SIRET'],
  rcs: ['legal_rcs', 'RCS', 'trade register', 'السجل التجاري'],
  vat: ['legal_vat', 'TVA intracommunautaire', 'EU VAT number', 'رقم الضريبة الأوروبي'],
  email: ['legal_email', 'e-mail de contact', 'contact email', 'بريد التواصل'],
  phone: ['legal_phone', 'téléphone', 'phone', 'الهاتف'],
  director: ['legal_director', 'directeur de la publication', 'publication director', 'مدير النشر'],
  host: ['legal_host_name', 'nom de l’hébergeur', 'hosting provider', 'اسم المستضيف'],
  hostAddress: ['legal_host_address', 'adresse de l’hébergeur', 'hosting provider address', 'عنوان المستضيف'],
  hostPhone: ['legal_host_phone', 'téléphone de l’hébergeur', 'hosting provider phone', 'هاتف المستضيف'],
  mediator: ['legal_mediator', 'médiateur de la consommation (nom et coordonnées)', 'consumer mediator (name and contact)', 'وسيط المستهلك (الاسم والعنوان)'],
  court: ['legal_court', 'tribunal compétent', 'competent court', 'المحكمة المختصة'],
  mailProvider: ['legal_mail_provider', 'prestataire d’envoi des e-mails', 'email delivery provider', 'مزوّد إرسال البريد'],
};
export const LEGAL_LANGS = ['fr', 'en', 'ar'];
export const LEGAL_SLUGS = ['mentions-legales', 'cgv', 'confidentialite'];
const TODO = { fr: 'à compléter', en: 'to be completed', ar: 'يُستكمل' };

/** Remplit un modèle. vars : { clé: valeur } (app, site, askDays… en plus des réglages). Renvoie { text, missing: [clés obligatoires vides] }. */
export function fillTemplate(text, vars, lang = 'fr') {
  const missing = new Set();
  const idx = { fr: 1, en: 2, ar: 3 }[lang] || 1;
  const val = (k) => String(vars[k] ?? '').trim();
  const lines = [];
  for (const raw of String(text).split('\n')) {
    let line = raw;
    if (line.startsWith('?? ')) {
      line = line.slice(3);
      const keys = [...line.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      if (keys.some((k) => !val(k))) continue;
    }
    lines.push(line.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      const v = val(k);
      if (v) return v;
      missing.add(k);
      return `[${TODO[lang] || TODO.fr} : ${LEGAL_FIELDS[k]?.[idx] ?? k}]`;
    }));
  }
  return { text: lines.join('\n'), missing: [...missing] };
}

// ---------------------------------------------------------------------------------------------------------------------------
// MENTIONS LÉGALES
// ---------------------------------------------------------------------------------------------------------------------------
const MENTIONS = {
  fr: { title: 'Mentions légales', body: `## Éditeur du site et des applications
Le site {{site}} et les applications {{app}} (téléphone, télévision, voiture) sont édités par :
- {{company}}
- Forme juridique : {{status}}
?? - Capital social : {{capital}}
- Siège : {{address}}
- SIRET : {{siret}}
?? - RCS : {{rcs}}
?? - TVA intracommunautaire : {{vat}}
- Contact : {{email}}
?? - Téléphone : {{phone}}
- Directeur de la publication : {{director}}

## Hébergement
- Hébergeur : {{host}}
- Adresse : {{hostAddress}}
?? - Téléphone : {{hostPhone}}
Les vidéos, fichiers audio et données du service sont stockés sur les serveurs de cet hébergeur.

## Propriété intellectuelle
Les vidéos, enregistrements audio, textes, transcriptions, traductions, logos et éléments graphiques sont protégés par le droit d'auteur et appartiennent à {{company}}, aux intervenants ou à leurs ayants droit. Toute reproduction, diffusion, extraction ou réutilisation, totale ou partielle, sans autorisation écrite est interdite. Le visionnage et l'écoute sont réservés à un usage personnel et privé.

## Contenus des intervenants
Les propos tenus dans les vidéos et les contenus audio n'engagent que leurs auteurs. Les vidéos publiées par des organisateurs et des chaînes partenaires le sont sous leur responsabilité.

## Contenus produits automatiquement
Les transcriptions, sous-titres traduits, résumés, chapitres, quiz, doublages et réponses de l'assistant sont produits automatiquement, notamment par des outils d'intelligence artificielle. Ils peuvent contenir des erreurs ; ils ne remplacent ni la vidéo d'origine ni l'avis d'une personne qualifiée et ne constituent pas un avis religieux (fatwa).

## Vidéos d'autres plateformes et chaînes en direct
Certaines vidéos et chaînes en direct sont lues depuis YouTube, Vimeo, Dailymotion ou archive.org, avec leur lecteur : elles restent soumises aux conditions de ces plateformes.

## Signaler un contenu
Pour signaler un contenu qui vous semble illicite ou porter atteinte à vos droits, écrivez à {{email}} en précisant l'adresse de la page et la raison du signalement. Nous répondons dans les meilleurs délais et retirons le contenu lorsque le signalement est fondé.` },
  en: { title: 'Legal notice', body: `## Publisher of the website and apps
The website {{site}} and the {{app}} apps (phone, TV, car) are published by:
- {{company}}
- Legal form: {{status}}
?? - Share capital: {{capital}}
- Registered office: {{address}}
- SIRET: {{siret}}
?? - Trade register (RCS): {{rcs}}
?? - EU VAT number: {{vat}}
- Contact: {{email}}
?? - Phone: {{phone}}
- Publication director: {{director}}

## Hosting
- Hosting provider: {{host}}
- Address: {{hostAddress}}
?? - Phone: {{hostPhone}}
The service's videos, audio files and data are stored on this provider's servers.

## Intellectual property
Videos, audio recordings, texts, transcripts, translations, logos and graphics are protected by copyright and belong to {{company}}, to the speakers or to their rights holders. Any reproduction, distribution, extraction or reuse, in whole or in part, without written permission is prohibited. Watching and listening are for personal, private use only.

## Speakers' content
Statements made in the videos and audio content are the sole responsibility of their authors. Videos published by organisers and partner channels are published under their responsibility.

## Automatically generated content
Transcripts, translated subtitles, summaries, chapters, quizzes, dubbing and the assistant's answers are generated automatically, in particular by artificial intelligence tools. They may contain errors; they replace neither the original video nor the advice of a qualified person, and they are not a religious ruling (fatwa).

## Videos from other platforms and live channels
Some videos and live channels are played from YouTube, Vimeo, Dailymotion or archive.org, with their own player: they remain subject to those platforms' terms.

## Reporting content
To report content you believe is unlawful or infringes your rights, write to {{email}} with the page address and the reason for your report. We answer as soon as possible and remove the content when the report is justified.

This translation is provided for convenience; the French version prevails.` },
  ar: { title: 'الإشعار القانوني', body: `## ناشر الموقع والتطبيقات
ينشر الموقع {{site}} وتطبيقات {{app}} (الهاتف والتلفاز والسيارة):
- {{company}}
- الشكل القانوني: {{status}}
?? - رأس المال: {{capital}}
- المقر: {{address}}
- رقم SIRET: {{siret}}
?? - السجل التجاري (RCS): {{rcs}}
?? - رقم الضريبة الأوروبي: {{vat}}
- التواصل: {{email}}
?? - الهاتف: {{phone}}
- مدير النشر: {{director}}

## الاستضافة
- المستضيف: {{host}}
- العنوان: {{hostAddress}}
?? - الهاتف: {{hostPhone}}
تُحفظ فيديوهات الخدمة وملفاتها الصوتية وبياناتها على خوادم هذا المستضيف.

## الملكية الفكرية
الفيديوهات والتسجيلات الصوتية والنصوص والتفريغات والترجمات والشعارات والعناصر الرسومية محمية بحقوق المؤلف، وهي ملك لـ {{company}} أو للمحاضرين أو لأصحاب الحقوق. يُمنع أي نسخ أو نشر أو استخراج أو إعادة استخدام، كليًا أو جزئيًا، دون إذن كتابي. المشاهدة والاستماع للاستعمال الشخصي الخاص فقط.

## محتوى المحاضرين
ما يُقال في الفيديوهات والمحتوى الصوتي يُلزم أصحابه وحدهم. والفيديوهات التي ينشرها المنظمون والقنوات الشريكة تُنشر على مسؤوليتهم.

## المحتوى المُنتَج آليًا
التفريغات والترجمات والملخصات والفصول والاختبارات والدبلجة وأجوبة المساعد تُنتَج آليًا، ولا سيما بأدوات الذكاء الاصطناعي. قد تحتوي على أخطاء، ولا تُغني عن الفيديو الأصلي ولا عن رأي شخص مؤهَّل، وليست فتوى.

## فيديوهات المنصات الأخرى والقنوات المباشرة
تُشغَّل بعض الفيديوهات والقنوات المباشرة من YouTube أو Vimeo أو Dailymotion أو archive.org بمشغّلها الخاص، وتبقى خاضعة لشروط تلك المنصات.

## الإبلاغ عن محتوى
للإبلاغ عن محتوى تراه غير مشروع أو ماسًّا بحقوقك، راسل {{email}} مع ذكر عنوان الصفحة وسبب الإبلاغ. نجيب في أقرب وقت ونحذف المحتوى إذا كان الإبلاغ في محله.

هذه الترجمة للتيسير، والنسخة الفرنسية هي المعتمدة.` },
};

// ---------------------------------------------------------------------------------------------------------------------------
// CONDITIONS GÉNÉRALES DE VENTE ET D'UTILISATION
// ---------------------------------------------------------------------------------------------------------------------------
const CGV = {
  fr: { title: "Conditions générales de vente et d'utilisation", body: `## 1. Objet
Les présentes conditions encadrent l'utilisation du service {{app}} (site {{site}} et applications pour téléphone, télévision et voiture), édité par {{company}}, ainsi que les achats qui y sont proposés : abonnements, contenus payants à l'unité et cartes cadeaux. Créer un compte, s'abonner ou acheter vaut acceptation de ces conditions, dans leur version en vigueur au jour de l'opération.

## 2. Le service
{{app}} propose des vidéos (conférences, cours, chaînes en direct), des contenus audio (livres audio et podcasts « Audyn ») et des outils d'apprentissage (quiz, révision, suivi de lecture du Coran, adhkar, rappels de prière, mise en pratique, bilans). Certains contenus sont en accès libre, d'autres sont réservés aux abonnés, d'autres encore se paient à l'unité. Un aperçu gratuit est proposé pour les contenus réservés.

## 3. Compte
- La création d'un compte est gratuite. Le compte est strictement personnel ; vous êtes responsable de la confidentialité de votre mot de passe et des appareils connectés (y compris une télévision reliée par code).
- Tout achat doit être fait par une personne majeure ou avec l'accord de ses parents.
- Les enfants accèdent au service par l'espace enfants (article 9), sous la responsabilité du titulaire du compte.

## 4. Abonnements
- Formules mensuelles et annuelles, aux prix affichés sur la page Abonnement au moment de la souscription, toutes taxes comprises. Le prix peut dépendre du pays.
- Essai gratuit à la première souscription, une seule fois par compte, pour la durée indiquée au moment de l'inscription.
- Sans résiliation, l'abonnement se renouvelle automatiquement à la fin de chaque période, au prix en vigueur. Tout changement de prix vous est annoncé avant qu'il s'applique ; vous pouvez alors résilier.
- Les codes promotionnels s'appliquent selon les conditions indiquées avec le code.
- Résiliation à tout moment dans Mon compte → Abonnement : elle prend effet à la fin de la période en cours, l'accès reste ouvert jusqu'à cette date. Une résiliation pendant l'essai gratuit n'entraîne aucun prélèvement. Une période commencée n'est pas remboursée, sauf disposition légale contraire.

## 5. Contenus payants à l'unité
- Certaines vidéos et certains contenus audio se paient à part, en plus de l'abonnement : l'abonnement n'y donne pas accès. Une réduction peut être accordée aux abonnés ; elle est indiquée avant le paiement.
- Achat : accès sans limite de durée, depuis votre compte, tant que le service existe et que votre compte n'est pas supprimé.
- Location : accès pendant la durée indiquée (par exemple 48 heures), à partir de la confirmation du paiement. Un contenu loué ne peut pas être téléchargé pour une lecture hors connexion.
- Le paiement se fait sur le site, avec le même compte ; l'accès s'ouvre sur le site et dans les applications dès la confirmation du paiement. Vos achats sont listés dans Mon compte → Mes achats.
- Si un contenu acheté devait être retiré pour une raison qui ne vous est pas imputable (par exemple une demande d'un ayant droit), nous vous proposerons son remboursement.

## 6. Cartes cadeaux
Une carte cadeau donne droit à une période d'abonnement. Son code est utilisable une seule fois, dans le délai de validité indiqué à l'achat ; il n'est ni échangeable ni remboursable en espèces, sauf disposition légale contraire.

## 7. Paiement
Les paiements sont traités par notre prestataire Stripe (carte bancaire et, s'il est proposé, PayPal). Nous ne recevons ni ne conservons vos données de carte. Les prix sont indiqués toutes taxes comprises ; une facture ou un reçu est disponible auprès de Stripe.

## 8. Droit de rétractation
Le service fournit des contenus numériques sans support matériel. Conformément à l'article L221-28 du Code de la consommation, lorsque vous demandez l'accès immédiat (abonnement, achat ou location d'un contenu) et renoncez expressément à votre droit de rétractation, vous ne pouvez plus l'exercer une fois l'accès commencé. Votre accord est enregistré et horodaté. Pour une carte cadeau dont le code n'a pas encore été utilisé, vous disposez d'un délai de rétractation de 14 jours à compter de l'achat : écrivez à {{email}}.

## 9. Espace enfants
- L'espace enfants est ouvert depuis le compte d'un parent abonné : le parent crée les profils, choisit les contenus autorisés et la durée d'utilisation quotidienne, et fixe un code parental qui protège la sortie de l'espace.
- Le parent reste responsable de l'usage du service par ses enfants et de la confidentialité du code parental.
- Les contenus payants à l'unité n'apparaissent pas dans l'espace enfants.

## 10. Utilisation du service
- Les contenus sont destinés à un usage personnel et privé. Il est interdit de les copier, enregistrer, rediffuser, revendre, de contourner les protections techniques ou d'extraire des données de manière automatisée.
- Les téléchargements pour une lecture hors connexion restent dans l'application, pour une durée limitée, et ne sont lisibles qu'avec votre compte.
- Les textes que vous publiez ou envoyez (notes, propositions de correction, questions à l'assistant, signalements) doivent être respectueux et licites. Nous pouvons les modérer ou les retirer.
- En cas de manquement grave (fraude, partage de compte, contenu illicite, atteinte au service), nous pouvons suspendre ou fermer le compte, après vous avoir informé lorsque c'est possible.

## 11. Organisateurs et chaînes
Les organisateurs et chaînes qui publient des contenus garantissent détenir les droits nécessaires (images, sons, propos des intervenants) et attestent ces droits lorsqu'ils importent une vidéo ou un contenu audio d'une autre source. Ils sont responsables des contenus qu'ils publient et des prix qu'ils fixent pour leurs contenus vendus à l'unité.

## 12. Fonctions d'intelligence artificielle
Transcriptions, traductions, résumés, chapitres, quiz, doublages et réponses de l'assistant sont produits automatiquement et peuvent comporter des erreurs. Ils sont fournis à titre d'aide, ne remplacent pas la vidéo d'origine et ne constituent ni un avis religieux (fatwa), ni un conseil médical, juridique ou financier. Le nombre de questions à l'assistant peut être limité.

## 13. Disponibilité et responsabilité
Nous faisons nos meilleurs efforts pour assurer l'accès au service, sans garantie d'absence d'interruption (maintenance, incident, panne d'un prestataire ou d'une plateforme vidéo). Notre responsabilité ne peut être engagée qu'en cas de faute prouvée, pour un dommage direct, et dans la limite des sommes que vous avez payées au cours des douze derniers mois, sauf disposition légale contraire.

## 14. Données personnelles
Le traitement de vos données est décrit dans la Politique de confidentialité. Vous pouvez exporter vos données ou supprimer votre compte depuis Mon compte.

## 15. Modification des conditions
Nous pouvons faire évoluer ces conditions. Les changements importants vous sont annoncés à l'avance ; les conditions applicables à un achat sont celles acceptées lors de cet achat.

## 16. Réclamations et médiation
Pour toute réclamation : {{email}}. En cas de litige non résolu, vous pouvez recourir gratuitement au médiateur de la consommation : {{mediator}}.

## 17. Droit applicable
Ces conditions sont soumises au droit français. À défaut d'accord amiable, le litige est porté devant {{court}}, sous réserve des règles protectrices du consommateur qui vous permettent de saisir le tribunal de votre domicile.` },
  en: { title: 'Terms of sale and use', body: `## 1. Purpose
These terms govern the use of the {{app}} service (website {{site}} and apps for phone, TV and car), published by {{company}}, and the purchases offered on it: subscriptions, pay-per-item content and gift cards. Creating an account, subscribing or buying means you accept these terms, in their version in force on the day of the transaction.

## 2. The service
{{app}} offers videos (lectures, courses, live channels), audio content (“Audyn” audiobooks and podcasts) and learning tools (quizzes, revision, Quran reading tracking, adhkar, prayer reminders, putting into practice, reviews). Some content is free, some is for subscribers, and some is sold separately. A free preview is offered for restricted content.

## 3. Account
- Creating an account is free. The account is strictly personal; you are responsible for keeping your password and connected devices (including a TV linked by code) secure.
- Any purchase must be made by an adult or with parental consent.
- Children use the service through the kids area (section 9), under the account holder's responsibility.

## 4. Subscriptions
- Monthly and yearly plans, at the prices shown on the Subscription page at the time of subscribing, all taxes included. Prices may depend on the country.
- Free trial on the first subscription, once per account, for the period shown when signing up.
- Unless cancelled, the subscription renews automatically at the end of each period, at the current price. Any price change is announced before it applies; you may then cancel.
- Promo codes apply under the conditions shown with the code.
- Cancel at any time in My account → Subscription: it takes effect at the end of the current period, and access stays open until then. Cancelling during the free trial means no charge. A started period is not refunded, unless the law provides otherwise.

## 5. Pay-per-item content
- Some videos and audio content are paid separately, in addition to the subscription: the subscription does not give access to them. Subscribers may get a discount, shown before payment.
- Purchase: access with no time limit, from your account, for as long as the service exists and your account is not deleted.
- Rental: access for the period shown (for example 48 hours), from payment confirmation. Rented content cannot be downloaded for offline playback.
- Payment is made on the website, with the same account; access opens on the website and in the apps as soon as payment is confirmed. Your purchases are listed in My account → My purchases.
- If purchased content had to be withdrawn for a reason not attributable to you (for example at a rights holder's request), we will offer you a refund.

## 6. Gift cards
A gift card gives a subscription period. Its code can be used once, within the validity period shown at purchase; it cannot be exchanged or refunded in cash, unless the law provides otherwise.

## 7. Payment
Payments are processed by our provider Stripe (card and, where offered, PayPal). We neither receive nor store your card details. Prices include all taxes; an invoice or receipt is available from Stripe.

## 8. Right of withdrawal
The service provides digital content without a physical medium. Under article L221-28 of the French Consumer Code, when you ask for immediate access (subscription, purchase or rental of content) and expressly waive your right of withdrawal, you can no longer exercise it once access has begun. Your consent is recorded and time-stamped. For a gift card whose code has not been used yet, you have 14 days from purchase to withdraw: write to {{email}}.

## 9. Kids area
- The kids area is opened from a subscribed parent's account: the parent creates the profiles, chooses the allowed content and daily time, and sets a parental code that protects leaving the area.
- The parent remains responsible for their children's use of the service and for keeping the parental code secret.
- Pay-per-item content does not appear in the kids area.

## 10. Use of the service
- Content is for personal, private use. Copying, recording, redistributing or reselling it, bypassing technical protections or extracting data automatically is prohibited.
- Downloads for offline playback stay in the app, for a limited time, and can only be played with your account.
- Texts you publish or send (notes, correction suggestions, questions to the assistant, reports) must be respectful and lawful. We may moderate or remove them.
- In case of serious breach (fraud, account sharing, unlawful content, harm to the service), we may suspend or close the account, after informing you where possible.

## 11. Organisers and channels
Organisers and channels that publish content guarantee they hold the necessary rights (images, sound, speakers' words) and certify those rights when importing a video or audio content from another source. They are responsible for the content they publish and for the prices they set for their pay-per-item content.

## 12. Artificial intelligence features
Transcripts, translations, summaries, chapters, quizzes, dubbing and the assistant's answers are generated automatically and may contain errors. They are provided as an aid, do not replace the original video and are neither a religious ruling (fatwa) nor medical, legal or financial advice. The number of questions to the assistant may be limited.

## 13. Availability and liability
We do our best to keep the service available, without guaranteeing it will never be interrupted (maintenance, incident, failure of a provider or video platform). Our liability is limited to proven fault, direct damage, and the amounts you paid in the last twelve months, unless the law provides otherwise.

## 14. Personal data
How your data is processed is described in the Privacy policy. You can export your data or delete your account from My account.

## 15. Changes to these terms
We may update these terms. Significant changes are announced in advance; the terms applying to a purchase are those accepted at the time of that purchase.

## 16. Complaints and mediation
For any complaint: {{email}}. If a dispute is not resolved, you may use the consumer mediator free of charge: {{mediator}}.

## 17. Governing law
These terms are governed by French law. Failing an amicable agreement, disputes go before {{court}}, subject to consumer protection rules allowing you to go to the court where you live.

This translation is provided for convenience; the French version prevails.` },
  ar: { title: 'الشروط العامة للبيع والاستخدام', body: `## 1. الموضوع
تنظّم هذه الشروط استخدام خدمة {{app}} (الموقع {{site}} وتطبيقات الهاتف والتلفاز والسيارة) التي تنشرها {{company}}، والمشتريات المعروضة فيها: الاشتراكات والمحتوى المدفوع بالوحدة وبطاقات الهدايا. إنشاء حساب أو الاشتراك أو الشراء يعني قبول هذه الشروط بنسختها السارية يوم العملية.

## 2. الخدمة
تقدّم {{app}} فيديوهات (محاضرات ودروس وقنوات مباشرة) ومحتوى صوتيًا (كتب صوتية وبودكاست «Audyn») وأدوات تعلّم (اختبارات ومراجعة ومتابعة قراءة القرآن والأذكار وتذكير بالصلاة والتطبيق العملي والحصائل). بعض المحتوى مجاني، وبعضه للمشتركين، وبعضه يُباع بالوحدة. تُتاح معاينة مجانية للمحتوى المحجوز.

## 3. الحساب
- إنشاء الحساب مجاني. الحساب شخصي تمامًا، وأنت مسؤول عن سرية كلمة المرور والأجهزة المرتبطة (بما فيها تلفاز مربوط برمز).
- يجب أن يقوم بأي شراء شخص بالغ أو بموافقة والديه.
- يدخل الأطفال الخدمة عبر فضاء الأطفال (المادة 9) تحت مسؤولية صاحب الحساب.

## 4. الاشتراكات
- باقات شهرية وسنوية بالأسعار المعروضة في صفحة الاشتراك وقت الاشتراك، شاملة الضرائب. قد يختلف السعر حسب البلد.
- تجربة مجانية عند أول اشتراك، مرة واحدة لكل حساب، للمدة المبيّنة عند التسجيل.
- ما لم يُلغَ الاشتراك يتجدد تلقائيًا في نهاية كل فترة بالسعر الساري. يُعلَن أي تغيير في السعر قبل تطبيقه، ويمكنك حينها الإلغاء.
- تُطبَّق رموز التخفيض وفق الشروط المذكورة معها.
- الإلغاء في أي وقت من «حسابي ← الاشتراك»: يسري في نهاية الفترة الجارية ويبقى الوصول مفتوحًا حتى ذلك التاريخ. الإلغاء أثناء التجربة المجانية لا يترتب عليه أي اقتطاع. لا تُستردّ فترة بدأت، ما لم ينص القانون على خلاف ذلك.

## 5. المحتوى المدفوع بالوحدة
- بعض الفيديوهات والمحتوى الصوتي يُدفع ثمنه على حدة إضافة إلى الاشتراك، ولا يمنح الاشتراك الوصول إليه. قد يحصل المشتركون على خصم يُبيَّن قبل الدفع.
- الشراء: وصول غير محدد المدة من حسابك ما دامت الخدمة قائمة ولم يُحذف حسابك.
- الاستئجار: وصول طوال المدة المبيّنة (مثلًا 48 ساعة) من تأكيد الدفع. لا يمكن تنزيل المحتوى المستأجَر للمشاهدة دون اتصال.
- يتم الدفع على الموقع بنفس الحساب، ويُفتح الوصول على الموقع وفي التطبيقات فور تأكيد الدفع. تجد مشترياتك في «حسابي ← مشترياتي».
- إذا اضطررنا إلى سحب محتوى مشترى لسبب لا يُنسب إليك (كطلب من صاحب الحق)، نعرض عليك استرداد ثمنه.

## 6. بطاقات الهدايا
تمنح بطاقة الهدية فترة اشتراك. يُستخدم رمزها مرة واحدة خلال مدة الصلاحية المبيّنة عند الشراء، ولا يُستبدل ولا يُستردّ نقدًا ما لم ينص القانون على خلاف ذلك.

## 7. الدفع
يعالج الدفعَ مزوّدنا Stripe (بطاقة بنكية، وPayPal إن كان متاحًا). لا نستلم بيانات بطاقتك ولا نحفظها. الأسعار شاملة الضرائب، والفاتورة أو الإيصال متاح لدى Stripe.

## 8. حق التراجع
تقدّم الخدمة محتوى رقميًا دون وسيط مادي. وفق المادة L221-28 من قانون الاستهلاك الفرنسي، عندما تطلب الوصول الفوري (اشتراك أو شراء محتوى أو استئجاره) وتتنازل صراحةً عن حق التراجع، لا يمكنك ممارسته بعد بدء الوصول. تُسجَّل موافقتك مع تاريخها ووقتها. أما بطاقة الهدية التي لم يُستخدم رمزها بعد، فلك مهلة تراجع 14 يومًا من الشراء: راسل {{email}}.

## 9. فضاء الأطفال
- يُفتح فضاء الأطفال من حساب والد مشترك: ينشئ الوالد الملفات ويختار المحتوى المسموح والمدة اليومية، ويضع رمزًا أبويًا يحمي الخروج من الفضاء.
- يبقى الوالد مسؤولًا عن استخدام أطفاله للخدمة وعن سرية الرمز الأبوي.
- لا يظهر المحتوى المدفوع بالوحدة في فضاء الأطفال.

## 10. استخدام الخدمة
- المحتوى للاستعمال الشخصي الخاص. يُمنع نسخه أو تسجيله أو إعادة بثه أو بيعه أو تجاوز الحمايات التقنية أو استخراج البيانات آليًا.
- تبقى التنزيلات للمشاهدة دون اتصال داخل التطبيق لمدة محدودة، ولا تُشغَّل إلا بحسابك.
- يجب أن تكون النصوص التي تنشرها أو ترسلها (ملاحظات، اقتراحات تصحيح، أسئلة للمساعد، بلاغات) محترمة ومشروعة، ويمكننا مراجعتها أو حذفها.
- عند مخالفة جسيمة (احتيال، مشاركة الحساب، محتوى غير مشروع، إضرار بالخدمة) يمكننا تعليق الحساب أو إغلاقه، مع إبلاغك متى أمكن.

## 11. المنظمون والقنوات
يضمن المنظمون والقنوات الذين ينشرون محتوى امتلاكهم الحقوق اللازمة (الصور والأصوات وكلام المحاضرين)، ويُقرّون بها عند استيراد فيديو أو محتوى صوتي من مصدر آخر. وهم مسؤولون عن المحتوى الذي ينشرونه وعن الأسعار التي يحددونها لمحتواهم المبيع بالوحدة.

## 12. وظائف الذكاء الاصطناعي
التفريغات والترجمات والملخصات والفصول والاختبارات والدبلجة وأجوبة المساعد تُنتَج آليًا وقد تتضمن أخطاء. هي وسيلة مساعدة، ولا تُغني عن الفيديو الأصلي، وليست فتوى ولا نصيحة طبية أو قانونية أو مالية. قد يكون عدد الأسئلة للمساعد محدودًا.

## 13. التوفر والمسؤولية
نبذل قصارى جهدنا لإتاحة الخدمة دون ضمان عدم انقطاعها (صيانة، عطل، تعطل مزوّد أو منصة فيديو). لا تقوم مسؤوليتنا إلا عند خطأ مُثبَت، عن ضرر مباشر، وفي حدود المبالغ التي دفعتها خلال الاثني عشر شهرًا الأخيرة، ما لم ينص القانون على خلاف ذلك.

## 14. البيانات الشخصية
تصف سياسة الخصوصية كيفية معالجة بياناتك. يمكنك تصدير بياناتك أو حذف حسابك من «حسابي».

## 15. تعديل الشروط
قد نطوّر هذه الشروط. تُعلَن التغييرات المهمة مسبقًا، والشروط السارية على أي شراء هي التي قُبلت عند ذلك الشراء.

## 16. الشكاوى والوساطة
لأي شكوى: {{email}}. وإن لم يُحلّ النزاع، يمكنك اللجوء مجانًا إلى وسيط المستهلك: {{mediator}}.

## 17. القانون المطبَّق
تخضع هذه الشروط للقانون الفرنسي. وعند تعذّر الاتفاق الودي يُرفع النزاع إلى {{court}}، مع مراعاة قواعد حماية المستهلك التي تتيح لك اللجوء إلى محكمة محل إقامتك.

هذه الترجمة للتيسير، والنسخة الفرنسية هي المعتمدة.` },
};

// ---------------------------------------------------------------------------------------------------------------------------
// POLITIQUE DE CONFIDENTIALITÉ
// ---------------------------------------------------------------------------------------------------------------------------
const PRIVACY = {
  fr: { title: 'Politique de confidentialité', body: `## Responsable du traitement
{{company}}, {{address}}. Contact pour toute question sur vos données : {{email}}.

## Données que nous traitons
- Compte : nom, adresse e-mail, mot de passe (enregistré sous une forme chiffrée irréversible), langue, préférences d'affichage, appareils connectés (télévision reliée par code).
- Abonnement et achats : formule, dates, statut, identifiant client Stripe, achats et locations à l'unité, cartes cadeaux, codes promotionnels utilisés. Les données de carte bancaire sont traitées uniquement par Stripe.
- Preuves d'acceptation : acceptation des conditions et renonciation au délai de rétractation, avec date, adresse IP et navigateur.
- Utilisation : position de lecture, historique, favoris, listes, notes, téléchargements hors connexion, réponses aux quiz, révision, bilans, suivi de lecture du Coran, adhkar et circuit de Ramadan.
- Engagements de mise en pratique : enregistrés chiffrés.
- Horaires de prière : la ville choisie ou une position arrondie à environ 10 km (jamais la position exacte), pour calculer les horaires.
- Espace enfants : pour chaque profil créé par le parent, un prénom ou pseudonyme, un avatar, une tranche d'âge, les vidéos vues, le temps d'utilisation et les étoiles obtenues. Aucun compte n'est demandé à l'enfant ; aucune donnée de contact n'est collectée sur lui.
- Questions à l'assistant : le texte de vos questions et les réponses, conservés {{askDays}} jours.
- Notifications : identifiant technique de l'appareil ou du navigateur, si vous les acceptez.
- Contributions : propositions de correction, signalements, messages envoyés.
- Données techniques : journaux de connexion et de sécurité, rapports d'erreur de l'application (sans contenu personnel), conservés 30 jours (90 jours au plus pour une erreur en cours d'analyse).
- Statistiques d'audience : uniquement des compteurs anonymes (pages vues, appareils, provenance), sans cookie ni adresse IP conservée ; les navigateurs qui envoient « Do Not Track » ne sont pas comptés.

## Pourquoi et sur quelle base
- Fournir le service, gérer le compte, les abonnements, les achats et l'espace enfants : exécution du contrat.
- Facturation, preuves d'acceptation, comptabilité : obligations légales.
- Sécurité, prévention de la fraude et des abus, amélioration technique : intérêt légitime.
- E-mails d'information sur votre compte et votre apprentissage (bienvenue, rappels, résumés) : intérêt légitime ou consentement selon le cas ; chaque e-mail contient un lien de désinscription.
- Notifications sur le téléphone ou le navigateur : consentement (désactivables à tout moment).

## Qui reçoit vos données
Vos données ne sont jamais vendues. Elles sont accessibles à l'équipe de {{app}} dans la limite de ses missions, et à des prestataires qui agissent pour notre compte :
- Hébergement des serveurs, des vidéos et de la base de données : {{host}}.
- Paiement : Stripe (États-Unis et Union européenne), pour les abonnements, achats et cartes cadeaux.
- Envoi des e-mails : {{mailProvider}}.
- Notifications : Google Firebase Cloud Messaging (téléphones Android) et le service de notifications de votre navigateur.
- Intelligence artificielle : selon les réglages du service, Anthropic (États-Unis), DeepSeek (Chine) et Microsoft Azure (traduction) reçoivent des textes à traiter (transcriptions, sous-titres, questions à l'assistant), sans votre nom ni votre adresse e-mail. N'écrivez pas d'informations personnelles dans vos questions à l'assistant.
- Plateformes vidéo : quand vous regardez une vidéo ou une chaîne en direct hébergée par YouTube, Vimeo, Dailymotion ou archive.org, leur lecteur se charge depuis leurs serveurs et suit leurs propres règles (YouTube est intégré en mode « sans cookie » lorsque c'est possible).
La transcription des vidéos, la recherche, le stockage des fichiers et le doublage sont réalisés sur nos propres serveurs.

## Transferts hors de l'Union européenne
Certains prestataires sont situés hors de l'Union européenne (États-Unis, Chine). Ces transferts sont encadrés par les garanties prévues par le RGPD (décision d'adéquation ou clauses contractuelles types de la Commission européenne) ; pour l'intelligence artificielle, seuls des textes sans donnée d'identification sont transmis.

## Durées de conservation
- Compte et données d'utilisation : tant que le compte existe. Vous pouvez le supprimer à tout moment ; les données liées sont alors effacées.
- Pièces de facturation : 10 ans (obligation comptable), chez Stripe et dans nos registres de ventes.
- Preuves d'acceptation des conditions : conservées comme preuve, sans lien avec votre identité après la suppression du compte.
- Questions à l'assistant : {{askDays}} jours.
- Journaux techniques et rapports d'erreur : 30 jours (90 jours au plus).
- Statistiques d'activité agrégées : 26 mois.

## Cookies et stockage sur l'appareil
Le site n'utilise ni cookie publicitaire ni traceur de mesure d'audience. Il enregistre seulement ce qui est nécessaire à son fonctionnement : votre session de connexion, la langue et le thème choisis, quelques préférences d'affichage. Ces éléments ne demandent pas de consentement. Les lecteurs de YouTube, Vimeo, Dailymotion et archive.org peuvent déposer leurs propres cookies lorsque vous lancez une de leurs vidéos.

## Vos droits
Vous pouvez accéder à vos données, les rectifier, les effacer, en limiter le traitement, vous opposer à certains traitements, les récupérer dans un format lisible et définir des directives sur leur sort après votre décès.
- Mon compte → Mes données : export de vos données et suppression du compte.
- Pour toute autre demande : {{email}}. Nous répondons dans un délai d'un mois.
- Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).

## Enfants
L'espace enfants est géré par le parent titulaire du compte, qui peut à tout moment modifier ou supprimer un profil d'enfant et les données associées.

## Sécurité
Connexions chiffrées (HTTPS), mots de passe chiffrés de manière irréversible, double authentification possible, liens de lecture temporaires pour les vidéos, accès de l'équipe limité et journalisé.

## Modifications
Cette politique peut évoluer avec le service ; la date de mise à jour figure en bas de page. Les changements importants vous sont signalés.` },
  en: { title: 'Privacy policy', body: `## Data controller
{{company}}, {{address}}. Contact for any question about your data: {{email}}.

## Data we process
- Account: name, email address, password (stored in an irreversible encrypted form), language, display preferences, connected devices (TV linked by code).
- Subscription and purchases: plan, dates, status, Stripe customer ID, pay-per-item purchases and rentals, gift cards, promo codes used. Card details are processed by Stripe only.
- Proof of consent: acceptance of the terms and waiver of the withdrawal period, with date, IP address and browser.
- Use: playback position, history, favourites, lists, notes, offline downloads, quiz answers, revision, reviews, Quran reading tracking, adhkar and Ramadan programme.
- Commitments to put into practice: stored encrypted.
- Prayer times: the chosen city or a location rounded to about 10 km (never your exact position), to compute the times.
- Kids area: for each profile created by the parent, a first name or nickname, an avatar, an age range, videos watched, time of use and stars earned. No account is asked of the child; no contact data is collected about them.
- Questions to the assistant: the text of your questions and the answers, kept for {{askDays}} days.
- Notifications: technical identifier of the device or browser, if you accept them.
- Contributions: correction suggestions, reports, messages sent.
- Technical data: connection and security logs, app error reports (without personal content), kept 30 days (90 days at most for an error under investigation).
- Audience statistics: anonymous counters only (page views, devices, referrers), with no cookie and no IP address kept; browsers sending “Do Not Track” are not counted.

## Why and on what basis
- Providing the service, managing the account, subscriptions, purchases and kids area: performance of the contract.
- Invoicing, proof of consent, accounting: legal obligations.
- Security, fraud and abuse prevention, technical improvement: legitimate interest.
- Information emails about your account and learning (welcome, reminders, summaries): legitimate interest or consent depending on the case; every email has an unsubscribe link.
- Phone or browser notifications: consent (can be turned off at any time).

## Who receives your data
Your data is never sold. It is accessible to the {{app}} team within the limits of their tasks, and to providers acting on our behalf:
- Hosting of servers, videos and database: {{host}}.
- Payment: Stripe (United States and European Union), for subscriptions, purchases and gift cards.
- Email delivery: {{mailProvider}}.
- Notifications: Google Firebase Cloud Messaging (Android phones) and your browser's notification service.
- Artificial intelligence: depending on the service settings, Anthropic (United States), DeepSeek (China) and Microsoft Azure (translation) receive texts to process (transcripts, subtitles, questions to the assistant), without your name or email address. Do not write personal information in your questions to the assistant.
- Video platforms: when you watch a video or live channel hosted by YouTube, Vimeo, Dailymotion or archive.org, their player loads from their servers and follows their own rules (YouTube is embedded in “no-cookie” mode where possible).
Video transcription, search, file storage and dubbing run on our own servers.

## Transfers outside the European Union
Some providers are located outside the European Union (United States, China). These transfers are covered by the safeguards provided by the GDPR (adequacy decision or the European Commission's standard contractual clauses); for artificial intelligence, only texts without identifying data are sent.

## Retention periods
- Account and usage data: as long as the account exists. You can delete it at any time; the related data is then erased.
- Billing records: 10 years (accounting obligation), at Stripe and in our sales records.
- Proof of acceptance of the terms: kept as evidence, no longer linked to your identity once the account is deleted.
- Questions to the assistant: {{askDays}} days.
- Technical logs and error reports: 30 days (90 days at most).
- Aggregated activity statistics: 26 months.

## Cookies and on-device storage
The website uses no advertising cookies and no audience-tracking tracker. It only stores what it needs to work: your login session, the chosen language and theme, and a few display preferences. These do not require consent. The YouTube, Vimeo, Dailymotion and archive.org players may set their own cookies when you start one of their videos.

## Your rights
You can access, rectify and erase your data, restrict its processing, object to certain processing, receive it in a readable format and set instructions for what happens to it after your death.
- My account → My data: export your data and delete your account.
- For any other request: {{email}}. We answer within one month.
- You can lodge a complaint with the CNIL (www.cnil.fr), the French data protection authority.

## Children
The kids area is managed by the parent who holds the account, who can change or delete a child's profile and the related data at any time.

## Security
Encrypted connections (HTTPS), irreversibly encrypted passwords, optional two-factor authentication, temporary playback links for videos, limited and logged team access.

## Changes
This policy may change with the service; the update date is shown at the bottom of the page. Significant changes are notified to you.

This translation is provided for convenience; the French version prevails.` },
  ar: { title: 'سياسة الخصوصية', body: `## المسؤول عن المعالجة
{{company}}، {{address}}. للتواصل بشأن بياناتك: {{email}}.

## البيانات التي نعالجها
- الحساب: الاسم والبريد الإلكتروني وكلمة المرور (محفوظة بتشفير لا رجعة فيه) واللغة وتفضيلات العرض والأجهزة المرتبطة (تلفاز مربوط برمز).
- الاشتراك والمشتريات: الباقة والتواريخ والحالة ومعرّف العميل لدى Stripe والمشتريات والاستئجارات بالوحدة وبطاقات الهدايا ورموز التخفيض المستخدمة. بيانات البطاقة البنكية يعالجها Stripe وحده.
- إثبات الموافقة: قبول الشروط والتنازل عن مهلة التراجع، مع التاريخ وعنوان IP والمتصفح.
- الاستخدام: موضع المشاهدة والسجل والمفضلة والقوائم والملاحظات والتنزيلات دون اتصال وأجوبة الاختبارات والمراجعة والحصائل ومتابعة قراءة القرآن والأذكار وبرنامج رمضان.
- التزامات التطبيق العملي: تُحفظ مشفّرة.
- مواقيت الصلاة: المدينة المختارة أو موقع مقرَّب إلى نحو 10 كم (وليس موقعك الدقيق أبدًا) لحساب المواقيت.
- فضاء الأطفال: لكل ملف ينشئه الوالد اسم أو لقب وصورة رمزية وفئة عمرية والفيديوهات المشاهَدة ومدة الاستخدام والنجوم المكتسبة. لا يُطلب من الطفل حساب، ولا تُجمع عنه أي بيانات تواصل.
- الأسئلة للمساعد: نص أسئلتك والأجوبة، تُحفظ {{askDays}} يومًا.
- الإشعارات: معرّف تقني للجهاز أو المتصفح إن قبلتها.
- المساهمات: اقتراحات التصحيح والبلاغات والرسائل المرسلة.
- البيانات التقنية: سجلات الاتصال والأمان وتقارير أخطاء التطبيق (دون محتوى شخصي)، تُحفظ 30 يومًا (90 يومًا كحد أقصى لخطأ قيد التحليل).
- إحصاءات الجمهور: عدّادات مجهولة فقط (الصفحات المشاهدة والأجهزة والمصادر)، دون ملف تعريف ارتباط ودون حفظ عنوان IP، ولا يُحتسب من يرسل متصفحه «Do Not Track».

## لماذا وعلى أي أساس
- تقديم الخدمة وإدارة الحساب والاشتراكات والمشتريات وفضاء الأطفال: تنفيذ العقد.
- الفوترة وإثبات الموافقة والمحاسبة: التزامات قانونية.
- الأمان ومنع الاحتيال والإساءة والتحسين التقني: المصلحة المشروعة.
- رسائل إعلامية عن حسابك وتعلّمك (ترحيب، تذكير، ملخصات): مصلحة مشروعة أو موافقة حسب الحالة، وفي كل رسالة رابط لإلغاء الاشتراك.
- إشعارات الهاتف أو المتصفح: الموافقة (يمكن إيقافها في أي وقت).

## من يستلم بياناتك
لا تُباع بياناتك أبدًا. يطّلع عليها فريق {{app}} في حدود مهامه، ومزوّدون يعملون لحسابنا:
- استضافة الخوادم والفيديوهات وقاعدة البيانات: {{host}}.
- الدفع: Stripe (الولايات المتحدة والاتحاد الأوروبي) للاشتراكات والمشتريات وبطاقات الهدايا.
- إرسال البريد الإلكتروني: {{mailProvider}}.
- الإشعارات: Google Firebase Cloud Messaging (هواتف أندرويد) وخدمة إشعارات متصفحك.
- الذكاء الاصطناعي: حسب إعدادات الخدمة، تستلم Anthropic (الولايات المتحدة) وDeepSeek (الصين) وMicrosoft Azure (الترجمة) نصوصًا لمعالجتها (تفريغات وترجمات وأسئلة للمساعد) دون اسمك أو بريدك. لا تكتب معلومات شخصية في أسئلتك للمساعد.
- منصات الفيديو: عند مشاهدة فيديو أو قناة مباشرة مستضافة على YouTube أو Vimeo أو Dailymotion أو archive.org، يُحمَّل مشغّلها من خوادمها ويتبع قواعدها الخاصة (يُدمج YouTube بوضع «دون ملفات تعريف الارتباط» متى أمكن).
تتم تفريغات الفيديوهات والبحث وتخزين الملفات والدبلجة على خوادمنا الخاصة.

## النقل خارج الاتحاد الأوروبي
بعض المزوّدين خارج الاتحاد الأوروبي (الولايات المتحدة، الصين). يخضع هذا النقل للضمانات التي ينص عليها النظام الأوروبي لحماية البيانات (قرار ملاءمة أو البنود التعاقدية النموذجية للمفوضية الأوروبية)، ولا تُرسل إلى الذكاء الاصطناعي إلا نصوص خالية من بيانات التعريف.

## مدد الحفظ
- الحساب وبيانات الاستخدام: ما دام الحساب قائمًا. يمكنك حذفه في أي وقت فتُمحى البيانات المرتبطة به.
- مستندات الفوترة: 10 سنوات (التزام محاسبي) لدى Stripe وفي سجلات مبيعاتنا.
- إثباتات قبول الشروط: تُحفظ كدليل دون ربط بهويتك بعد حذف الحساب.
- الأسئلة للمساعد: {{askDays}} يومًا.
- السجلات التقنية وتقارير الأخطاء: 30 يومًا (90 يومًا كحد أقصى).
- إحصاءات النشاط المجمّعة: 26 شهرًا.

## ملفات تعريف الارتباط والتخزين على الجهاز
لا يستخدم الموقع ملفات تعريف ارتباط إعلانية ولا أدوات تتبّع لقياس الجمهور. يحفظ فقط ما يلزم لعمله: جلسة الدخول واللغة والمظهر المختاران وبعض تفضيلات العرض، ولا تتطلب موافقة. قد تضع مشغّلات YouTube وVimeo وDailymotion وarchive.org ملفاتها الخاصة عند تشغيل أحد فيديوهاتها.

## حقوقك
يمكنك الاطلاع على بياناتك وتصحيحها ومحوها وتقييد معالجتها والاعتراض على بعض المعالجات واستلامها بصيغة مقروءة وتحديد توجيهات بشأن مصيرها بعد وفاتك.
- حسابي ← بياناتي: تصدير بياناتك وحذف الحساب.
- لأي طلب آخر: {{email}}. نجيب خلال شهر.
- يمكنك تقديم شكوى إلى الهيئة الفرنسية لحماية البيانات CNIL (www.cnil.fr).

## الأطفال
يدير فضاءَ الأطفال الوالدُ صاحب الحساب، ويمكنه في أي وقت تعديل ملف طفل أو حذفه مع بياناته.

## الأمان
اتصالات مشفّرة (HTTPS) وكلمات مرور مشفّرة بلا رجعة وإمكانية التحقق بخطوتين وروابط تشغيل مؤقتة للفيديوهات ووصول محدود ومسجَّل للفريق.

## التعديلات
قد تتطور هذه السياسة مع الخدمة، ويظهر تاريخ التحديث أسفل الصفحة. ونُعلمك بالتغييرات المهمة.

هذه الترجمة للتيسير، والنسخة الفرنسية هي المعتمدة.` },
};

export const LEGAL_TEMPLATES = { 'mentions-legales': MENTIONS, cgv: CGV, confidentialite: PRIVACY };
