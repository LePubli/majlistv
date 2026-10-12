'use client';
// Pages légales : texte saisi dans le back-office (« ## » = titre, « - » = élément de liste, ligne vide = paragraphe).
// Rendu sans HTML brut : rien de ce qui est saisi n'est interprété comme du code.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';

const linkify = (line) => line.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => (/^https?:\/\//.test(part)
  ? <a key={i} href={part} rel="noopener noreferrer" target="_blank">{part}</a> : part));

function blocks(body) {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { out.push({ type: 'ul', items: list }); list = null; } };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    if (line.startsWith('## ')) { flushPara(); flushList(); out.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('- ')) { flushPara(); (list = list || []).push(line.slice(2)); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out;
}

export default function LegalPage() {
  const { slug } = useParams();
  const { call, t, locale } = useApp();
  const [page, setPage] = useState(undefined);
  useEffect(() => { call('/legal/' + slug, {}, null).then((r) => setPage(r.ok ? r.data : null)); }, [slug, call]);
  if (page === undefined) return null;
  if (page === null) return <main className="page"><p>{t('errGeneric')}</p></main>;
  return (
    <main className="page legal">
      <h1>{page.title}</h1>
      {blocks(page.body).map((b, i) => (b.type === 'h2' ? <h2 key={i}>{b.text}</h2>
        : b.type === 'ul' ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{linkify(it)}</li>)}</ul>
        : <p key={i}>{linkify(b.text)}</p>))}
      <p className="meta small">{t('lastUpdate')} {new Date(page.updatedAt).toLocaleDateString(locale)}</p>
    </main>
  );
}
