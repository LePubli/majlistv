// Détection des saisons et des numéros d'épisode dans les titres d'une série importée (YouTube ne donne PAS les saisons dans ses données).
//   « Saison 2 – Épisode 5 », « Season 2 Episode 5 », « S02E05 », « S2 », « الموسم الثاني » / « الموسم 2 » / « الحلقة 5 »…
// planSeasons(entries) propose un découpage : si la plupart des titres portent un numéro de saison, on le suit (un titre sans numéro reste
// dans la saison du titre précédent) ; sinon aucune saison n'est proposée — l'organisateur indique « la saison N commence à l'épisode X ».
const AR_DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
const AR_ORD = { 'الأول': 1, 'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10 };
const num = (s) => {
  const t = String(s).replace(/[٠-٩]/g, (d) => AR_DIGITS[d]);
  if (/^\d+$/.test(t)) return Number(t);
  return AR_ORD[s] ?? null;
};
const N = '([0-9٠-٩]{1,3}|الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)';

export function parseTitle(title) {
  const t = String(title || '');
  let season = null; let episode = null; let m;
  if ((m = t.match(/\bS(\d{1,2})\s*[ÉE]\s*(\d{1,3})\b/i))) { season = Number(m[1]); episode = Number(m[2]); }
  if (season == null && (m = t.match(/(?:^|[^\p{L}])(?:saison|season|sais\.?)\s*[:n°#.-]*\s*(\d{1,2})(?!\d)/iu))) season = Number(m[1]);
  if (season == null && (m = t.match(/(?:^|[^\p{L}\d])S(\d{1,2})(?![\p{L}\d])/u))) season = Number(m[1]);
  if (season == null && (m = t.match(new RegExp(`(?:ال)?موسم\\s*${N}`)))) season = num(m[1]);
  if (episode == null && (m = t.match(/(?:^|[^\p{L}])(?:épisode|episode|ép\.?|ep\.?|e)\s*[:n°#.-]*\s*(\d{1,3})(?!\d)/iu))) episode = Number(m[1]);
  if (episode == null && (m = t.match(new RegExp(`(?:ال)?حلقة\\s*${N}`)))) episode = num(m[1]);
  return { season: season > 0 ? season : null, episode: episode > 0 ? episode : null };
}

// entries : [{ id, title, … }] dans l'ordre voulu. Renvoie { hasSeasons, seasons: [{ title, from }], detected } ; `from` = rang (à partir de 1) du 1er épisode de la saison.
export function planSeasons(entries) {
  const parsed = entries.map((e) => parseTitle(e.title));
  const withSeason = parsed.filter((p) => p.season != null).length;
  if (!entries.length || withSeason < Math.max(2, Math.ceil(entries.length * 0.6))) return { hasSeasons: false, seasons: [], detected: withSeason };
  let current = null;
  const starts = [];
  parsed.forEach((p, i) => {
    const s = p.season ?? current ?? 1;
    if (s !== current) { starts.push({ n: s, from: i + 1 }); current = s; }
  });
  // Une saison qui revient plus tard (titres mélangés) ou dans le désordre : pas de découpage automatique fiable.
  const nums = starts.map((x) => x.n);
  if (new Set(nums).size !== nums.length) return { hasSeasons: false, seasons: [], detected: withSeason };
  return { hasSeasons: true, seasons: starts.map((x) => ({ title: '', from: x.from, number: x.n })), detected: withSeason };
}

// Répartit les épisodes (dans l'ordre) selon les départs de saison : renvoie, pour chaque rang (0 = 1er épisode), l'index de la saison.
export function assignSeasons(count, seasons) {
  const starts = [...seasons].map((s) => s.from).sort((a, b) => a - b);
  return Array.from({ length: count }, (_, i) => {
    let idx = 0;
    starts.forEach((f, k) => { if (i + 1 >= f) idx = k; });
    return idx;
  });
}
