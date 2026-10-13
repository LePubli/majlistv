'use client';
// Bloc « L'ouvrage étudié » (page conférence ou série) : ouvrages liés, si la conférence / série en a.
import { useEffect, useState } from 'react';
import BookCard from './BookCard';
import { useApp } from './Providers';

export default function BooksBlock({ kind, id }) {
  const { t, call, locale } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { call(`/${kind}/${id}/books`, {}, null).then((r) => setList(r.ok ? r.data : [])); }, [call, kind, id]);
  if (!list.length) return null;
  return (
    <section className="bk-block" aria-labelledby="bk-block-title">
      <h2 id="bk-block-title">{list.length === 1 ? t('bkStudied') : t('bkStudiedMany')}</h2>
      <div className="bk-row">{list.map((b) => <BookCard key={b.id} book={b} t={t} locale={locale} />)}</div>
    </section>
  );
}
