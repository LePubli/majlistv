'use client';
// Vignette d'un ouvrage : couverture, titre, auteur, langues disponibles.
import Link from 'next/link';
import { langName } from './Transcript';

export default function BookCard({ book, t, locale }) {
  return (
    <Link href={`/books/${book.id}`} className="bk-card">
      <span className="bk-cover" style={book.coverUrl ? { backgroundImage: `url(${book.coverUrl})` } : undefined} aria-hidden="true">{!book.coverUrl && <span>📖</span>}</span>
      <b>{book.title}</b>
      {book.author && <span className="meta small">{t('bkBy').replace('{a}', book.author)}</span>}
      <span className="bk-langs">{(book.langs || []).map((l) => <i key={l}>{langName(l, locale)}</i>)}</span>
    </Link>
  );
}
