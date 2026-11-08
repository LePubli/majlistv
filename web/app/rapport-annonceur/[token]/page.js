'use client';
// Amélioration 5.3 (étape 2) — Rapport de campagne pour l'annonceur : page publique, sans compte, accessible par un lien secret.
// Affiche les totaux, la répartition par langue de l'application et la courbe des affichages par jour ; PDF téléchargeable.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';

const STATUS = { live: 'En cours', scheduled: 'Programmée', ended: 'Terminée', paused: 'En pause' };
const LANG = { fr: 'Français', en: 'Anglais', ar: 'Arabe', none: 'Sans langue' };
const nf = (n) => new Intl.NumberFormat('fr-FR').format(n);
const pct = (n) => `${String(n).replace('.', ',')} %`;
const day = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const fdate = (v) => new Date(v).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

// Courbe : barres (affichages) et points (clics) sur 90 jours, en SVG, sans bibliothèque.
function Curve({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.impressions));
  const W = 600, H = 150, bw = W / daily.length;
  return (
    <figure className="adr-curve">
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={`Affichages par jour sur ${daily.length} jours, pic à ${nf(max)}`} preserveAspectRatio="none">
        {daily.map((d, i) => {
          const h = (d.impressions / max) * H;
          return <rect key={d.day} x={i * bw + 0.5} y={H - h} width={Math.max(1, bw - 1)} height={h} fill="#d4af37"><title>{`${day(d.day)} : ${nf(d.impressions)} affichage(s), ${nf(d.clicks)} clic(s)`}</title></rect>;
        })}
        <line x1="0" y1={H} x2={W} y2={H} stroke="#666" strokeWidth="1" />
      </svg>
      <figcaption className="meta small adr-axis"><span>{day(daily[0].day)}</span><span>pic : {nf(max)} / jour</span><span>{day(daily[daily.length - 1].day)}</span></figcaption>
    </figure>
  );
}

export default function AdvertiserReport() {
  const { token } = useParams();
  const { call } = useApp();
  const [r, setR] = useState(null);
  const [bad, setBad] = useState(false);
  useEffect(() => { call(`/ad-report/${token}`, {}, null).then((x) => (x.ok ? setR(x.data) : setBad(true))); }, [call, token]);

  return (
    <main className="page adr-page" dir="ltr">
      <meta name="robots" content="noindex, nofollow" />
      <p className="meta small">Mejliss TV · Rapport de campagne</p>
      {bad && <p className="error" role="alert">Ce lien de suivi est inconnu ou a été désactivé. Demandez un nouveau lien à Mejliss TV.</p>}
      {!bad && !r && <p className="meta">Chargement…</p>}
      {r && (
        <>
          <h1>{r.title}</h1>
          <p className="th-lead">{r.advertiser}</p>
          <p className="meta">
            {STATUS[r.status]}{r.startsAt ? ` · du ${fdate(r.startsAt)}` : ''}{r.endsAt ? ` · jusqu’au ${fdate(r.endsAt)}` : ''}
            {' · '}Langues visées : {r.languages.length ? r.languages.map((l) => LANG[l]).join(', ') : 'toutes'}
          </p>
          <ul className="adr-kpis">
            {[['Affichages', nf(r.totals.impressions)], ['Clics', nf(r.totals.clicks)], ['Taux de clic', pct(r.totals.ctr)], ['« Passer »', nf(r.totals.skips)]].map(([k, v]) => (
              <li key={k} className="card"><b>{v}</b><span className="meta">{k}</span></li>
            ))}
          </ul>
          <h2>Affichages par jour <small className="meta">(90 derniers jours)</small></h2>
          <Curve daily={r.daily} />
          <h2>Par langue de l’application</h2>
          <div className="adr-table-wrap">
            <table className="adr-table">
              <thead><tr><th>Langue</th><th>Affichages</th><th>Clics</th><th>Taux de clic</th></tr></thead>
              <tbody>{['fr', 'en', 'ar', 'none'].map((k) => (
                <tr key={k}><td>{LANG[k]}</td><td>{nf(r.byLang[k].impressions)}</td><td>{nf(r.byLang[k].clicks)}</td><td>{pct(r.byLang[k].ctr)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="meta small">« Sans langue » : affichages comptés avant le suivi par langue ou par une ancienne version de l’application. Chiffres comptés par l’application Mejliss TV ; aucune donnée personnelle.</p>
          <p><a className="btn" href={`/api/ad-report/${token}/pdf`} download>Télécharger le rapport en PDF</a></p>
        </>
      )}
    </main>
  );
}
