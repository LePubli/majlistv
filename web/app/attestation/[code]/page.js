// Attestation de suivi d'une série : page publique, vérifiable par son code, imprimable (Imprimer → « Enregistrer en PDF »).
// Jamais indexée : elle porte un nom de personne.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { DICT, DIR, getLocale } from '../../../lib/i18n';
import { dictFor } from '../../../lib/texts';
import PrintButton from './PrintButton';

export const metadata = { title: 'Attestation de suivi', robots: { index: false, follow: false } };

async function load(code) {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/attestations/${encodeURIComponent(code)}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export default async function Attestation({ params }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const dict = await dictFor(locale); // textes d'origine + textes modifiés (Admin → Textes)
  const t = (k) => dict[k] || DICT.fr[k] || k;
  const a = await load(params.code);
  if (!a) notFound();
  const date = new Date(a.issuedAt).toLocaleDateString(locale, { dateStyle: 'long' });
  return (
    <main className="page attest-page" dir={DIR[locale]}>
      <article className="attest" aria-labelledby="att-title">
        <img className="attest-logo" src="/brand/emblem.png" alt="" width="52" height="56" />
        <p className="eyebrow">Mejliss TV</p>
        <h1 id="att-title">{t('attTitle')}</h1>
        <p className="attest-lead">{t('attCertifies')}</p>
        <p className="attest-name">{a.holder}</p>
        <p className="attest-lead">{t('attFollowed')}</p>
        <p className="attest-series">{a.seriesTitle}</p>
        {a.speaker && <p className="meta">{a.speaker}</p>}
        <p className="attest-facts">{t('attFacts').replace('{n}', a.quizzes).replace('{p}', a.average)}</p>
        <p className="attest-date">{t('attIssued')} {date}</p>
        <p className="attest-note">{t('attNote')}</p>
        <p className="attest-code">{t('attCode')} : <code>{a.code}</code></p>
      </article>
      <PrintButton label={t('attPrint')} />
    </main>
  );
}
