'use client';
// Histoire du soir : pochette, chapitres, commandes (mêmes que les livres audio). Le minuteur n'apparaît que si le parent l'a autorisé ;
// l'arrêt automatique réglé par le parent démarre avec la lecture. Reprise propre à l'enfant (gardée dans le navigateur).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../../../components/Providers';
import { useAudyn } from '../../../../../components/AudynPlayer';
import AudynControls from '../../../../../components/AudynControls';
import { fmtClock, fmtLong, resumePoint } from '../../../../../lib/audyn';

export default function KidsStory() {
  const { id } = useParams();
  const { t, call, kid } = useApp();
  const au = useAudyn();
  const [b, setB] = useState(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (!kid) return;
    call(`/kids/stories/${id}`).then((r) => { if (r.ok) setB({ ...r.data, kids: true, resumeId: `kid-${kid.id}-${r.data.id}` }); else setMissing(true); });
  }, [id, call, kid]);
  useEffect(() => { if (b) { const s = au.savedFor(b.resumeId); setSaved(s ? resumePoint(b.chapters, s) : null); } }, [b, au.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return null;
  if (missing) return <main className="page kd-page"><p className="soon">{t('awkMissing')}</p><Link className="btn" href="/kids/histoires">{t('awkTitle')}</Link></main>;
  if (!b) return <main className="page kd-page"><p className="meta">…</p></main>;
  const current = au.book?.id === b.id;
  const firstOk = Math.max(0, b.chapters.findIndex((c) => c.playable));
  return (
    <main className="page kd-page aw-page">
      <p><Link href="/kids/histoires" className="btn ghost">← {t('awkTitle')}</Link></p>
      <div className="aw-head">
        {b.coverUrl ? <img src={b.coverUrl} alt="" width="200" height="200" /> : <span className="aw-ph big" aria-hidden="true">🌙</span>}
        <div>
          <h1>{b.title}</h1>
          {b.narrator && <p>{t('awBy').replace('{name}', b.narrator)}</p>}
          <p className="meta">{b.chapters.length === 1 ? t('awChapter1') : t('awChapters').replace('{n}', b.chapters.length)} · {fmtLong(b.durationSeconds)}</p>
          {saved && (saved.pos > 0 || saved.index > 0)
            ? <button type="button" className="btn" onClick={() => au.openResume(b)}>▶ {t('awResume')}</button>
            : <button type="button" className="btn" onClick={() => au.open(b, firstOk, 0)}>▶ {t('awListen')}</button>}
        </div>
      </div>
      {!b.access.full && <p className="aw-box">{t('awkLocked')}</p>}
      {current && <AudynControls />}
      {b.description && <p className="aw-desc">{b.description}</p>}
      <ol className="aw-chapters">
        {b.chapters.map((c, i) => (
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
