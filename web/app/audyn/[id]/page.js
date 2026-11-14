'use client';
// Audyn : fiche d'un livre (pochette, description, chapitres) et commandes du lecteur.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { useAudyn } from '../../../components/AudynPlayer';
import AudynControls from '../../../components/AudynControls';
import SaleBox, { SaleOwned } from '../../../components/SaleBox'; // étape C-2 : contenu payant à l'unité
import { fmtClock, fmtLong, resumePoint } from '../../../lib/audyn';

export default function AudynBook() {
  const { id } = useParams();
  const { t, call, feat } = useApp();
  const au = useAudyn();
  const [b, setB] = useState(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState(null);
  const load = useCallback(() => call(`/audyn/${id}`).then((r) => { if (r.ok) setB(r.data); else setMissing(true); }), [id, call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (b) { const s = au.savedFor(b.id); setSaved(s ? resumePoint(b.chapters, s) : null); } }, [b, au.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!feat('audyn')) return <main className="page"><p className="meta">{t('awOff')}</p></main>;
  if (missing) return <main className="page"><p className="err">{t('awMissing')}</p><Link className="btn" href="/audyn">{t('awTitle')}</Link></main>;
  if (!b) return <main className="page"><p className="meta">…</p></main>;
  const current = au.book?.id === b.id;
  const firstOk = Math.max(0, b.chapters.findIndex((c) => c.playable));
  return (
    <main className="page aw-page">
      <p><Link href="/audyn">← {t('awTitle')}</Link></p>
      <div className="aw-head">
        {b.coverUrl ? <img src={b.coverUrl} alt="" width="200" height="200" /> : <span className="aw-ph big" aria-hidden="true">🎧</span>}
        <div>
          <h1>{b.title}</h1>
          {(b.narrator || b.author) && <p>{b.narrator ? t('awBy').replace('{name}', b.narrator) : b.author}</p>}
          <p className="meta">{b.chapters.length === 1 ? t('awChapter1') : t('awChapters').replace('{n}', b.chapters.length)} · {fmtLong(b.durationSeconds)}</p>
          {b.sale?.owned && <p className="sale-owned-line"><SaleOwned sale={b.sale} /></p>}
          {b.chapters.length > 0 && (saved && (saved.pos > 0 || saved.index > 0)
            ? <button type="button" className="btn" onClick={() => au.openResume(b)}>▶ {t('awResume')}</button>
            : <button type="button" className="btn" onClick={() => au.open(b, firstOk, 0)}>▶ {t('awListen')}</button>)}
        </div>
      </div>
      {!b.access.full && b.sale && <SaleBox kind="audyn" id={b.id} sale={b.sale} onPaid={load} />}
      {!b.access.full && !b.sale && <p className="aw-box">{t('awPreviewBox').replace('{t}', fmtClock(b.access.previewSeconds))} <a className="btn" href="/pricing">{t('awSubscribe')}</a></p>}
      {current && <AudynControls />}
      {b.description && <p className="aw-desc">{b.description}</p>}
      <ol className="aw-chapters">
        {b.chapters.length === 0 ? <li className="meta">{t('awNoChapters')}</li> : b.chapters.map((c, i) => (
          <li key={c.id}>
            <button type="button" disabled={!c.playable} className={current && au.index === i ? 'on' : ''} onClick={() => au.open(b, i, 0)} aria-label={c.title}>
              <span className="n">{i + 1}</span><span className="tt">{c.title}</span><span className="d">{fmtClock(c.durationSeconds)}</span>{!c.playable && <span aria-hidden="true">🔒</span>}
            </button>
          </li>
        ))}
      </ol>
    </main>
  );
}
