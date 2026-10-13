'use client';
// Page de bienvenue (après l'inscription) et « Mes préférences » (?edit=1) : prénom, langue des sous-titres, thèmes préférés.
// Tout est facultatif : on peut passer cette étape, rien ne bloque l'accès aux conférences.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import Steps from '../../components/Steps';
import { langName } from '../../components/Transcript';
import { safePath } from '../../lib/nav';

// Langues de sous-titres proposées (identique à api/src/langs.js).
const LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];

function Welcome() {
  const { t, locale, user, ready, call, setPrefs, trialDays } = useApp();
  const router = useRouter();
  const qs = useSearchParams();
  const edit = qs.get('edit') === '1';
  const next = safePath(qs.get('next'), edit ? '/account' : (trialDays > 0 ? '/pricing' : '/'));
  const [cats, setCats] = useState([]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => {
    if (!user) return;
    call('/categories', {}, null).then((r) => r.ok && setCats(r.data));
    call('/me/preferences').then((r) => r.ok && setF({ name: r.data.name || '', subLang: r.data.subLang || '', categories: r.data.categories || [] }));
  }, [user, call]);
  if (!user || !f) return null;

  const toggle = (id) => setF((s) => ({ ...s, categories: s.categories.includes(id) ? s.categories.filter((x) => x !== id) : s.categories.length >= 12 ? s.categories : [...s.categories, id] }));
  const save = async (skip) => {
    setBusy(true); setErr('');
    const body = skip ? {} : { name: f.name.trim() || undefined, subLang: f.subLang || null, categories: f.categories };
    const r = await call('/me/preferences', { method: 'PUT', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(t('errGeneric')); return; }
    setPrefs(r.data);
    router.push(next);
  };
  const toPlan = next.startsWith('/pricing');

  return (
    <main className="card welcome">
      {!edit && <Steps current={1} t={t} />}
      <h1>{edit ? t('prefsTitle') : t('welcomeTitle')}</h1>
      <p className="meta">{edit ? t('prefsIntro') : t('welcomeIntro')}</p>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
        <label>{t('welcomeName')}
          <input value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="given-name" />
        </label>
        <label>{t('welcomeSubLang')}
          <select value={f.subLang} onChange={(e) => setF({ ...f, subLang: e.target.value })}>
            <option value="">{t('welcomeSubAuto')}</option>
            {LANGS.map((l) => <option key={l} value={l}>{langName(l, locale)}</option>)}
          </select>
          <span className="meta small">{t('welcomeSubHelp')}</span>
        </label>
        {cats.length > 0 && (
          <fieldset className="pick">
            <legend>{t('welcomeThemes')}</legend>
            <div className="pick-chips">
              {cats.map((c) => (
                <button type="button" key={c.id} className={`pick-chip ${f.categories.includes(c.id) ? 'on' : ''}`} aria-pressed={f.categories.includes(c.id)} onClick={() => toggle(c.id)}>
                  {f.categories.includes(c.id) ? '✓ ' : ''}{c.name}
                </button>
              ))}
            </div>
            <span className="meta small">{t('welcomeThemesHelp')}</span>
          </fieldset>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn btn-lg" disabled={busy}>
          {edit ? t('save') : toPlan ? t('welcomeToPlan') : t('welcomeContinue')}
        </button>
        {!edit && <button type="button" className="link u small" disabled={busy} onClick={() => save(true)}>{t('welcomeSkip')}</button>}
      </form>
    </main>
  );
}

export default function Page() { return <Suspense fallback={null}><Welcome /></Suspense>; }
