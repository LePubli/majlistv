'use client';
// Étape I2 — Administration → Textes : tous les textes du site (français, anglais, arabe) modifiables sans toucher au code.
//
// Les textes d'origine viennent de lib/i18n.js ; l'API ne garde que ceux qui ont été changés (table site_texts).
// Les modifications s'accumulent dans la page (rien n'est publié) puis « Enregistrer » les envoie d'un coup ; le site
// les affiche au plus tard 10 secondes plus tard. « Rétablir » revient au texte d'origine.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';

const LANGS = [['fr', 'Français', 'ltr'], ['en', 'English', 'ltr'], ['ar', 'العربية', 'rtl']];
const PAGE_SIZE = 40;
const MAX_PER_REQUEST = 1000;

// Regroupement des clés par page / zone du site (d'après le début de la clé). Sert uniquement à filtrer la liste.
const GROUP_OF = {
  hb: 'Accueil membre (blocs)', kd: 'Espace Kids', kr: 'Espace Kids', kc: 'Espace Kids',
  bk: 'Ouvrages', pz: 'Mise en pratique', st: 'Statistiques et suivi', sr: 'Séries et parcours',
  qz: 'Quiz', qp: 'Quiz et progression', vt: 'Page d’accueil visiteur', hero: 'Page d’accueil visiteur',
  rm: 'Rappels', ct: 'Studio : conférences', nw: 'Studio : nouvelle conférence', thumb: 'Studio : miniatures', import: 'Studio : import',
  sc: 'Mon bilan', lg: 'Accueil membre', lr: 'Apprentissage', ch: 'Chaînes', nf: 'Chaînes', sp: 'Chaînes',
  ls: 'Mes listes', gf: 'Cartes cadeaux', rd: 'Cartes cadeaux', th: 'Thèmes', tl: 'Chronologie', rv: 'Revenus des chaînes',
  citz: 'Citations', cit: 'Citations', bdg: 'Badges', rev: 'Révision espacée', col: 'Collections', rp: 'Signalements',
  ev: 'Mon évolution', nt: 'Notes', tb: 'Mon compte', ac: 'Mon compte', my: 'Mon compte', prefs: 'Mon compte',
  step: 'Inscription et connexion', welcome: 'Inscription et connexion', login: 'Inscription et connexion', register: 'Inscription et connexion',
  forgot: 'Inscription et connexion', reset: 'Inscription et connexion', password: 'Inscription et connexion', email: 'Inscription et connexion',
  un: 'Désabonnement', lk: 'Contenu réservé aux abonnés', plan: 'Formules et paiement', tier: 'Formules et paiement',
  pricing: 'Formules et paiement', sub: 'Formules et paiement', billing: 'Formules et paiement', pay: 'Formules et paiement',
  premium: 'Formules et paiement', subscribe: 'Formules et paiement', monthly: 'Formules et paiement', yearly: 'Formules et paiement', trial: 'Formules et paiement',
  att: 'Attestations', err: 'Messages d’erreur', ms: 'Menus et navigation', hm: 'Menus et navigation', adm: 'Menus et navigation',
  legal: 'Pied de page et mentions', ft: 'Pied de page et mentions', tagline: 'Pied de page et mentions', rights: 'Pied de page et mentions',
};
const groupOf = (key) => GROUP_OF[(key.match(/^[a-z]+/) || [''])[0]] || 'Divers';

// Mots-clés sans accents ni majuscules, pour la recherche.
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const placeholders = (s) => [...new Set(String(s).match(/\{[^}]*\}/g) || [])];
const idOf = (key, lang) => `${key}|${lang}`;

