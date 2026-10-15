'use client';
// Étape I1 — Administration → Apparence : couleurs, polices, arrondis et espacements du site, sans toucher au code.
//
// Fonctionnement : chaque thème a une version publiée (vue par les visiteurs s'il est actif) et un brouillon.
// Chaque modification part dans le brouillon (enregistré tout seul après une seconde) et s'affiche aussitôt dans
// l'aperçu : une vraie page du site, chargée dans un cadre, dont on remplace la feuille de style du thème.
// « Publier » rend le brouillon visible ; chaque publication est gardée dans l'historique et peut être restaurée.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';
import { TOKENS, TOKEN_MAP, GROUPS, BUILTIN_FONTS, buildCss, checkValue, contrastIssues, resolveColor } from '../lib/themeCss';

const DEVICES = [
  { id: 390, label: 'Téléphone' },
  { id: 768, label: 'Tablette' },
  { id: 1024, label: 'Petit écran' },
  { id: 1440, label: 'Grand écran' },
];
const PAGES = [
  ['/', 'Accueil'], ['/library', 'Ma bibliothèque'], ['/learning', 'Apprentissage'], ['/account', 'Mon compte'],
  ['/chaines', 'Chaînes'], ['/collections', 'Collections'], ['/pricing', 'Tarifs'], ['/kids', 'Espace Kids'], ['/admin?tab=features', 'Administration'],
];
const ROOT_COLORS = TOKENS.filter((t) => t.scope === 'root' && t.type === 'color' && t.group === 'base');
const ROOT_LENGTHS = TOKENS.filter((t) => t.scope === 'root' && t.type === 'length' && t.group === 'shape');
const REF = /^@([A-Za-z0-9]+)(?:\/(\d{1,3}))?$/;

const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Lit un fichier choisi par l'utilisateur en adresse data: (pour l'envoi des polices).
const readAsDataUrl = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); });

/* ------------------------------------------------------------------ Un réglage */
function ColorField({ t, value, values, onChange }) {
  const ref = value.match(REF);
  const linked = ref ? ref[1] : '';
  const shown = toHex(resolveColor(t.id, values));
  const canLink = t.scope === 'body';
  return (
    <div className="ap-ctl">
      <input type="color" aria-label={`${t.label} : choisir une couleur`} value={shown.length === 7 ? shown : '#000000'}
        onChange={(e) => onChange(e.target.value.toUpperCase())} />
      {canLink && (
        <select aria-label={`${t.label} : reprendre une couleur de base`} value={linked} onChange={(e) => onChange(e.target.value ? `@${e.target.value}` : shown)}>
          <option value="">Couleur libre</option>
          {ROOT_COLORS.map((x) => <option key={x.id} value={x.id}>= {x.label}</option>)}
        </select>
      )}
      {linked ? (
        <label className="ap-opacity">
          <span>Opacité</span>
          <input type="number" min="0" max="100" step="1" value={ref[2] ?? 100}
            onChange={(e) => { const n = Math.max(0, Math.min(100, Number(e.target.value) || 0)); onChange(n >= 100 ? `@${linked}` : `@${linked}/${n}`); }} />
          <span aria-hidden="true">%</span>
        </label>
      ) : (
        <input type="text" className="ap-hex" aria-label={`${t.label} : code couleur`} value={value} spellCheck={false} maxLength={9}
          onChange={(e) => onChange(e.target.value.trim())} />
      )}
    </div>
  );
}

function LengthField({ t, value, onChange }) {
  const ref = value.match(REF);
  const px = ref ? '' : String(parseFloat(value) * (value.endsWith('rem') ? 16 : 1));
  const canLink = t.scope === 'body' && t.group === 'shape';
  return (
    <div className="ap-ctl">
      {canLink && (
        <select aria-label={`${t.label} : reprendre un réglage`} value={ref ? ref[1] : ''} onChange={(e) => onChange(e.target.value ? `@${e.target.value}` : t.def.startsWith('@') ? '8px' : t.def)}>
          <option value="">Valeur libre</option>
          {ROOT_LENGTHS.map((x) => <option key={x.id} value={x.id}>= {x.label}</option>)}
        </select>
      )}
      {!ref && (
        <>
          <input type="range" min={t.min} max={Math.min(t.max, t.max >= 999 ? 60 : t.max)} step="1" aria-label={t.label} value={Math.min(Number(px) || 0, t.max >= 999 ? 60 : t.max)}
            onChange={(e) => onChange(`${e.target.value}px`)} />
          <label className="ap-num"><input type="number" min={t.min} max={t.max} step="1" aria-label={`${t.label} en pixels`} value={px} onChange={(e) => onChange(`${e.target.value || 0}px`)} /><span aria-hidden="true">px</span></label>
          {t.max >= 999 && <button type="button" className="btn ghost ap-mini" onClick={() => onChange('999px')}>Pilule</button>}
        </>
      )}
    </div>
  );
}

