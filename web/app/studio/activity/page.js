'use client';
// Studio → Activité : les traitements en cours ou en erreur de mes contenus, puis les dernières mises en ligne.
// Rafraîchi automatiquement tant qu'un traitement tourne.
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import useMyTalks from '../../../components/useMyTalks';
import TalkSteps from '../../../components/TalkSteps';

export default function StudioActivity() {
  const { t, locale } = useApp();
  const { rows, loaded } = useMyTalks();
  const active = rows.filter((r) => r.kind === 'run' || r.kind === 'err');
  const recent = rows.filter((r) => r.kind === 'live').slice(0, 8);
  const date = (d) => new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const Item = ({ r }) => (
    <li className="sd-act">
      <Link href={`/studio/${r.id}`} className="sd-act-title"><b>{r.title}</b><small>{date(r.created_at)}</small></Link>
      <span className={`state state-${r.kind}`}><i aria-hidden="true" />{t('state_' + r.kind)}{r.kind === 'run' && r.pct != null ? ` ${r.pct} %` : ''}</span>
      <TalkSteps steps={r.steps} />
    </li>
  );
  return (
    <main className="studio-page studio-narrow">
      <div className="studio-head"><h1 className="studio-title">{t('sdActivity')}</h1></div>
      <section aria-labelledby="act-now">
        <h2 id="act-now" className="sd-h2">{t('sdActNow')}</h2>
        {loaded && active.length === 0 && <p className="meta">{t('sdRunningNone')}</p>}
        <ul className="sd-list">{active.map((r) => <Item key={r.id} r={r} />)}</ul>
      </section>
      <section aria-labelledby="act-recent">
        <h2 id="act-recent" className="sd-h2">{t('sdActRecent')}</h2>
        {loaded && recent.length === 0 && <p className="meta">{t('sdLastNone')}</p>}
        <ul className="sd-list">{recent.map((r) => <Item key={r.id} r={r} />)}</ul>
      </section>
      <p className="meta small">{t('stepsLegend')}</p>
    </main>
  );
}
