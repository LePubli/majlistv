'use client';
// Cloche d'alertes du back-office : uniquement de VRAIS compteurs, lus sur les écrans existants (aucune alerte inventée).
//   Administration : vidéos de la Veille à traiter, erreurs ouvertes, questions IA signalées, alertes de santé du serveur.
//   Studio : contenus à relire et signalements ouverts (administrateur / modérateur), tâches en échec (organisateur / administrateur).
// Un point apparaît sur la cloche seulement s'il y a au moins une alerte ; la liste mène à l'écran concerné.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { Ico } from './BoIcon';

const BELL = 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0';

// Chaque source : clé de texte, adresse de l'écran, fonction qui lit le nombre (undefined = indisponible).
export function alertSources(space, role, feat) {
  const out = [];
  if (space === 'admin' && role === 'admin') {
    if (feat('watch')) out.push({ key: 'boAlWatch', href: '/admin?tab=watch', path: '/admin/watch/count', n: (d) => d.new });
    out.push({ key: 'boAlErrors', href: '/admin?tab=errors', path: '/admin/errors?state=open', n: (d) => d.counts?.open });
    out.push({ key: 'boAlAsk', href: '/admin?tab=ask', path: '/admin/ask/stats', n: (d) => d.reportedOpen });
    out.push({ key: 'boAlHealth', href: '/admin?tab=health', path: '/admin/health', n: (d) => (d.alerts?.states || []).filter((s) => s.level && s.level !== 'ok').length });
  }
  if (space === 'studio') {
    if (role === 'admin' || role === 'moderator') {
      out.push({ key: 'boAlMod', href: '/studio/moderation', path: '/moderation/summary', n: (d) => d.pending });
      out.push({ key: 'boAlReports', href: '/studio/moderation', path: '/moderation/summary', n: (d) => d.reports });
    }
    if (role === 'admin' || role === 'organizer') out.push({ key: 'boAlTasks', href: '/studio/activity', path: '/studio/activity/count', n: (d) => d.failed });
  }
  return out;
}

export default function BoBell({ space }) {
  const { t, user, feat, call } = useApp();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const ref = useRef(null);
  const role = user?.role;
  const featOn = feat('watch');
  useEffect(() => {
    if (!role) return undefined;
    const sources = alertSources(space, role, feat);
    if (!sources.length) return undefined;
    let off = false;
    const load = async () => {
      const cache = {}; // une même adresse n'est lue qu'une fois
      const got = await Promise.all(sources.map(async (s) => {
        cache[s.path] = cache[s.path] || call(s.path);
        const r = await cache[s.path];
        const n = r && r.ok ? Number(s.n(r.data)) : 0;
        return { key: s.key, href: s.href, n: Number.isFinite(n) ? n : 0 };
      }));
      if (!off) setRows(got.filter((g) => g.n > 0));
    };
    load();
    const id = setInterval(load, 120000);
    return () => { off = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, role, featOn, call]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div className="bo-drop" ref={ref}>
      <button type="button" className="bo-icon bo-bell" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label={total ? `${t('boBell')} (${total})` : t('boBell')} title={t('boBell')}>
        <Ico d={BELL} size={19} />{total > 0 && <i className="bo-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="bo-pop bo-alerts" role="menu" onClick={() => setOpen(false)}>
          <div className="bo-pop-title">{t('boBell')}</div>
          {rows.length === 0 && <p className="bo-none">{t('boNoAlerts')}</p>}
          {rows.map((r) => (
            <Link key={r.key} href={r.href} role="menuitem"><b>{r.n.toLocaleString()}</b><span>{t(r.key)}</span></Link>
          ))}
        </div>
      )}
    </div>
  );
}
