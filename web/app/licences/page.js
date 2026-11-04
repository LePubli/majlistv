'use client';
// Page publique « Licences et crédits » : liste, pour chaque contenu soumis à licence que le site affiche (texte du Coran, traductions,
// phonétique, tafsir, mot à mot, tajwid, récitations), son auteur, sa licence, son crédit et un lien vers la source.
// Les données viennent des ressources activées dans Admin → Coran : ce qui est retiré du site disparaît de la page.
import { useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';

const KINDS = [['text', 'licText'], ['translation', 'licTranslation'], ['transliteration', 'licTransliteration'], ['tafsir', 'licTafsir'], ['words', 'licWords'], ['tajweed', 'licTajweed']];

// Seules les adresses http(s) deviennent des liens.
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

function Entry({ x, t }) {
  const url = safeUrl(x.sourceUrl);
  return (
    <li className="lic-item">
      <b dir="auto">{x.name}</b>
      {x.author ? <div className="meta small" dir="auto">{t('licBy')} : {x.author}</div> : null}
      <div className="meta small" dir="auto">{t('licLicense')} : {x.license || t('licNone')}</div>
      {x.credit ? <div className="meta small" dir="auto">{t('licCredit')} : {x.credit}</div> : null}
      {url ? <div className="meta small"><a className="link u" href={url} target="_blank" rel="noopener noreferrer">{t('licSource')}</a></div> : null}
    </li>
  );
}

export default function LicencesPage() {
  const { call, t } = useApp();
  const [res, setRes] = useState(undefined);
  const [rec, setRec] = useState([]);
  useEffect(() => {
    let dead = false;
    Promise.all([call('/quran/resources', {}, null), call('/quran/reciters', {}, null)]).then(([a, b]) => {
      if (dead) return;
      setRes(a.ok && Array.isArray(a.data) ? a.data : []);
      setRec(b.ok && Array.isArray(b.data) ? b.data : []);
    });
    return () => { dead = true; };
  }, [call]);
  if (res === undefined) return null;
  const groups = KINDS.map(([k, key]) => [key, res.filter((r) => r.kind === k)]).filter(([, l]) => l.length);
  const empty = !groups.length && !rec.length;
  return (
    <main className="page legal lic-page">
      <h1>{t('licTitle')}</h1>
      <p>{t('licIntro')}</p>
      {empty ? <p className="meta">{t('licEmpty')}</p> : null}
      {groups.length || rec.length ? <h2>{t('licQuran')}</h2> : null}
      {groups.map(([key, list]) => (
        <section key={key}>
          <h3>{t(key)}</h3>
          <ul className="lic-list">{list.map((x) => <Entry key={x.slug} x={x} t={t} />)}</ul>
        </section>
      ))}
      {rec.length ? (
        <section>
          <h3>{t('licReciters')}</h3>
          <ul className="lic-list">{rec.map((x) => <Entry key={x.slug} x={x} t={t} />)}</ul>
        </section>
      ) : null}
    </main>
  );
}
