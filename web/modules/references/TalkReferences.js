'use client';
// Fiche vidéo → « Références citées » : versets et hadiths validés, avec la minute (le clic ramène la vidéo au passage) et le texte de la SOURCE.
// N'affiche rien tant que la vidéo n'a pas de référence validée.
import { useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';
import { clock } from '../../lib/clock';

export default function TalkReferences({ talk, talkId, videoRef }) {
  const { t, call, feat } = useApp();
  const [list, setList] = useState(null);
  const on = Boolean(feat('references') && talk && !talk.locked && talk.references && talk.references.available);
  useEffect(() => {
    if (!on) return undefined;
    let alive = true;
    call(`/talks/${talkId}/references`).then((r) => { if (alive) setList(r.ok ? r.data.references : []); });
    return () => { alive = false; };
  }, [on, call, talkId]);
  if (!on || !list || list.length === 0) return null;
  const seek = (ms) => {
    const v = videoRef && videoRef.current;
    if (!v) return;
    try { v.currentTime = ms / 1000; v.play?.(); v.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); } catch { /* lecteur indisponible : sans effet */ }
  };
  return (
    <details className="rf-panel">
      <summary><b>{t('rfTitle')}</b> <span className="meta">({t('rfCount').replace('{n}', list.length)})</span></summary>
      <ul className="rf-list">
        {list.map((r) => (
          <li key={r.id} className="rf-item">
            <div className="rf-head">
              <b className="rf-label">{r.unidentified ? t('rfUnidentified') : r.label}</b>
              {r.startMs != null && <button type="button" className="link u small" onClick={() => seek(r.startMs)}>{t('rfAt').replace('{m}', clock(r.startMs))}</button>}
            </div>
            {r.ar && <p className="rf-ar" dir="rtl" lang="ar">{r.ar}</p>}
            {r.fr && <p className="rf-fr">{r.fr}</p>}
            {!r.ar && !r.fr && !r.unidentified && <p className="meta small">{t('rfNoText')}</p>}
            {(r.credit || r.grade) && <p className="meta small">{[r.credit, r.grade ? t('rfGrade').replace('{g}', r.grade) : ''].filter(Boolean).join(' · ')}</p>}
          </li>
        ))}
      </ul>
      <p className="meta small">{t('rfSource')}</p>
    </details>
  );
}
