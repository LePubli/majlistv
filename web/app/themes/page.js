'use client';
// Étape 31.1 — Bibliothèque de thèmes « Du savoir à l'action » : qualités à cultiver, défauts à corriger, thèmes d'action.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';

const GROUPS = [['quality', 'thQualities'], ['defect', 'thDefects'], ['action', 'thActions']];

export default function ThemesPage() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { call('/themes', {}, null).then((r) => setD(r.ok ? r.data : { enabled: false, themes: [] })); }, [call]);
  return (
    <main className="th-page">
      <section className="series-listhead"><h1>{t('thTitle')}</h1><p className="meta">{t('thIntro')}</p></section>
      {d && !d.enabled && <p className="soon">{t('thSoon')}</p>}
      {d?.enabled && GROUPS.map(([kind, label]) => (
        <section key={kind} className="th-group">
          <h2>{t(label)}</h2>
          <ul className="th-grid">
            {d.themes.filter((x) => x.kind === kind).map((x) => (
              <li key={x.id}>
                <Link href={`/themes/${x.id}`} className="th-card">
                  <b>{x.title}</b>
                  {(x.translit || x.ar) && <span className="meta small">{[x.translit, x.ar].filter(Boolean).join(' · ')}</span>}
                  <span className="th-desc">{x.desc}</span>
                  {x.talks > 0 && <span className="meta small">{t('thTalksN').replace('{n}', x.talks)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="meta small th-note">{t('thNote')}</p>
    </main>
  );
}
