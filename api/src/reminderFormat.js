// Format d'un rappel (table reminders) renvoyé par l'API, partagé par la révision espacée et les citations.
// Étape M3a : sorti du module revision pour que le module citations n'en dépende plus.
export const shape = (r) => ({
  id: r.id, talkId: r.talk_id, talkTitle: r.talk_title ?? null, textAr: r.text_ar || '', lang: r.lang, text: r.text, startMs: r.start_ms, origin: r.origin, attribution: r.attribution,
  status: r.status, createdAt: r.created_at, approvedAt: r.approved_at,
});
