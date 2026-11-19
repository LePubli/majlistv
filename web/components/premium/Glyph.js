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
