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
    test: { subject: 'Test d\'envoi {app}', lines: ['Cet e-mail confirme que les réglages d\'envoi fonctionnent.'], button: 'Ouvrir le site' },
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
    test: { subject: '{app} test email', lines: ['This email confirms that the sending settings work.'], button: 'Open the site' },
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
    test: { subject: 'رسالة اختبار من {app}', lines: ['تؤكد هذه الرسالة أن إعدادات الإرسال تعمل.'], button: 'فتح الموقع' },
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
  const subject = fill(m.subject, v, false);
  const dir = l === 'ar' ? 'rtl' : 'ltr';
  const align = l === 'ar' ? 'right' : 'left';
  const logo = v.webUrl ? `<img src="${esc(v.webUrl)}/brand/email-logo.png" alt="${esc(v.app)}" height="40" style="display:block;height:40px;border:0">` : `<span style="font:700 20px Arial,sans-serif;color:#F7C863">${esc(v.app)}</span>`;
  const paras = m.lines.map((line) => `<p style="margin:0 0 14px;font:16px/1.55 Arial,sans-serif;color:#2B241A">${fill(line, v, true)}</p>`).join('');
  const button = v.url ? `<p style="margin:22px 0 6px"><a href="${esc(v.url)}" style="display:inline-block;background:#E6A739;color:#120D06;font:700 16px Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:999px">${esc(m.button)}</a></p>` : '';
  const html = `<!doctype html><html lang="${l}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#F4EFE6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B0906;padding:18px 24px;text-align:${align}">${logo}</td></tr>
<tr><td dir="${dir}" style="padding:28px 24px 20px;text-align:${align}">
<p style="margin:0 0 16px;font:700 17px Arial,sans-serif;color:#120D06">${fill(t.hello, v, true)}</p>
${paras}${button}
<p style="margin:22px 0 0;font:15px Arial,sans-serif;color:#5C5244">${fill(t.team, v, true)}</p>
</td></tr>
<tr><td dir="${dir}" style="padding:14px 24px 22px;border-top:1px solid #EFE7DA;font:12px/1.5 Arial,sans-serif;color:#7A6F5F;text-align:${align}">${fill(t.footer, v, true)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [fill(t.hello, v, false), '', ...m.lines.map((x) => fill(x, v, false)), '', v.url ? `${m.button} : ${v.url}` : '', '', fill(t.team, v, false), '', fill(t.footer, v, false)]
    .filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  return { subject, html, text };
}
