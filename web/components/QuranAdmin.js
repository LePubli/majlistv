'use client';
// Admin → Coran (étape 45B) : ressources (texte arabe, traductions, phonétique, tafsir), avec source, licence et crédit.
// Aucun texte n'est fourni avec le logiciel : on importe ici ce qu'on a le droit d'utiliser (adresse ou contenu du fichier).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import QuranReciters from './QuranReciters';

const KINDS = [['text', 'Texte arabe (Hafs)'], ['translation', 'Traduction'], ['transliteration', 'Phonétique'], ['tafsir', 'Tafsir'], ['words', 'Mot à mot (sens de chaque mot)'], ['tajweed', 'Couleurs du tajwid']];
// Coran complet : trois ressources dont les licences autorisent la copie fidèle (sans modification) avec crédit. Adresses figées sur une version précise
// du dépôt « risan/quran-json » (empreintes vérifiées) ; ce sont les fichiers d'origine de Tanzil et de QuranEnc.com.
const RAW = 'https://raw.githubusercontent.com/risan/quran-json/6523a9ad3b73bb7e8cb3a9cdf0ea774b8bab3123/data/';
const PRESET = [
  { slug: 'ar-tanzil-uthmani', kind: 'text', lang: 'ar', name: 'Coran — texte arabe (Hafs, Uthmani)', author: 'Tanzil Project', sourceUrl: 'https://tanzil.net/docs/text_license', position: 0,
    license: 'Creative Commons Attribution 3.0 — copie fidèle autorisée, modification interdite', credit: 'Texte du Coran : Tanzil Project (tanzil.net), © 2007-2021', url: `${RAW}tanzil/uthmani.json` },
  { slug: 'fr-hamidullah', kind: 'translation', lang: 'fr', name: 'Traduction française — Muhammad Hamidullah', author: 'Muhammad Hamidullah', sourceUrl: 'https://quranenc.com/en/browse/french_hameedullah/', position: 1,
    license: 'QuranEnc.com : republication fidèle autorisée sous conditions (crédit, version, notes conservées, aucune modification)', credit: 'Traduction : Muhammad Hamidullah — QuranEnc.com, version 1.0.2', url: `${RAW}quranenc/french_hameedullah.json` },
];
const TAF = 'https://raw.githubusercontent.com/spa5k/tafsir_api/eb82bb6294efe30ad5c135c03b1864afaa70e855/tafsir/';
const TAF_LIC = 'Al-Mukhtasar (Tafsir Center for Quranic Studies), via Quran.com / QUL (qul.tarteel.ai) — licence validée par Epok ; texte non modifié';
PRESET.push(
  { slug: 'fr-tafsir-mukhtasar', kind: 'tafsir', lang: 'fr', name: 'Tafsir — Explication abrégée du Coran (Al-Mukhtasar)', author: 'Tafsir Center for Quranic Studies', sourceUrl: 'https://qul.tarteel.ai/resources/tafsir/259', position: 10,
    license: TAF_LIC, credit: 'Tafsir : Explication abrégée du Coran (Al-Mukhtasar) — Tafsir Center for Quranic Studies, via QUL', url: `${TAF}french-mokhtasar/{n}.json` },
  { slug: 'ar-tafsir-mukhtasar', kind: 'tafsir', lang: 'ar', name: 'التفسير — المختصر في تفسير القرآن الكريم', author: 'مركز تفسير للدراسات القرآنية', sourceUrl: 'https://qul.tarteel.ai/resources/tafsir/251', position: 12,
    license: TAF_LIC, credit: 'التفسير: المختصر في تفسير القرآن الكريم — مركز تفسير للدراسات القرآنية، عبر QUL', url: `${TAF}ar-tafsir-al-mukhtasar/{n}.json` },
);
const EMPTY = { slug: '', kind: 'translation', lang: 'fr', name: '', author: '', sourceUrl: '', license: '', credit: '', enabled: false, position: 0 };
const when = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const errOf = (r, t) => r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'));

