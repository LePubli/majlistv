// Étape 45 — Calendrier hégirien (Umm al-Qura, fourni par Node/ICU) et saisons religieuses.
// Le calendrier d'Umm al-Qura est un calcul : il peut différer d'un jour de l'observation de la lune dans le pays du membre.
// Un décalage de -2 à +2 jours (Admin → Paramètres → Saisons) permet de s'aligner sur la communauté.
const TZ = 'Europe/Paris';
const DAY = 86400000;
const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });

// Date hégirienne { year, month (1-12), day } du jour (Paris) de `date`, décalée de `offsetDays`.
export function hijriOf(date, offsetDays = 0) {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(date.getTime() + offsetDays * DAY)).map((p) => [p.type, p.value]));
  return { year: parseInt(parts.year, 10), month: parseInt(parts.month, 10), day: parseInt(parts.day, 10) };
}

// Saisons proposées. `from`/`to` : jours du mois hégirien ; `lead` : jours d'avance par défaut pour annoncer la période.
export const SEASONS = [
  { id: 'ramadan', month: 9, from: 1, to: 30, lead: 7,
    name: { fr: 'Ramadan', en: 'Ramadan', ar: 'رمضان' },
    title: { fr: 'Ramadan : des vidéos pour le mois béni', en: 'Ramadan: talks for the blessed month', ar: 'رمضان: محاضرات للشهر الكريم' },
    text: { fr: 'Une sélection de vidéos pour accompagner le mois de Ramadan.', en: 'A selection of talks to accompany the month of Ramadan.', ar: 'مختارات من المحاضرات لمرافقة شهر رمضان.' } },
  { id: 'hajj', month: 12, from: 1, to: 13, lead: 7,
    name: { fr: 'Hajj', en: 'Hajj', ar: 'الحج' },
    title: { fr: 'Hajj et Aïd al-Adha : se préparer et comprendre', en: 'Hajj and Eid al-Adha: prepare and understand', ar: 'الحج وعيد الأضحى: استعداد وفهم' },
    text: { fr: 'Des vidéos sur le sens du Hajj et des dix premiers jours de Dhou al-hijja.', en: 'Talks on the meaning of Hajj and the first ten days of Dhul Hijjah.', ar: 'محاضرات عن معنى الحج والأيام العشر الأولى من ذي الحجة.' } },
  { id: 'mawlid', month: 3, from: 1, to: 12, lead: 3,
    name: { fr: 'Mawlid', en: 'Mawlid', ar: 'المولد' },
    title: { fr: 'Mawlid : autour de la vie du Prophète ﷺ', en: 'Mawlid: on the life of the Prophet ﷺ', ar: 'المولد: حول سيرة النبي ﷺ' },
    text: { fr: 'Des vidéos sur la vie et le message du Prophète ﷺ.', en: 'Talks on the life and message of the Prophet ﷺ.', ar: 'محاضرات عن حياة النبي ﷺ ورسالته.' } },
  { id: 'ashura', month: 1, from: 1, to: 10, lead: 3,
    name: { fr: 'Achoura', en: 'Ashura', ar: 'عاشوراء' },
    title: { fr: 'Muharram et Achoura : le début de l’année', en: 'Muharram and Ashura: the start of the year', ar: 'محرم وعاشوراء: بداية العام' },
    text: { fr: 'Des vidéos pour le début de l’année hégirienne et le jour d’Achoura.', en: 'Talks for the start of the Hijri year and the day of Ashura.', ar: 'محاضرات لبداية العام الهجري ويوم عاشوراء.' } },
  // Étape 45H : Aïd al-Fitr et deux des mois sacrés (Muharram et Dhou al-Hijja sont déjà couverts par Achoura et Hajj).
  { id: 'eid_fitr', month: 10, from: 1, to: 3, lead: 2,
    name: { fr: 'Aïd al-Fitr', en: 'Eid al-Fitr', ar: 'عيد الفطر' },
    title: { fr: 'Aïd al-Fitr : la fête de fin de Ramadan', en: 'Eid al-Fitr: the feast ending Ramadan', ar: 'عيد الفطر: عيد ختام رمضان' },
    text: { fr: 'Des vidéos pour vivre et comprendre la fête de l’Aïd.', en: 'Talks to live and understand the Eid celebration.', ar: 'محاضرات لعيش العيد وفهمه.' } },
  { id: 'rajab', month: 7, from: 1, to: 30, lead: 3,
    name: { fr: 'Rajab', en: 'Rajab', ar: 'رجب' },
    title: { fr: 'Rajab : l’un des mois sacrés', en: 'Rajab: one of the sacred months', ar: 'رجب: من الأشهر الحرم' },
    text: { fr: 'Des vidéos pour le mois de Rajab, l’un des quatre mois sacrés.', en: 'Talks for the month of Rajab, one of the four sacred months.', ar: 'محاضرات لشهر رجب، أحد الأشهر الحرم الأربعة.' } },
  { id: 'dhulqada', month: 11, from: 1, to: 30, lead: 3,
    name: { fr: 'Dhou al-Qi‘da', en: 'Dhul Qa‘dah', ar: 'ذو القعدة' },
    title: { fr: 'Dhou al-Qi‘da : un mois sacré avant le Hajj', en: 'Dhul Qa‘dah: a sacred month before Hajj', ar: 'ذو القعدة: شهر حرام قبل الحج' },
    text: { fr: 'Des vidéos pour Dhou al-Qi‘da, l’un des quatre mois sacrés.', en: 'Talks for Dhul Qa‘dah, one of the four sacred months.', ar: 'محاضرات لذي القعدة، أحد الأشهر الحرم الأربعة.' } },
];
export const SEASON_IDS = SEASONS.map((s) => s.id);
export const seasonDef = (id) => SEASONS.find((s) => s.id === id) || null;

const isoDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;

// Toutes les occurrences d'une saison entre -60 et +430 jours : [{ start, end }] en dates « YYYY-MM-DD » (Paris), dans l'ordre.
export function occurrences(def, now, offsetDays = 0) {
  const out = [];
  let cur = null;
  for (let i = -60; i <= 430; i += 1) {
    const d = new Date(now.getTime() + i * DAY);
    const h = hijriOf(d, offsetDays);
    const inSeason = h.month === def.month && h.day >= def.from && h.day <= def.to;
    if (inSeason) {
      if (!cur) { cur = { start: isoDay(new Date(d.getTime() - (h.day - def.from) * DAY)), end: isoDay(d) }; out.push(cur); } else cur.end = isoDay(d);
    } else cur = null;
  }
  return out;
}

// État d'une saison à l'instant `now` : { active, startsOn, endsOn (YYYY-MM-DD), opensOn, daysToStart, daysLeft, hijriYear, hijriToday }.
// La période affichée va de `lead` jours avant le début jusqu'au dernier jour de la saison ; ensuite, la saison suivante est annoncée.
export function seasonState(def, now, { lead = def.lead, offsetDays = 0 } = {}) {
  const today = isoDay(now);
  const occ = occurrences(def, now, offsetDays).find((o) => o.end >= today);
  if (!occ) return { active: false, hijriToday: hijriOf(now, offsetDays) };
  const daysToStart = dayNum(occ.start) - dayNum(today);
  const daysLeft = dayNum(occ.end) - dayNum(today);
  const startDate = new Date(`${occ.start}T12:00:00Z`);
  return {
    active: daysToStart <= lead && daysLeft >= 0,
    startsOn: occ.start, endsOn: occ.end, opensOn: isoDay(new Date(startDate.getTime() - lead * DAY)),
    daysToStart, daysLeft, hijriYear: hijriOf(startDate, offsetDays).year, hijriToday: hijriOf(now, offsetDays),
  };
}
