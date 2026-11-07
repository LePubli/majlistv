'use client';
// Histoires du soir (espace Kids) : les histoires à écouter avant de dormir. Illimitées (hors limite quotidienne) ; le parent règle le minuteur.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import { fmtLong } from '../../../../lib/audyn';

export default function KidsStories() {
  const { t, call, kid, feat } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { if (kid) call('/kids/stories').then((r) => setD(r.ok ? r.data : { items: [], off: true })); }, [call, kid]);
  if (!kid) return null;
  if (!feat('audyn')) return <main className="page kd-page"><p className="soon">{t('awOff')}</p></main>;
  return (
    <main className="page kd-page aw-page">
      <p><Link href="/kids" className="btn ghost">← {t('awkBack')}</Link></p>
      <h1>🌙 {t('awkTitle')}</h1>
      <p className="meta">{t('awkIntro')}</p>
      {!d ? <p className="meta">…</p> : d.items.length === 0 ? <p className="soon">{t('awkEmpty')}</p> : (
        <ul className="aw-list">
          {d.items.map((b) => (
            <li key={b.id}>
              <Link href={`/kids/histoires/${b.id}`} className="aw-card">
                {b.coverUrl ? <img src={b.coverUrl} alt="" width="96" height="96" loading="lazy" /> : <span className="aw-ph" aria-hidden="true">🌙</span>}
                <span className="aw-info">
                  <strong>{b.title}</strong>
                  {b.narrator && <span>{t('awBy').replace('{name}', b.narrator)}</span>}
                  <span className="meta">{b.chapters === 1 ? t('awChapter1') : t('awChapters').replace('{n}', b.chapters)} · {fmtLong(b.durationSeconds)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