export default function QuranAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null); // { res, format, url, content }
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await call('/admin/quran/resources');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Coran »).' : errOf(r, t));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const { id, slug, kind, ...rest } = form;
    const body = { ...rest, position: Number(rest.position) || 0 };
    const r = id ? await call(`/admin/quran/resources/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await call('/admin/quran/resources', { method: 'POST', body: JSON.stringify({ ...body, slug, kind }) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setForm(null); setMsg(t('qrAdSaved')); load();
  };
  const del = async (x) => {
    if (!window.confirm(`Supprimer « ${x.name} » et tout son contenu ?`)) return;
    const r = await call(`/admin/quran/resources/${x.id}`, { method: 'DELETE' });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const toggle = async (x) => {
    setErr(''); setMsg('');
    const r = await call(`/admin/quran/resources/${x.id}`, { method: 'PUT', body: JSON.stringify({ lang: x.lang, name: x.name, author: x.author, sourceUrl: x.sourceUrl, license: x.license, credit: x.credit, enabled: !x.enabled, position: x.position }) });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const addComplete = async () => {
    if (!window.confirm(t('qrAdPresetConfirm'))) return;
    setBusy(true); setErr(''); setMsg('');
    const done = [];
    for (const x of PRESET) {
      setMsg(`Import en cours : ${x.name}…`);
      const meta = { lang: x.lang, name: x.name, author: x.author, sourceUrl: x.sourceUrl, license: x.license, credit: x.credit, position: x.position };
      let id = d.resources.find((y) => y.slug === x.slug)?.id;
      if (!id) {
        const c = await call('/admin/quran/resources', { method: 'POST', body: JSON.stringify({ ...meta, slug: x.slug, kind: x.kind, enabled: false }) });
        if (!c.ok) { setErr(`${x.name} : ${errOf(c, t)}`); setBusy(false); setMsg(''); load(); return; }
        id = c.data.id;
      }
      const i = await call(`/admin/quran/resources/${id}/import`, { method: 'POST', body: JSON.stringify({ format: 'json', url: x.url }) });
      if (!i.ok) { setErr(`${x.name} : ${errOf(i, t)}`); setBusy(false); setMsg(''); load(); return; }
      const u = await call(`/admin/quran/resources/${id}`, { method: 'PUT', body: JSON.stringify({ ...meta, enabled: true }) });
      if (!u.ok) { setErr(`${x.name} : ${errOf(u, t)}`); setBusy(false); setMsg(''); load(); return; }
      done.push(`${x.name} (${i.data.imported} versets${i.data.warning ? ` ⚠ ${i.data.warning}` : ''})`);
    }
    setBusy(false); setMsg(`${t('qrAdPresetDone')} ${done.join(' ; ')}`); load();
  };
  const runImport = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const body = { format: imp.format, ...(imp.url.trim() ? { url: imp.url.trim() } : { content: imp.content }) };
    const r = await call(`/admin/quran/resources/${imp.res.id}/import`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setImp(null); setMsg(`Import terminé : ${r.data.imported} versets, ${r.data.suras} sourate(s)${r.data.skipped ? `, ${r.data.skipped} ligne(s) ignorée(s)` : ''}.${r.data.warning ? ` ⚠ ${r.data.warning}` : ''}`); load();
  };
  // Mot à mot : crée la ressource (si absente) puis ouvre directement l'import avec choix du fichier QUL.
  const startWords = async (lang) => {
    setErr(''); setMsg('');
    const slug = `${lang}-qul-mot-a-mot`;
    let res = d.resources.find((y) => y.slug === slug);
    if (!res) {
      const meta = { slug, kind: 'words', lang, name: lang === 'fr' ? 'Mot à mot — français' : 'Word by word — English', author: 'Quranic Universal Library (QUL)',
        sourceUrl: 'https://qul.tarteel.ai/resources/word-by-word-translation', license: '', credit: 'Mot à mot : Quranic Universal Library (qul.tarteel.ai)', enabled: false, position: lang === 'fr' ? 20 : 21 };
      const c = await call('/admin/quran/resources', { method: 'POST', body: JSON.stringify(meta) });
      if (!c.ok) { setErr(errOf(c, t)); return; }
      res = { ...meta, id: c.data.id };
      load();
    }
    setImp({ res, format: 'json', url: '', content: '' }); setForm(null);
  };
  // Tajwid : crée la ressource (si absente) puis ouvre l'import avec choix du fichier (cpfair/quran-tajweed, CC BY 4.0).
  const startTajweed = async () => {
    setErr(''); setMsg('');
    const slug = 'ar-tajwid-hafs';
    let res = d.resources.find((y) => y.slug === slug);
    if (!res) {
      const meta = { slug, kind: 'tajweed', lang: 'ar', name: 'Couleurs du tajwid (Hafs)', author: 'Catherine Pfaff (cpfair/quran-tajweed)',
        sourceUrl: 'https://github.com/cpfair/quran-tajweed', license: 'Creative Commons Attribution 4.0 (CC BY 4.0) — crédit obligatoire', credit: 'Règles de tajwid : cpfair/quran-tajweed (github.com/cpfair/quran-tajweed), CC BY 4.0', enabled: false, position: 30 };
      const c = await call('/admin/quran/resources', { method: 'POST', body: JSON.stringify(meta) });
      if (!c.ok) { setErr(errOf(c, t)); return; }
      res = { ...meta, id: c.data.id };
      load();
    }
    setImp({ res, format: 'json', url: '', content: '' }); setForm(null);
  };
  const readFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setImp((s) => ({ ...s, content: String(rd.result || ''), url: '' })); rd.readAsText(f); };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  return (
    <section>
      <h2>{t('qrAdTitle')}</h2>
      <p className="meta">{t('qrAdIntro')} <Link className="link u" href="/coran">{t('qrAdOpen')}</Link></p>
      <p className="meta small">{t('qrAdLicence')}</p>
      {!form && !imp && (
        <section className="qr-preset">
          <h3>{t('qrAdPresetTitle')}</h3>
          <p className="meta small">{t('qrAdPresetText')}</p>
          <p><button type="button" className="btn" disabled={busy} onClick={addComplete}>{busy ? t('qrAdPresetBusy') : t('qrAdPresetBtn')}</button></p>
        </section>
      )}
      {!form && !imp && (
        <section className="qr-preset">
          <h3>Mot à mot (sens de chaque mot au clic)</h3>
          <p className="meta small">Sur qul.tarteel.ai → Resources → « Word by word translation », téléchargez le fichier JSON (décompressez le .zip). Cliquez ensuite sur la langue, choisissez le fichier, puis cochez « Affichée » dans le tableau. Renseignez la licence via « Modifier ».</p>
          <p><button type="button" className="btn" onClick={() => startWords('fr')}>Importer le mot à mot français</button>{' '}<button type="button" className="btn ghost" onClick={() => startWords('en')}>Importer le mot à mot anglais</button></p>
          <h3>Couleurs du tajwid</h3>
          <p className="meta small">Fichier <code>tajweed.hafs.uthmani-pause-sajdah.json</code> du dépôt cpfair/quran-tajweed (CC BY 4.0). Le texte arabe doit être importé et affiché avant. Les versets dont les règles ne tombent pas sur les bonnes lettres sont écartés (sans couleurs).</p>
          <p><button type="button" className="btn" onClick={startTajweed}>Importer le tajwid</button></p>
        </section>
      )}
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!form && !imp && <p><button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setMsg(''); setErr(''); }}>{t('qrAdNew')}</button></p>}
      {form && (
        <form className="reg-form" onSubmit={save}>
          {!form.id && <label>Identifiant (ex. fr-hamidullah)<input required value={form.slug} onChange={set('slug')} dir="ltr" pattern="[a-z0-9][a-z0-9_\-]{1,59}" /></label>}
          {!form.id && <label>Type<select value={form.kind} onChange={set('kind')}>{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
          <label>Langue (fr, en, ar…)<input required value={form.lang} onChange={set('lang')} dir="ltr" pattern="[a-z]{2,3}" /></label>
          <label>Nom affiché<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')} /></label>
          <label>Auteur / traducteur<input maxLength={200} value={form.author} onChange={set('author')} /></label>
          <label>Adresse de la source<input maxLength={500} value={form.sourceUrl} onChange={set('sourceUrl')} dir="ltr" /></label>
          <label>Licence (telle que publiée par la source)<input maxLength={300} value={form.license} onChange={set('license')} /></label>
          <label>Crédit à afficher<input maxLength={300} value={form.credit} onChange={set('credit')} /></label>
          <label>Ordre (le plus petit d’abord ; sert au choix par défaut)<input type="number" min="0" max="1000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          <label className="chk"><input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> Affichée sur le site (possible seulement une fois importée)</label>
          <p><button className="btn" disabled={busy}>{t('seasonSave')}</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      {imp && (
        <form className="reg-form" onSubmit={runImport}>
          <h3>Importer « {imp.res.name} »</h3>
          <p className="meta small">Remplace tout le contenu de cette ressource. Formats : <b>tanzil</b> (lignes <code>sourate|verset|texte</code>) ou <b>json</b> (liste de {'{sura, aya, text}'} ou objet par sourate).</p>
          {['words', 'tajweed'].includes(imp.res.kind)
            ? <p className="meta small">{imp.res.kind === 'words' ? 'JSON : liste de {sura, aya, position, text} (position = numéro du mot dans le verset, à partir de 1) ou objet { "sourate:verset:mot": "sens" }. Un verset dont les mots ne sont pas numérotés 1, 2, 3… sans trou est écarté. Le sens s\'affiche mot par mot dans l\'ordre du texte arabe.' : 'JSON : liste de {surah, ayah, annotations: [{rule, start, end}]}, positions en caractères du texte arabe importé (qui doit être déjà importé et activé). Les versets dont une position dépasse le texte sont écartés.'}</p>
            : <label>Format<select value={imp.format} onChange={(e) => setImp({ ...imp, format: e.target.value })}><option value="tanzil">tanzil (sourate|verset|texte)</option><option value="json">json</option></select></label>}
          <label>Adresse du fichier (téléchargé par le serveur, adresse publique)<input value={imp.url} onChange={(e) => setImp({ ...imp, url: e.target.value, content: '' })} dir="ltr" placeholder="https://…" /></label>
          <label>… ou fichier de votre ordinateur<input type="file" accept=".txt,.json,.csv,text/*,application/json" onChange={readFile} /></label>
          {imp.content && <p className="meta small">Fichier lu : {Math.round(imp.content.length / 1024)} Ko.</p>}
          <p><button className="btn" disabled={busy || (!imp.url.trim() && !imp.content)}>{busy ? 'Import en cours…' : 'Importer'}</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Ressource</th><th>Type</th><th>Langue</th><th>Versets</th><th>Importée</th><th>Affichée</th><th /></tr></thead>
          <tbody>
            {d.resources.length === 0 && <tr><td colSpan={7}>{t('qrAdNone')}</td></tr>}
            {d.resources.map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b><br /><span className="meta small">{x.slug}{x.credit ? ` · ${x.credit}` : ''}{x.license ? ` · ${x.license}` : ''}</span></td>
                <td>{KINDS.find(([k]) => k === x.kind)?.[1]}</td><td>{x.lang}</td>
                <td>{x.verseCount}{x.kind === 'text' && x.verseCount && x.verseCount !== d.totalExpected ? ` ⚠ (attendu ${d.totalExpected})` : ''}</td>
                <td>{when(x.importedAt)}</td><td>{x.enabled ? '✓' : '—'}</td>
                <td className="adm-actions">
                  <button type="button" className="btn ghost small" onClick={() => { setImp({ res: x, format: ['words', 'tajweed'].includes(x.kind) ? 'json' : 'tanzil', url: '', content: '' }); setForm(null); setErr(''); setMsg(''); }}>Importer</button>{' '}
                  <button type="button" className="btn ghost small" disabled={!x.verseCount && !x.enabled} onClick={() => toggle(x)}>{x.enabled ? 'Masquer' : 'Afficher'}</button>{' '}
                  <button type="button" className="btn ghost small" onClick={() => { setForm({ ...x }); setImp(null); setErr(''); setMsg(''); }}>Modifier</button>{' '}
                  <button type="button" className="btn ghost small" onClick={() => del(x)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!form && !imp && <QuranReciters />}
    </section>
  );
}
