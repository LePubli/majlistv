// Villes proposées pour les horaires de prière (nom, latitude, longitude, fuseau). Liste volontairement courte et locale :
// aucun service de géocodage n'est appelé. Pour une autre ville, « Me localiser » utilise la position de l'appareil.
export const CITIES = [
  // France
  { id: 'paris', name: 'Paris', lat: 48.86, lon: 2.35, tz: 'Europe/Paris' }, { id: 'lille', name: 'Lille', lat: 50.63, lon: 3.06, tz: 'Europe/Paris' },
  { id: 'roubaix', name: 'Roubaix', lat: 50.69, lon: 3.17, tz: 'Europe/Paris' }, { id: 'marseille', name: 'Marseille', lat: 43.30, lon: 5.37, tz: 'Europe/Paris' },
  { id: 'lyon', name: 'Lyon', lat: 45.76, lon: 4.84, tz: 'Europe/Paris' }, { id: 'toulouse', name: 'Toulouse', lat: 43.60, lon: 1.44, tz: 'Europe/Paris' },
  { id: 'nice', name: 'Nice', lat: 43.70, lon: 7.27, tz: 'Europe/Paris' }, { id: 'nantes', name: 'Nantes', lat: 47.22, lon: -1.55, tz: 'Europe/Paris' },
  { id: 'strasbourg', name: 'Strasbourg', lat: 48.57, lon: 7.75, tz: 'Europe/Paris' }, { id: 'bordeaux', name: 'Bordeaux', lat: 44.84, lon: -0.58, tz: 'Europe/Paris' },
  { id: 'montpellier', name: 'Montpellier', lat: 43.61, lon: 3.88, tz: 'Europe/Paris' }, { id: 'rennes', name: 'Rennes', lat: 48.11, lon: -1.68, tz: 'Europe/Paris' },
  { id: 'grenoble', name: 'Grenoble', lat: 45.19, lon: 5.72, tz: 'Europe/Paris' }, { id: 'rouen', name: 'Rouen', lat: 49.44, lon: 1.10, tz: 'Europe/Paris' },
  { id: 'dijon', name: 'Dijon', lat: 47.32, lon: 5.04, tz: 'Europe/Paris' }, { id: 'saint-etienne', name: 'Saint-Étienne', lat: 45.44, lon: 4.39, tz: 'Europe/Paris' },
  { id: 'saint-denis-re', name: 'Saint-Denis (La Réunion)', lat: -20.88, lon: 55.45, tz: 'Indian/Reunion' }, { id: 'pointe-a-pitre', name: 'Pointe-à-Pitre', lat: 16.24, lon: -61.53, tz: 'America/Guadeloupe' },
  { id: 'fort-de-france', name: 'Fort-de-France', lat: 14.60, lon: -61.07, tz: 'America/Martinique' }, { id: 'mamoudzou', name: 'Mamoudzou', lat: -12.78, lon: 45.23, tz: 'Indian/Mayotte' },
  // Belgique, Suisse, Luxembourg
  { id: 'bruxelles', name: 'Bruxelles', lat: 50.85, lon: 4.35, tz: 'Europe/Brussels' }, { id: 'liege', name: 'Liège', lat: 50.63, lon: 5.57, tz: 'Europe/Brussels' },
  { id: 'anvers', name: 'Anvers', lat: 51.22, lon: 4.40, tz: 'Europe/Brussels' }, { id: 'geneve', name: 'Genève', lat: 46.20, lon: 6.14, tz: 'Europe/Zurich' },
  { id: 'zurich', name: 'Zurich', lat: 47.38, lon: 8.54, tz: 'Europe/Zurich' }, { id: 'luxembourg', name: 'Luxembourg', lat: 49.61, lon: 6.13, tz: 'Europe/Luxembourg' },
  // Europe
  { id: 'londres', name: 'Londres', lat: 51.51, lon: -0.13, tz: 'Europe/London' }, { id: 'birmingham', name: 'Birmingham', lat: 52.49, lon: -1.89, tz: 'Europe/London' },
  { id: 'amsterdam', name: 'Amsterdam', lat: 52.37, lon: 4.90, tz: 'Europe/Amsterdam' }, { id: 'berlin', name: 'Berlin', lat: 52.52, lon: 13.41, tz: 'Europe/Berlin' },
  { id: 'madrid', name: 'Madrid', lat: 40.42, lon: -3.70, tz: 'Europe/Madrid' }, { id: 'barcelone', name: 'Barcelone', lat: 41.39, lon: 2.17, tz: 'Europe/Madrid' },
  { id: 'rome', name: 'Rome', lat: 41.90, lon: 12.50, tz: 'Europe/Rome' }, { id: 'milan', name: 'Milan', lat: 45.46, lon: 9.19, tz: 'Europe/Rome' },
  { id: 'istanbul', name: 'Istanbul', lat: 41.01, lon: 28.98, tz: 'Europe/Istanbul' }, { id: 'ankara', name: 'Ankara', lat: 39.93, lon: 32.86, tz: 'Europe/Istanbul' },
  { id: 'sarajevo', name: 'Sarajevo', lat: 43.86, lon: 18.41, tz: 'Europe/Sarajevo' }, { id: 'stockholm', name: 'Stockholm', lat: 59.33, lon: 18.07, tz: 'Europe/Stockholm' },
  // Maghreb
  { id: 'casablanca', name: 'Casablanca', lat: 33.57, lon: -7.59, tz: 'Africa/Casablanca' }, { id: 'rabat', name: 'Rabat', lat: 34.02, lon: -6.84, tz: 'Africa/Casablanca' },
  { id: 'marrakech', name: 'Marrakech', lat: 31.63, lon: -8.01, tz: 'Africa/Casablanca' }, { id: 'fes', name: 'Fès', lat: 34.03, lon: -5.00, tz: 'Africa/Casablanca' },
  { id: 'tanger', name: 'Tanger', lat: 35.77, lon: -5.80, tz: 'Africa/Casablanca' }, { id: 'oujda', name: 'Oujda', lat: 34.68, lon: -1.91, tz: 'Africa/Casablanca' },
  { id: 'alger', name: 'Alger', lat: 36.75, lon: 3.06, tz: 'Africa/Algiers' }, { id: 'oran', name: 'Oran', lat: 35.70, lon: -0.63, tz: 'Africa/Algiers' },
  { id: 'constantine', name: 'Constantine', lat: 36.37, lon: 6.61, tz: 'Africa/Algiers' }, { id: 'tunis', name: 'Tunis', lat: 36.81, lon: 10.18, tz: 'Africa/Tunis' },
  { id: 'sfax', name: 'Sfax', lat: 34.74, lon: 10.76, tz: 'Africa/Tunis' }, { id: 'tripoli', name: 'Tripoli', lat: 32.89, lon: 13.19, tz: 'Africa/Tripoli' },
  { id: 'nouakchott', name: 'Nouakchott', lat: 18.08, lon: -15.98, tz: 'Africa/Nouakchott' },
  // Afrique
  { id: 'le-caire', name: 'Le Caire', lat: 30.04, lon: 31.24, tz: 'Africa/Cairo' }, { id: 'alexandrie', name: 'Alexandrie', lat: 31.20, lon: 29.92, tz: 'Africa/Cairo' },
  { id: 'dakar', name: 'Dakar', lat: 14.72, lon: -17.47, tz: 'Africa/Dakar' }, { id: 'bamako', name: 'Bamako', lat: 12.64, lon: -8.00, tz: 'Africa/Bamako' },
  { id: 'abidjan', name: 'Abidjan', lat: 5.36, lon: -4.01, tz: 'Africa/Abidjan' }, { id: 'conakry', name: 'Conakry', lat: 9.64, lon: -13.58, tz: 'Africa/Conakry' },
  { id: 'niamey', name: 'Niamey', lat: 13.51, lon: 2.11, tz: 'Africa/Niamey' }, { id: 'ouagadougou', name: 'Ouagadougou', lat: 12.37, lon: -1.52, tz: 'Africa/Ouagadougou' },
  { id: 'ndjamena', name: 'N’Djamena', lat: 12.13, lon: 15.06, tz: 'Africa/Ndjamena' }, { id: 'lagos', name: 'Lagos', lat: 6.52, lon: 3.38, tz: 'Africa/Lagos' },
  { id: 'khartoum', name: 'Khartoum', lat: 15.50, lon: 32.56, tz: 'Africa/Khartoum' }, { id: 'djibouti', name: 'Djibouti', lat: 11.59, lon: 43.15, tz: 'Africa/Djibouti' },
  { id: 'moroni', name: 'Moroni', lat: -11.70, lon: 43.26, tz: 'Indian/Comoro' }, { id: 'nairobi', name: 'Nairobi', lat: -1.29, lon: 36.82, tz: 'Africa/Nairobi' },
  { id: 'johannesburg', name: 'Johannesburg', lat: -26.20, lon: 28.05, tz: 'Africa/Johannesburg' },
  // Moyen-Orient
  { id: 'la-mecque', name: 'La Mecque', lat: 21.42, lon: 39.83, tz: 'Asia/Riyadh' }, { id: 'medine', name: 'Médine', lat: 24.47, lon: 39.61, tz: 'Asia/Riyadh' },
  { id: 'riyad', name: 'Riyad', lat: 24.71, lon: 46.68, tz: 'Asia/Riyadh' }, { id: 'djeddah', name: 'Djeddah', lat: 21.54, lon: 39.17, tz: 'Asia/Riyadh' },
  { id: 'dubai', name: 'Dubaï', lat: 25.20, lon: 55.27, tz: 'Asia/Dubai' }, { id: 'abou-dhabi', name: 'Abou Dabi', lat: 24.45, lon: 54.38, tz: 'Asia/Dubai' },
  { id: 'doha', name: 'Doha', lat: 25.29, lon: 51.53, tz: 'Asia/Qatar' }, { id: 'koweit', name: 'Koweït', lat: 29.38, lon: 47.99, tz: 'Asia/Kuwait' },
  { id: 'manama', name: 'Manama', lat: 26.23, lon: 50.59, tz: 'Asia/Bahrain' }, { id: 'mascate', name: 'Mascate', lat: 23.59, lon: 58.41, tz: 'Asia/Muscat' },
  { id: 'amman', name: 'Amman', lat: 31.95, lon: 35.93, tz: 'Asia/Amman' }, { id: 'beyrouth', name: 'Beyrouth', lat: 33.89, lon: 35.50, tz: 'Asia/Beirut' },
  { id: 'damas', name: 'Damas', lat: 33.51, lon: 36.29, tz: 'Asia/Damascus' }, { id: 'bagdad', name: 'Bagdad', lat: 33.31, lon: 44.37, tz: 'Asia/Baghdad' },
  { id: 'jerusalem', name: 'Jérusalem', lat: 31.77, lon: 35.21, tz: 'Asia/Jerusalem' }, { id: 'teheran', name: 'Téhéran', lat: 35.69, lon: 51.39, tz: 'Asia/Tehran' },
  { id: 'sanaa', name: 'Sanaa', lat: 15.37, lon: 44.19, tz: 'Asia/Aden' },
  // Asie et Amérique
  { id: 'karachi', name: 'Karachi', lat: 24.86, lon: 67.01, tz: 'Asia/Karachi' }, { id: 'lahore', name: 'Lahore', lat: 31.55, lon: 74.34, tz: 'Asia/Karachi' },
  { id: 'dacca', name: 'Dacca', lat: 23.81, lon: 90.41, tz: 'Asia/Dhaka' }, { id: 'delhi', name: 'New Delhi', lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' },
  { id: 'jakarta', name: 'Jakarta', lat: -6.21, lon: 106.85, tz: 'Asia/Jakarta' }, { id: 'kuala-lumpur', name: 'Kuala Lumpur', lat: 3.14, lon: 101.69, tz: 'Asia/Kuala_Lumpur' },
  { id: 'singapour', name: 'Singapour', lat: 1.35, lon: 103.82, tz: 'Asia/Singapore' }, { id: 'tachkent', name: 'Tachkent', lat: 41.30, lon: 69.24, tz: 'Asia/Tashkent' },
  { id: 'new-york', name: 'New York', lat: 40.71, lon: -74.01, tz: 'America/New_York' }, { id: 'montreal', name: 'Montréal', lat: 45.50, lon: -73.57, tz: 'America/Toronto' },
  { id: 'toronto', name: 'Toronto', lat: 43.65, lon: -79.38, tz: 'America/Toronto' }, { id: 'chicago', name: 'Chicago', lat: 41.88, lon: -87.63, tz: 'America/Chicago' },
  { id: 'los-angeles', name: 'Los Angeles', lat: 34.05, lon: -118.24, tz: 'America/Los_Angeles' }, { id: 'sydney', name: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
];
export const DEFAULT_CITY = 'paris';
export const cityById = (id) => CITIES.find((c) => c.id === id) || null;

/** Texte sans accents ni majuscules, pour la recherche. */
export const plain = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const searchCities = (q, limit = 8) => {
  const n = plain(q);
  if (!n) return [];
  return CITIES.filter((c) => plain(c.name).includes(n)).sort((a, b) => Number(!plain(a.name).startsWith(n)) - Number(!plain(b.name).startsWith(n))).slice(0, limit);
};
/** Ville par défaut selon le fuseau de l'appareil : la première ville qui a le même fuseau, sinon celle de l'administrateur. */
export const cityForTimezone = (tz, fallbackId = DEFAULT_CITY) => CITIES.find((c) => c.tz === tz) || cityById(fallbackId) || cityById(DEFAULT_CITY);
