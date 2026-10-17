// Formats partagés du Studio (étape S3).
const UNITS = { fr: ['o', 'ko', 'Mo', 'Go', 'To'], en: ['B', 'KB', 'MB', 'GB', 'TB'], ar: ['B', 'KB', 'MB', 'GB', 'TB'] };
export const unitsFor = (locale) => UNITS[String(locale).slice(0, 2)] || UNITS.fr;

// « 18,6 Go », « 38 Mo »…
export function fmtBytes(n, locale) {
  if (n == null) return '—';
  const u = unitsFor(locale);
  for (let i = 4; i >= 1; i -= 1) {
    const size = 1024 ** i;
    if (n >= size) return `${(n / size).toLocaleString(locale, { maximumFractionDigits: n / size < 10 ? 1 : 0 })} ${u[i]}`;
  }
  return `${n} ${u[0]}`;
}

// « il y a 2 min » sans bibliothèque.
export function ago(iso, locale) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 60) return rtf.format(-Math.round(s), 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