function FontField({ t, value, fonts, onChange }) {
  const families = [...BUILTIN_FONTS, ...[...new Set(fonts.map((f) => f.family))]];
  const stack = value === 'Système' ? 'system-ui' : value === 'Serif' ? 'Georgia, serif' : `'${value}'`;
  return (
    <div className="ap-ctl">
      <select aria-label={t.label} value={value} onChange={(e) => onChange(e.target.value)}>
        {families.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="ap-font-sample" style={{ fontFamily: stack }} dir={t.id.endsWith('Ar') ? 'rtl' : 'ltr'}>{t.id.endsWith('Ar') ? 'مجلس — أبجد هوز' : 'Des conférences qui éclairent'}</span>
    </div>
  );
}

function TokenRow({ t, values, fonts, onSet, onReset, error, flagged }) {
  const value = values[t.id] ?? t.def;
  const changed = values[t.id] !== undefined;
  return (
    <div className={`ap-row${changed ? ' changed' : ''}${flagged ? ' flagged' : ''}`} id={`ap-t-${t.id}`}>
      <div className="ap-label">
        <b>{t.label}</b>
        {changed && <span className="ap-tag">modifié</span>}
        {error && <span className="ap-err" role="alert">{error}</span>}
      </div>
      {t.type === 'color' && <ColorField t={t} value={value} values={values} onChange={(v) => onSet(t.id, v)} />}
      {t.type === 'length' && <LengthField t={t} value={value} onChange={(v) => onSet(t.id, v)} />}
      {t.type === 'font' && <FontField t={t} value={value} fonts={fonts} onChange={(v) => onSet(t.id, v)} />}
      <button type="button" className="ap-reset" disabled={!changed} onClick={() => onReset(t.id)} aria-label={`${t.label} : revenir à la valeur d'origine`} title="Valeur d'origine">↺</button>
    </div>
  );
}

/* ------------------------------------------------------------------ Polices importées */
function FontsPanel({ fonts, reload }) {
  const { call } = useApp();
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState('400');
  const [style, setStyle] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const send = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg('Choisissez un fichier de police.'); return; }
    if (file.size > 2 * 1024 * 1024) { setMsg('Fichier trop lourd (2 Mo maximum).'); return; }
    setBusy(true); setMsg('');
    const r = await call('/admin/theme/fonts', { method: 'POST', body: JSON.stringify({ family: family.trim(), weight, style, file: await readAsDataUrl(file) }) });
    setBusy(false);
    if (r.ok) { setMsg(`Police « ${r.data.family} » ajoutée : elle est maintenant proposée dans les listes de polices.`); setFamily(''); fileRef.current.value = ''; reload(); } else setMsg(r.data?.error || 'Échec de l’envoi');
  };
  const del = async (f) => {
    if (!window.confirm(`Supprimer la police « ${f.family} » (${f.weight}, ${f.style}) ?`)) return;
    const r = await call(`/admin/theme/fonts/${f.id}`, { method: 'DELETE' });
    if (r.ok || r.status === 204) reload(); else setMsg(r.data?.error || 'Suppression impossible');
  };
  return (
    <div className="ap-fonts">
      <h3>Polices importées</h3>
      <p className="meta small">Formats WOFF2 (conseillé), WOFF, TTF ou OTF, 2 Mo maximum par fichier. Les polices sont hébergées sur votre serveur (aucun appel à Google, conforme RGPD). Vérifiez que la licence de la police autorise son usage sur un site web.</p>
      {fonts.length > 0 && (
        <ul className="ap-font-list">
          {fonts.map((f) => (
            <li key={f.id}><span style={{ fontFamily: `'${f.family}'`, fontWeight: f.weight.split(' ')[0], fontStyle: f.style }}>{f.family}</span> <span className="meta small">{f.weight} · {f.style === 'italic' ? 'italique' : 'normal'} · {f.format} · {Math.round(f.sizeBytes / 1024)} Ko</span>
              <button type="button" className="btn ghost ap-mini" onClick={() => del(f)}>Supprimer</button></li>
          ))}
        </ul>
      )}
      <form className="ap-font-form" onSubmit={send}>
        <label>Nom de la police<input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="ex. Amiri" maxLength={40} required /></label>
        <label>Graisse<select value={weight} onChange={(e) => setWeight(e.target.value)}>
          {['100 900', '300', '400', '500', '600', '700', '800'].map((w) => <option key={w} value={w}>{w === '100 900' ? 'Variable (100 à 900)' : w}</option>)}
        </select></label>
        <label>Style<select value={style} onChange={(e) => setStyle(e.target.value)}><option value="normal">Normal</option><option value="italic">Italique</option></select></label>
        <label>Fichier<input ref={fileRef} type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" required /></label>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Envoi…' : 'Importer la police'}</button>
      </form>
      <p className="ap-msg" role="status" aria-live="polite">{msg}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Aperçu */
function Preview({ css }) {
  const frame = useRef(null);
  const box = useRef(null);
  const [device, setDevice] = useState(1440);
  const [path, setPath] = useState('/');
  const [custom, setCustom] = useState('');
  const [lang, setLang] = useState('');
  const [boxW, setBoxW] = useState(800);
  const [viewH, setViewH] = useState(900);
  const [nonce, setNonce] = useState(0); // force le rechargement du cadre (changement de langue)
  const original = useRef(null);

  // Remplace la feuille de style du thème dans la page affichée (même origine : accès direct au document du cadre).
  const inject = useCallback(() => {
    try {
      const doc = frame.current?.contentDocument;
      if (!doc) return;
      let el = doc.getElementById('theme-vars');
      if (!el) { el = doc.createElement('style'); el.id = 'theme-vars'; doc.body?.prepend(el); }
      el.textContent = css;
    } catch { /* page d'une autre origine : rien à faire */ }
  }, [css]);
  useEffect(() => { inject(); }, [inject]);

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(box.current);
    const onResize = () => setViewH(window.innerHeight);
    onResize();
    if (window.innerWidth < 700) setDevice(390); // sur téléphone, l'aperçu part sur la taille téléphone
    window.addEventListener('resize', onResize);
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); };
  }, []);

  // Langue de l'aperçu : la langue du site se choisit par un cookie ; on le remet comme avant en quittant la page.
  useEffect(() => {
    original.current = document.cookie.match(/(?:^|; )locale=([^;]+)/)?.[1] || '';
    const restore = () => { document.cookie = original.current ? `locale=${original.current};path=/;max-age=31536000;samesite=lax` : 'locale=;path=/;max-age=0'; };
    window.addEventListener('beforeunload', restore);
    return () => { restore(); window.removeEventListener('beforeunload', restore); };
  }, []);
  const setPreviewLang = (l) => {
    setLang(l);
    const v = l || original.current;
    document.cookie = v ? `locale=${v};path=/;max-age=31536000;samesite=lax` : 'locale=;path=/;max-age=0';
    setNonce((n) => n + 1);
  };

  // Le cadre garde la largeur réelle de l'écran choisi, réduite pour tenir dans la colonne ; sa hauteur remplit la fenêtre.
  const scale = Math.min(1, boxW / device);
  const boxH = Math.max(420, Math.min(1100, viewH - 190));
  const height = Math.round(boxH / scale);
  const src = custom.startsWith('/') && !custom.startsWith('//') ? custom : path;
  return (
    <section className="ap-preview" aria-label="Aperçu">
      <div className="ap-preview-bar">
        <div className="ap-seg" role="group" aria-label="Taille d'écran">
          {DEVICES.map((d) => <button key={d.id} type="button" className={device === d.id ? 'on' : ''} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>{d.label}<small>{d.id} px</small></button>)}
        </div>
        <div className="ap-seg" role="group" aria-label="Langue de l'aperçu">
          {[['', 'Langue actuelle'], ['fr', 'FR'], ['en', 'EN'], ['ar', 'AR']].map(([l, label]) => <button key={l || 'cur'} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setPreviewLang(l)}>{label}</button>)}
        </div>
        <label className="ap-page">Page
          <select value={PAGES.some(([p]) => p === path) ? path : '/'} onChange={(e) => { setPath(e.target.value); setCustom(''); }}>
            {PAGES.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
          </select>
        </label>
        <label className="ap-page">Autre adresse
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="/talks/…" />
        </label>
      </div>
      <div className="ap-frame-box" ref={box} style={{ height: boxH + 2 }}>
        <iframe key={`${src}-${nonce}`} ref={frame} src={src} title="Aperçu du site avec le brouillon" onLoad={inject}
          style={{ width: device, height, transform: `scale(${scale})` }} />
      </div>
      <p className="meta small">L’aperçu montre le brouillon sur une vraie page du site (vous y êtes connecté avec votre compte). Les visiteurs ne voient rien tant que vous n’avez pas publié.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ Page */
export default function AppearanceAdmin() {
  const { call } = useApp();
  const [themes, setThemes] = useState(null);
  const [cur, setCur] = useState(null); // thème ouvert (publié + brouillon)
  const [values, setValues] = useState({}); // valeurs en cours d'édition
  const [fonts, setFonts] = useState([]);
  const [errors, setErrors] = useState({});
  const [save, setSave] = useState('idle'); // idle | pending | saving | saved | error
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set(['base']));
  const [versions, setVersions] = useState(null);
  const timer = useRef(null);
  const importRef = useRef(null);

  const loadThemes = useCallback(() => call('/admin/themes').then((r) => { if (r.ok) setThemes(r.data); return r.ok ? r.data : []; }), [call]);
  const loadFonts = useCallback(() => call('/admin/theme/fonts').then((r) => r.ok && setFonts(r.data)), [call]);
  const openTheme = useCallback(async (id) => {
    const r = await call(`/admin/themes/${id}`);
    if (!r.ok) return;
    setCur(r.data); setValues(r.data.draft ?? r.data.published); setErrors({}); setSave('idle'); setVersions(null);
  }, [call]);

  useEffect(() => {
    loadFonts();
    loadThemes().then((list) => { const a = list.find((x) => x.isActive) || list[0]; if (a) openTheme(a.id); });
  }, [loadThemes, loadFonts, openTheme]);

  // Enregistrement automatique du brouillon, une seconde après la dernière modification.
  const persist = useCallback(async (id, vals) => {
    setSave('saving');
    const r = await call(`/admin/themes/${id}/draft`, { method: 'PUT', body: JSON.stringify({ values: vals }) });
    if (r.ok) { setCur(r.data); setErrors({}); setSave('saved'); loadThemes(); } else { setErrors(r.data?.errors || {}); setSave('error'); }
  }, [call, loadThemes]);
  const schedule = (vals) => {
    setSave('pending');
    clearTimeout(timer.current);
    // Une valeur en cours de saisie (code couleur incomplet) n'est pas envoyée : on attend qu'elle soit correcte.
    const names = fonts.map((f) => f.family);
    const bad = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, checkValue(k, v, names)]).filter(([, e]) => e));
    setErrors(bad);
    if (Object.keys(bad).length) { setSave('error'); return; }
    timer.current = setTimeout(() => persist(cur.id, vals), 1000);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const setOne = (id, v) => { const next = { ...values, [id]: v }; if (v === TOKEN_MAP[id].def) delete next[id]; setValues(next); schedule(next); };
  const resetOne = (id) => { const next = { ...values }; delete next[id]; setValues(next); schedule(next); };

  // Feuille de style de l'aperçu : seulement les valeurs correctes (une saisie en cours garde l'ancienne valeur).
  const names = fonts.map((f) => f.family);
  const valid = useMemo(() => Object.fromEntries(Object.entries(values).filter(([k, v]) => !checkValue(k, v, names))), [values, fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const css = useMemo(() => buildCss(valid, fonts), [valid, fonts]);
  const issues = useMemo(() => contrastIssues(valid), [valid]);
  const flagged = new Set(issues.flatMap((i) => [i.fg, i.bg]));

  const act = async (label, fn) => { setMsg(''); const r = await fn(); if (r && !r.ok && r.status !== 204) setMsg(r.data?.error || `${label} : échec`); return r; };
  const publish = async () => {
    clearTimeout(timer.current);
    if (Object.keys(errors).length) { setMsg('Corrigez d’abord les valeurs signalées en rouge.'); return; }
    if (issues.length && !window.confirm(`${issues.length} association(s) de couleurs sont peu lisibles (voir la liste « Lisibilité »). Publier quand même ?`)) return;
    await persist(cur.id, values);
    const r = await act('Publication', () => call(`/admin/themes/${cur.id}/publish`, { method: 'POST' }));
    if (r?.ok) { setCur(r.data); setValues(r.data.published); setMsg(cur.isActive ? 'Publié : le site affiche maintenant ce thème (sous 10 secondes).' : 'Publié. Ce thème n’est pas actif : cliquez sur « Activer » pour l’afficher sur le site.'); loadThemes(); }
  };
  const discard = async () => {
    if (!window.confirm('Abandonner le brouillon et revenir à la version publiée ?')) return;
    clearTimeout(timer.current);
    const r = await act('Abandon', () => call(`/admin/themes/${cur.id}/draft`, { method: 'DELETE' }));
    if (r?.ok) { setCur(r.data); setValues(r.data.published); setErrors({}); setSave('idle'); loadThemes(); }
  };
  const activate = async () => {
    if (!window.confirm(`Afficher le thème « ${cur.name} » sur le site (version publiée) ?`)) return;
    const r = await act('Activation', () => call(`/admin/themes/${cur.id}/activate`, { method: 'POST' }));
    if (r?.ok) { setMsg(`« ${cur.name} » est maintenant le thème du site.`); await loadThemes(); openTheme(cur.id); }
  };
  const create = async () => {
    const name = window.prompt('Nom du nouveau thème (il part d’une copie du thème ouvert, version publiée) :', `${cur.name} (copie)`);
    if (!name) return;
    const r = await act('Création', () => call('/admin/themes', { method: 'POST', body: JSON.stringify({ name: name.slice(0, 60), copyFrom: cur.id }) }));
    if (r?.ok) { await loadThemes(); openTheme(r.data.id); }
  };
  const rename = async () => {
    const name = window.prompt('Nouveau nom du thème :', cur.name);
    if (!name || name === cur.name) return;
    const r = await act('Renommage', () => call(`/admin/themes/${cur.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.slice(0, 60) }) }));
    if (r?.ok) { setCur((c) => ({ ...c, name: r.data.name })); loadThemes(); }
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement le thème « ${cur.name} » et son historique ?`)) return;
    const r = await act('Suppression', () => call(`/admin/themes/${cur.id}`, { method: 'DELETE' }));
    if (r && (r.ok || r.status === 204)) { const list = await loadThemes(); const a = list.find((x) => x.isActive) || list[0]; if (a) openTheme(a.id); }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'mejliss-tv-theme', version: 1, name: cur.name, values }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `theme-${cur.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { setMsg('Ce fichier n’est pas un thème valide (JSON illisible).'); return; }
    const r = await act('Import', () => call('/admin/themes', { method: 'POST', body: JSON.stringify({ name: String(data.name || file.name).slice(0, 60), values: data.values || {} }) }));
    if (r?.ok) { setMsg(`Thème « ${r.data.name} » importé (non actif).`); await loadThemes(); openTheme(r.data.id); } else if (r?.data?.errors) setMsg(`Import refusé : ${Object.entries(r.data.errors).map(([k, v]) => `${TOKEN_MAP[k]?.label || k} (${v})`).join(', ')}`);
  };
  const showVersions = async () => {
    if (versions) { setVersions(null); return; }
    const r = await call(`/admin/themes/${cur.id}/versions`);
    if (r.ok) setVersions(r.data);
  };
  const restore = async (v) => {
    if (!window.confirm(`Recopier la version du ${fmtDate(v.createdAt)} dans le brouillon ? (Rien n’est publié tant que vous ne cliquez pas sur « Publier ».)`)) return;
    clearTimeout(timer.current);
    const r = await act('Restauration', () => call(`/admin/themes/${cur.id}/versions/${v.id}/restore`, { method: 'POST' }));
    if (r?.ok) { setCur(r.data); setValues(r.data.draft); setVersions(null); setMsg('Ancienne version recopiée dans le brouillon : vérifiez l’aperçu, puis publiez.'); }
  };
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const goTo = (id) => {
    setOpen((s) => new Set([...s, TOKEN_MAP[id].group]));
    setTimeout(() => document.getElementById(`ap-t-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  if (!themes || !cur) return <p className="meta">Chargement…</p>;
  const needle = q.trim().toLowerCase();
  const changedCount = Object.keys(values).length;
  const hasDraft = cur.hasDraft || save === 'pending' || save === 'saving';
  const saveLabel = { idle: '', pending: 'Modifications en attente…', saving: 'Enregistrement du brouillon…', saved: 'Brouillon enregistré', error: 'Valeur à corriger' }[save];

  return (
    <section className="ap" lang="fr" dir="ltr">
      <p className="meta">Réglez les couleurs, polices, arrondis et espacements du site. Vos changements partent dans un <b>brouillon</b> et s’affichent dans l’aperçu ; les visiteurs ne voient rien avant que vous cliquiez sur <b>Publier</b>. Chaque publication est gardée dans l’historique.</p>

      <div className="ap-top">
        <label className="ap-theme">Thème
          <select value={cur.id} onChange={(e) => openTheme(Number(e.target.value))}>
            {themes.map((x) => <option key={x.id} value={x.id}>{x.name}{x.isActive ? ' — actif' : ''}{x.hasDraft ? ' (brouillon)' : ''}</option>)}
          </select>
        </label>
        <div className="ap-actions">
          <button type="button" className="btn" onClick={publish} disabled={!hasDraft}>Publier</button>
          <button type="button" className="btn ghost" onClick={discard} disabled={!cur.hasDraft}>Abandonner le brouillon</button>
          {!cur.isActive && <button type="button" className="btn ghost" onClick={activate}>Activer sur le site</button>}
          <button type="button" className="btn ghost" onClick={showVersions} aria-expanded={Boolean(versions)}>Historique</button>
          <details className="ap-more">
            <summary className="btn ghost">Plus</summary>
            <div className="ap-more-menu">
              <button type="button" onClick={create}>Nouveau thème (copie)</button>
              <button type="button" onClick={rename}>Renommer</button>
              <button type="button" onClick={exportJson}>Exporter (fichier JSON)</button>
              <button type="button" onClick={() => importRef.current?.click()}>Importer un thème…</button>
              {!cur.isActive && <button type="button" className="danger" onClick={remove}>Supprimer ce thème</button>}
            </div>
          </details>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
        </div>
      </div>
      <p className="ap-status" role="status" aria-live="polite">
        {cur.isActive ? <span className="ap-pill on">Actif sur le site</span> : <span className="ap-pill">Non affiché sur le site</span>}
        {cur.publishedAt && <span>Publié le {fmtDate(cur.publishedAt)}</span>}
        <span>{changedCount} réglage(s) modifié(s) par rapport à l’origine</span>
        {saveLabel && <span className={`ap-save ${save}`}>{saveLabel}</span>}
      </p>
      {msg && <p className="ap-msg" role="alert">{msg}</p>}

      {versions && (
        <div className="panel ap-versions">
          <h2 className="panel-title">Historique des publications</h2>
          {versions.length === 0 ? <p className="meta">Aucune publication pour l’instant.</p> : (
            <ul>
              {versions.map((v, i) => (
                <li key={v.id}><span>{fmtDate(v.createdAt)}{v.by ? ` · ${v.by}` : ''} · {v.changed} réglage(s){i === 0 ? ' · version en ligne' : ''}</span>
                  <button type="button" className="btn ghost ap-mini" onClick={() => restore(v)}>Recopier dans le brouillon</button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="ap-layout">
        <div className="ap-editor">
          <label className="ap-search"><span className="sr-only">Chercher un réglage</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un réglage (ex. bouton, fond, arrondi)…" />
          </label>

          {issues.length > 0 && (
            <div className="ap-issues" role="note">
              <b>Lisibilité : {issues.length} association(s) à vérifier</b>
              <ul>{issues.map((i) => <li key={`${i.fg}-${i.bg}-${i.label}`}><button type="button" className="link u" onClick={() => goTo(i.fg)}>{i.label}</button> — contraste {String(i.ratio).replace('.', ',')}:1 (minimum conseillé {String(i.min).replace('.', ',')}:1)</li>)}</ul>
            </div>
          )}

          {GROUPS.map((g) => {
            const list = TOKENS.filter((t) => t.group === g.id && (!needle || t.label.toLowerCase().includes(needle) || g.label.toLowerCase().includes(needle)));
            if (!list.length) return null;
            const isOpen = Boolean(needle) || open.has(g.id);
            const n = list.filter((t) => values[t.id] !== undefined).length;
            return (
              <section key={g.id} className="ap-group">
                <h2><button type="button" aria-expanded={isOpen} onClick={() => toggle(g.id)}>
                  <span>{g.label}</span>{n > 0 && <span className="ap-tag">{n} modifié(s)</span>}<span className="ap-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button></h2>
                {isOpen && (
                  <div className="ap-group-body">
                    {g.hint && <p className="meta small">{g.hint}</p>}
                    {list.map((t) => <TokenRow key={t.id} t={t} values={values} fonts={fonts} onSet={setOne} onReset={resetOne} error={errors[t.id]} flagged={flagged.has(t.id)} />)}
                    {g.id === 'type' && <FontsPanel fonts={fonts} reload={loadFonts} />}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <Preview css={css} />
      </div>
    </section>
  );
}
