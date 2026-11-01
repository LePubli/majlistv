// Jour et heure à Paris (le site raisonne en heure de Paris : vendredi, compteur d'athkar, rappels).
// Renvoie { weekday: 'Mon'…'Sun', isFriday, date: 'AAAA-MM-JJ', hour: 0-23 }.
export function parisDay(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, isFriday: p.weekday === 'Fri', date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// Jour précédent d'une date AAAA-MM-JJ.
export function prevDate(d) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
}