export default function TextsAdmin() {
  const { call } = useApp();
  const [dict, setDict] = useState(null);           // textes d'origine { fr:{}, en:{}, ar:{} }
  const [saved, setSaved] = useState(null);         // textes modifiés enregistrés : Map id → valeur
  const [pending, setPending] = useState(() => new Map()); // modifications non enregistrées : id → texte, ou null = rétablir l'original
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [lang, setLang] = useState('');
  const [onlyMod, setOnlyMod] = useState(false);
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const importRef = useRef(null);

  // Les textes d'origine sont chargés à la demande (ils pèsent ~200 Ko) : seule cette page les télécharge.
  useEffect(() => { import('../lib/i18n').then((m) => setDict(m.DICT)); }, []);
  const load = useCallback(async () => {
    const r = await call('/admin/texts');
    if (!r.ok) { setMsg('Impossible de charger les textes modifiés.'); return; }
    setSaved(new Map(r.data.map((x) => [idOf(x.key, x.lang), x.value])));
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const keys = useMemo(() => (dict ? Object.keys(dict.fr) : []), [dict]);
  const original = useCallback((key, l) => dict?.[l]?.[key] ?? '', [dict]);
  // Texte affiché : modification en cours, sinon texte enregistré, sinon texte d'origine.
  const current = useCallback((key, l) => {
    const id = idOf(key, l);
    if (pending.has(id)) { const p = pending.get(id); return p === null ? original(key, l) : p; }
    return saved?.get(id) ?? original(key, l);
  }, [pending, saved, original]);
  const isModified = useCallback((key, l) => {
    const id = idOf(key, l);
    return pending.has(id) ? pending.get(id) !== null : Boolean(saved?.has(id));
  }, [pending, saved]);

  const groups = useMemo(() => {
    const n = {};
    for (const k of keys) { const g = groupOf(k); n[g] = (n[g] || 0) + 1; }
    return Object.entries(n).sort((a, b) => (a[0] === 'Divers') - (b[0] === 'Divers') || a[0].localeCompare(b[0], 'fr'));
  }, [keys]);

  const modifiedKeys = useMemo(() => {
    const s = new Set();
    for (const id of saved?.keys() || []) if (!(pending.has(id) && pending.get(id) === null)) s.add(id.split('|')[0]);
    for (const [id, v] of pending) if (v !== null) s.add(id.split('|')[0]);
    return s;
  }, [saved, pending]);

  const needle = norm(q.trim());
  const list = useMemo(() => {
    if (!dict) return [];
    return keys.filter((k) => {
      if (group && groupOf(k) !== group) return false;
      if (onlyMod && !modifiedKeys.has(k)) return false;
      if (!needle) return true;
      if (norm(k).includes(needle)) return true;
      return LANGS.some(([l]) => norm(current(k, l)).includes(needle) || norm(original(k, l)).includes(needle));
    });
  }, [dict, keys, group, onlyMod, needle, modifiedKeys, current, original]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const shown = list.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [q, group, onlyMod, lang]);

  // Erreur d'un texte en cours de modification (vide, ou variable {n} supprimée).
  const problem = useCallback((key, l, text) => {
    if (!text.trim()) return 'Un texte ne peut pas être vide : utilisez « Rétablir l’original ».';
    const missing = placeholders(original(key, l)).filter((p) => !text.includes(p));
    if (missing.length) return `Gardez ${missing.join(' ')} : le site y met une valeur (nombre, nom, date…).`;
    return '';
  }, [original]);
  const errors = useMemo(() => {
    const e = new Map();
    for (const [id, v] of pending) if (v !== null) { const [key, l] = id.split('|'); const p = problem(key, l, v); if (p) e.set(id, p); }
    return e;
  }, [pending, problem]);

  const edit = (key, l, text) => {
    const id = idOf(key, l);
    setPending((prev) => {
      const next = new Map(prev);
      const was = saved?.get(id);
      if (text === original(key, l)) { if (was !== undefined) next.set(id, null); else next.delete(id); }
      else if (text === was) next.delete(id);
      else next.set(id, text);
      return next;
    });
    setMsg('');
  };
  const restore = (key, l) => {
    const id = idOf(key, l);
    setPending((prev) => { const next = new Map(prev); if (saved?.has(id)) next.set(id, null); else next.delete(id); return next; });
  };

  const save = useCallback(async () => {
    if (!pending.size || busy) return;
    if (errors.size) { setMsg(`${errors.size} texte(s) à corriger avant d’enregistrer (voir les messages en rouge).`); return; }
    setBusy(true); setMsg('');
    const changes = [...pending].map(([id, value]) => { const [key, l] = id.split('|'); return { key, lang: l, value }; });
    let ok = true;
    for (let i = 0; i < changes.length && ok; i += MAX_PER_REQUEST) {
      const r = await call('/admin/texts', { method: 'PUT', body: JSON.stringify({ changes: changes.slice(i, i + MAX_PER_REQUEST) }) });
      if (!r.ok) { ok = false; setMsg(r.data?.error || 'Enregistrement impossible.'); }
    }
    if (ok) { setPending(new Map()); setMsg(`${changes.length} modification(s) enregistrée(s). Le site les affiche dans les 10 secondes.`); }
    await load();
    setBusy(false);
  }, [pending, busy, errors, call, load]);

  // Ctrl/Cmd + S enregistre ; une page quittée avec des modifications non enregistrées demande confirmation.
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    const onLeave = (e) => { if (pending.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave); };
  }, [save, pending]);

  const discard = () => { if (window.confirm('Abandonner les modifications non enregistrées ?')) { setPending(new Map()); setMsg(''); } };

  const exportJson = () => {
    const rows = [...(saved || [])].map(([id, value]) => { const [key, l] = id.split('|'); return { key, lang: l, value }; });
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `textes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  // Importer = remplir les modifications « en attente » : on relit, puis on enregistre si tout est bon.
  const importJson = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows)) throw new Error('Le fichier doit contenir une liste de textes.');
      const next = new Map(pending); let n = 0, skipped = 0;
      for (const r of rows) {
        if (!r || typeof r.key !== 'string' || !LANGS.some(([l]) => l === r.lang) || typeof r.value !== 'string' || !(r.key in (dict?.fr || {}))) { skipped++; continue; }
        const id = idOf(r.key, r.lang);
        if (r.value === original(r.key, r.lang)) { if (saved?.has(id)) next.set(id, null); else next.delete(id); } else next.set(id, r.value);
        n++;
      }
      setPending(next);
      setMsg(`${n} texte(s) lu(s) dans le fichier${skipped ? `, ${skipped} ignoré(s) (clé ou langue inconnue)` : ''}. Vérifiez puis cliquez sur « Enregistrer ».`);
    } catch (err) { setMsg('Fichier non valide : ' + (err.message || 'JSON illisible')); }
  };
  const resetAll = async () => {
    if (!window.confirm('Rétablir TOUS les textes d’origine (français, anglais et arabe) ? Toutes vos modifications de textes seront perdues.')) return;
    setBusy(true);
    const r = await call('/admin/texts', { method: 'DELETE' });
    setMsg(r.ok ? `${r.data.restored} texte(s) rétabli(s) à l’origine.` : (r.data?.error || 'Échec.'));
    setPending(new Map()); await load(); setBusy(false);
  };

  if (!dict || !saved) return <p className="meta" role="status">Chargement des textes…</p>;
  const shownLangs = LANGS.filter(([l]) => !lang || l === lang);
  const savedCount = [...saved.keys()].length;

  return (
    <section className="tt" lang="fr" dir="ltr">
      <p className="meta">Modifiez ici n’importe quel texte du site, dans les trois langues. Rien n’est publié tant que vous n’avez pas cliqué sur <b>Enregistrer</b>. Gardez les mots entre accolades, comme {'{n}'} : le site y met un nombre, un nom ou une date.</p>

      <div className="tt-bar">
        <label className="tt-search"><span className="sr-only">Chercher un texte</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un mot, une phrase ou une clé (ex. Regarder, lgHello)…" />
        </label>
        <label>Page ou zone
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Toutes ({keys.length})</option>
            {groups.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
          </select>
        </label>
        <label>Langue
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="">Les trois</option>
            {LANGS.map(([l, name]) => <option key={l} value={l}>{name}</option>)}
          </select>
        </label>
        <label className="tt-check"><input type="checkbox" checked={onlyMod} onChange={(e) => setOnlyMod(e.target.checked)} /> Seulement les textes modifiés</label>
        <details className="ap-more">
          <summary className="btn ghost">Plus</summary>
          <div className="ap-more-menu">
            <button type="button" onClick={exportJson}>Exporter mes modifications (JSON)</button>
            <button type="button" onClick={() => importRef.current?.click()}>Importer un fichier JSON…</button>
            <button type="button" className="danger" onClick={resetAll} disabled={busy || !savedCount}>Tout rétablir à l’origine</button>
          </div>
        </details>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
      </div>

      <p className="ap-status" role="status" aria-live="polite">
        <span>{list.length} texte(s) affiché(s) sur {keys.length}</span>
        <span>{savedCount} modification(s) enregistrée(s)</span>
      </p>
      {msg && <p className="ap-msg" role="alert">{msg}</p>}

      <div className="tt-list">
        {shown.length === 0 && <p className="meta">Aucun texte ne correspond à cette recherche.</p>}
        {shown.map((key) => (
          <article key={key} className="tt-card">
            <header><code>{key}</code><span className="ap-tag tt-group">{groupOf(key)}</span></header>
            <div className={`tt-fields n${shownLangs.length}`}>
              {shownLangs.map(([l, name, dir]) => {
                const id = idOf(key, l);
                const val = current(key, l);
                const mod = isModified(key, l);
                const err = errors.get(id);
                return (
                  <div key={l} className={`tt-field${mod ? ' mod' : ''}${err ? ' bad' : ''}`}>
                    <label htmlFor={`tt-${id}`}>{name}{mod && <span className="ap-tag">modifié{pending.has(id) ? ' (non enregistré)' : ''}</span>}</label>
                    <textarea id={`tt-${id}`} lang={l} dir={dir} rows={val.length > 90 || val.includes('\n') ? 3 : 2} value={val} maxLength={2000}
                      aria-invalid={Boolean(err)} onChange={(e) => edit(key, l, e.target.value)} />
                    {err && <p className="tt-err" role="alert">{err}</p>}
                    {mod && (
                      <p className="tt-orig meta small">
                        Original : <bdi lang={l} dir={dir}>{original(key, l)}</bdi>{' '}
                        <button type="button" className="link u" onClick={() => restore(key, l)}>Rétablir l’original</button>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {pages > 1 && (
        <nav className="tt-pager" aria-label="Pages de textes">
          <button type="button" className="btn ghost" disabled={safePage === 0} onClick={() => { setPage(safePage - 1); window.scrollTo({ top: 0 }); }}>← Précédent</button>
          <span>Page {safePage + 1} / {pages}</span>
          <button type="button" className="btn ghost" disabled={safePage >= pages - 1} onClick={() => { setPage(safePage + 1); window.scrollTo({ top: 0 }); }}>Suivant →</button>
        </nav>
      )}

      {pending.size > 0 && (
        <div className="tt-save" role="region" aria-label="Enregistrer les modifications">
          <span>{pending.size} modification(s) non enregistrée(s){errors.size ? ` — ${errors.size} à corriger` : ''}</span>
          <span className="tt-save-btns">
            <button type="button" className="btn ghost" onClick={discard} disabled={busy}>Annuler</button>
            <button type="button" className="btn" onClick={save} disabled={busy || errors.size > 0}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </span>
        </div>
      )}
    </section>
  );
}
