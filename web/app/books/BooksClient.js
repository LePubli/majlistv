'use client';
import { useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';
import BookCard from '../../components/BookCard';

export default function BooksList() {
  const { t, call, locale } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { call('/books', {}, null).then((r) => setList(r.ok ? r.data : [])); }, [call]);
  return (
    <main className="page">
      <section className="series-listhead"><h1>{t('bkTitle')}</h1><p className="meta">{t('bkIntro')}</p></section>
      {list && list.length === 0 && <p className="soon">{t('bkNone')}</p>}
      <div className="bk-grid">{(list || []).map((b) => <BookCard key={b.id} book={b} t={t} locale={locale} />)}</div>
    </main>
  );
}
