'use client';
// Étape 19 — « Ajouter à une liste » sur la page d'une conférence (membres connectés).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function ListButton({ talkId, t, call, user }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState(null);
  const [inIds, setInIds] = useState([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    (async () => {
      const [a, b] = await Promise.all([call('/me/lists'), call(`/me/lists/containing/${talkId}`)]);
      if (a.ok) setLists(a.data.lists);
      if (b.ok) setInIds(b.data);
    })();
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open, call, talkId]);
  if (!user) return null;
  const toggle = async (l) => {
    setErr(null);
    const has = inIds.includes(l.id);
    const r = await call(`/me/lists/${l.id}/items/${talkId}`, { method: has ? 'DELETE' : 'PUT' });
    if (r.ok) setInIds(has ? inIds.filter((x) => x !== l.id) : [...inIds, l.id]); else setErr(r.data?.error || t('errGeneric'));
  };
  const create = async (e) => {
    e.preventDefault(); setErr(null);
    const r = await call('/me/lists', { method: 'POST', body: JSON.stringify({ title: name }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setName(''); setLists((v) => [...(v || []), r.data]);
    await toggle(r.data);
  };
  return (
    <div className="ls-pop" ref={box}>
      <button type="button" className="fav" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden="true">＋</span> {t('lsAddBtn')}</button>
      {open && (
        <div className="ls-menu" role="dialog" aria-label={t('lsAddBtn')}>
          {lists === null && <p className="meta small">…</p>}
          {lists && lists.length === 0 && <p className="meta small">{t('lsNone')}</p>}
          <ul>
            {(lists || []).map((l) => (
              <li key={l.id}><label className="rv-email"><input type="checkbox" checked={inIds.includes(l.id)} onChange={() => toggle(l)} /> <span>{l.title}</span></label></li>
            ))}
          </ul>
          <form onSubmit={create} className="ls-quick">
            <input value={name} maxLength={100} placeholder={t('lsNewPh')} aria-label={t('lsNew')} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim()}>{t('lsCreate')}</button>
          </form>
          {err && <p className="error" role="alert">{err}</p>}
          <Link href="/lists" className="link u small">{t('lsManage')}</Link>
        </div>
      )}
    </div>
  );
}
