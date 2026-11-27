// Pictogrammes du thème Premium (V20) : mêmes tracés que la maquette (app.js du thème, constante GLYPHS).
const GLYPHS = {
  search: <><circle cx="10.6" cy="10.6" r="6.7" /><path d="m15.6 15.6 5 5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  home: <path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.5-5 4-7 8-7s7.5 2 8 7" /></>,
  book: <path d="M12 5.5c-3.4-2.1-6.6-2.1-9-1.1v14c3.1-1 6.2-.5 9 1.2m0-14.1c3.4-2.1 6.6-2.1 9-1.1v14c-3.1-1-6.2-.5-9 1.2m0-14.1v14.1" />,
  mosque: <path d="M3 21V10m18 11V10M7 21V10c0-3 2.4-4 5-6 2.6 2 5 3 5 6v11M2 10h20M9 21v-7h6v7M4 8V3m16 5V3M7 21h10" />,
  history: <path d="M4 21V8l4-2 4 2 4-2 4 2v13M2 21h20M8 6V3h8v3M8 13h2m4 0h2m-8 4h2m4 0h2" />,
  science: <path d="M9 2h6m-5 0v7l-6 9a3 3 0 0 0 3 4h10a3 3 0 0 0 3-4l-6-9V2M7 15h10" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  game: <><rect x="3" y="8" width="18" height="10" rx="5" /><path d="M7 13h5m-2.5-2.5v5m6-3h.01m3 2h.01" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 4-4 2 2-4 4-2Z" /></>,
  cap: <path d="m2 9 10-5 10 5-10 5L2 9Zm4 3v5c4 3 8 3 12 0v-5m4-3v8" />,
  clapper: <path d="M3 8h18v13H3V8Zm0-4 17-2 1 4-18 2V4Zm5 4 3-5m3 5 3-5M7 12h10M7 16h10" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  castle: <path d="M3 21V6h3v2h2V6h3v2h2V6h3v2h2V6h3v15M2 21h20M10 21v-5a2 2 0 0 1 4 0v5M7 12h.01M17 12h.01" />,
  feather: <path d="M20 4c-6 0-11 3-12 9l-3 7m3-7h7m-5-3h6m-3-3c4 0 6-1 8-3-1 5-3 9-9 10" />,
  atom: <><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" /></>,
  people: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c.5-4.2 3.2-6 6.5-6s6 1.8 6.5 6M16 4.8a3.2 3.2 0 0 1 0 6.2M18 14.4c2 .6 3.3 2.3 3.5 5.6" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-3 0h6" /></>,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
  play: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="m10 9 5 3-5 3V9Z" /></>,
  playtri: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  sliders: <path d="M4 7h10m4 0h2M4 17h4m4 0h8M14 5v4m-6 6v4" />,
  gridview: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.3" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.3" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.3" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.3" /></>,
  listview: <path d="M4 6h16M4 12h16M4 18h16" />,
  star: <path d="m12 2 3.2 6.7 7.3 1-5.3 5.2 1.4 7.3-6.6-3.5-6.6 3.5 1.4-7.3L1.5 9.7l7.3-1L12 2Z" />,
};

export default function Glyph({ name }) {
  return (
    <svg className="v20-ui-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name] || GLYPHS.grid}
    </svg>
  );
}

/** Pictogramme d'un univers (catégorie) d'après son nom : Coran → livre, Histoire → ville, Sciences → fiole… */
export function glyphOfCategory(name = '') {
  const n = name.toLowerCase();
  if (/coran|quran|qur|قرآن|tafsir|تفسير/.test(n)) return 'book';
  if (/proph|sira|sîra|سيرة|أنبياء|نبي/.test(n)) return 'mosque';
  if (/hist|تاريخ|civil/.test(n)) return 'history';
  if (/scien|علوم|savant/.test(n)) return 'science';
  if (/spirit|rappel|روح|تزكية|foi|aqida|عقيدة/.test(n)) return 'star';
  if (/enfant|kids|أطفال/.test(n)) return 'game';
  return 'compass';
}

/** Pictogramme des puces de thèmes du Catalogue (maquette : lune, château, livre, plume, atome, personnes). */
export function chipGlyph(name = '') {
  const n = name.toLowerCase();
  if (/coran|quran|qur|قرآن|tafsir|تفسير/.test(n)) return 'book';
  if (/proph|sira|sîra|سيرة|أنبياء|نبي/.test(n)) return 'feather';
  if (/hist|تاريخ|civil/.test(n)) return 'castle';
  if (/scien|علوم|savant/.test(n)) return 'atom';
  if (/soci|مجتمع|famille|people/.test(n)) return 'people';
  if (/spirit|foi|faith|rappel|روح|تزكية|aqida|عقيدة|iman|إيمان/.test(n)) return 'moon';
  if (/enfant|kids|أطفال/.test(n)) return 'game';
  return 'compass';
}

/** Pictogramme d'un format (onglets du Catalogue) d'après son identifiant. */
export function formatGlyph(slug = '') {
  const n = slug.toLowerCase();
  if (/serie|series|سلسل/.test(n)) return 'layers';
  if (/short|reel|قصير/.test(n)) return 'playtri';
  if (/conf|lecture|talk|محاضر/.test(n)) return 'mic';
  return 'play';
}
