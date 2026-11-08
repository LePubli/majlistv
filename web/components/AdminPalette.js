'use client';
// Amélioration 6.9 — Recherche globale de l'administration (Ctrl + K, ou ⌘ K sur Mac, ou le bouton « Rechercher »).
// Sans saisie : liste des écrans de l'administration. Avec saisie : écrans correspondants + conférences, membres, intervenants / chaînes
// (recherche côté serveur, /admin/search). Flèches ↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { matchScreens } from '../lib/adminSearch';

const ROLE = { user: 'Membre', organizer: 'Organisateur', moderator: 'Modérateur', admin: 'Administrateur' };
export default function AdminPalette({ screens }) {
  const { call } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState({ talks: [], users: [], speakers: [] });
  const [cur, setCur] = useState(0);
  const input = useRef(null);
  const close = useCallback(() => { setOpen(false); setQ(''); setFound({ talks: [], users: [], speakers: [] }); setCur(0); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  // Recherche serveur (après 250 ms sans frappe, à partir de 2 lettres).
  useEffect(() => {
    if (!open || q.trim().length < 2) { setFound({ talks: [], users: [], speakers: [] }); return undefined; }
    let off = false;
    const id = setTimeout(() => { call(`/admin/search?q=${encodeURIComponent(q.trim())}`).then((r) => { if (!off && r.ok) setFound(r.data); }); }, 250);
    return () => { off = true; clearTimeout(id); };
  }, [q, open, call]);

  const items = useMemo(() => {
    const out = matchScreens(screens, q).map((s) => ({ key: `s:${s.href}`, kind: 'Écran', label: s.label, hint: s.group, href: s.href }));
    for (const t of found.talks) out.push({ key: `t:${t.id}`, kind: 'Conférence', label: t.title, hint: [t.speaker, t.publication === 'draft' ? 'brouillon' : ''].filter(Boolean).join(' · '), href: `/studio/${t.id}` });
    for (const u of found.users) out.push({ key: `u:${u.id}`, kind: 'Membre', label: u.name, hint: `${u.email} · ${ROLE[u.role] || u.role}`, href: `/admin?tab=users&user=${u.id}` });
    for (const s of found.speakers) out.push({ key: `p:${s.slug}`, kind: 'Intervenant', label: s.name, hint: 'Intervenant / chaîne', href: `/intervenants/${s.slug}` });
    return out;
  }, [screens, q, found]);
  useEffect(() => { setCur(0); }, [q, found]);

  const go = (it) => { close(); router.push(it.href); };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(items.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && items[cur]) { e.preventDefault(); go(items[cur]); }
  };

  return (
    <>
      <button type="button" className="btn ghost adp-open" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K Meta+K">
        <span aria-hidden="true">⌕</span> Rechercher <kbd className="adp-kbd">Ctrl K</kbd>
      </button>
      {open && (
        <div className="adp-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="adp card" role="dialog" aria-modal="true" aria-label="Recherche dans l’administration" onKeyDown={onKeyDown}>
            <input ref={input} autoFocus className="adp-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Écran, conférence, membre, intervenant…" aria-label="Rechercher" role="combobox" aria-expanded="true" aria-controls="adp-list" aria-activedescendant={items[cur] ? `adp-${cur}` : undefined} autoComplete="off" />
            <ul id="adp-list" className="adp-list" role="listbox">
              {items.map((it, i) => (
                <li key={it.key} id={`adp-${i}`} role="option" aria-selected={i === cur} className={i === cur ? 'on' : undefined} onMouseEnter={() => setCur(i)} onMouseDown={(e) => { e.preventDefault(); go(it); }}>
                  <span className="adp-kind">{it.kind}</span>
                  <b dir="auto">{it.label}</b>
                  {it.hint && <small className="meta" dir="auto">{it.hint}</small>}
                </li>
              ))}
              {!items.length && <li className="meta adp-none">Aucun résultat.</li>}
            </ul>
            <p className="meta small adp-foot">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</p>
          </div>
        </div>
      )}
    </>
  );
}
