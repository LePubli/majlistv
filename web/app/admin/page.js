'use client';
// Back-office : tableau de bord, gestion des utilisateurs, paramètres (clés d'API, Stripe, moteurs IA…).
// Tout passe par l'API (/admin/*) ; les clés secrètes ne sont jamais renvoyées par le serveur (seulement ••••xxxx).
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';

const ROLE_LABEL = { user: 'Utilisateur', organizer: 'Organisateur', admin: 'Administrateur' };
const SUB_LABEL = { trialing: 'Essai', active: 'Abonné', past_due: 'Paiement en retard', canceled: 'Résilié', incomplete: 'Incomplet', unpaid: 'Impayé' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const LANG_NAMES = { fr: 'Français', en: 'Anglais', ar: 'Arabe', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', tr: 'Turc', ur: 'Ourdou', id: 'Indonésien', ru: 'Russe', nl: 'Néerlandais', zh: 'Chinois', ja: 'Japonais', ko: 'Coréen', hi: 'Hindi', fa: 'Persan', bn: 'Bengali', ms: 'Malais', sw: 'Swahili' };

/* ---------------------------------------------------------------- Tableau de bord */
function Dashboard() {
  const { call } = useApp();
  const [st, setSt] = useState(null);
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(false);
  const reload = () => call('/admin/status').then((r) => r.ok && setSt(r.data));
  const reindex = async () => {
    if (!window.confirm("Vider l'index de recherche et le reconstruire ? (quelques minutes, la recherche simple prend le relais pendant ce temps)")) return;
    setBusy(true);
    await call('/admin/search/reindex', { method: 'POST' });
    setBusy(false);
    setTimeout(reload, 4000);
  };
  useEffect(() => {
    call('/admin/status').then((r) => r.ok && setSt(r.data));
    call('/admin/users?limit=1').then((r) => r.ok && setUsers(r.data.total));
  }, [call]);
  const line = (m) => (m && Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${v} ${k}`).join(' · ') : 'aucun');
  return (
    <section>
      {!st ? <p className="meta">Chargement…</p> : (
        <div className="admin-cards">
          <div className="admin-card"><strong>{users ?? '…'}</strong><span>utilisateurs</span></div>
          <div className="admin-card"><strong>{line(st.subscriptions)}</strong><span>abonnements</span></div>
          <div className="admin-card"><strong>{line(st.transcripts)}</strong><span>transcriptions</span></div>
          <div className="admin-card"><strong>{line(st.translations)}</strong><span>traductions de sous-titres</span></div>
          <div className="admin-card"><strong>{st.insightsEnabled ? line(st.insights) : 'désactivés'}</strong><span>résumés et chapitres</span></div>
          <div className="admin-card"><strong>{line(st.emails)}</strong><span>e-mails (30 derniers jours)</span>{st.emails?.failed > 0 && <span className="error">Échecs : vérifier Paramètres → E-mails</span>}</div>
          <div className="admin-card">
            <strong>{st.search.enabled ? `${st.search.indexed} / ${st.search.ready} indexées` : 'recherche simple'}</strong>
            <span>recherche {st.search.enabled ? 'Meilisearch' : '(Meilisearch non configuré)'}</span>
            {st.search.lastError && <span className="error">{st.search.lastError}</span>}
            {st.search.enabled && <button className="btn ghost" disabled={busy} onClick={reindex}>Réindexer tout</button>}
          </div>
        </div>
      )}
      <p className="meta">Les statuts « failed » se relancent depuis la page de la conférence (bouton « Relancer »). Les clés et moteurs se règlent dans l'onglet Paramètres, sans redéploiement.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- Paramètres */
function Field({ f, value, onChange, onClear, langs, dirty, onTest, testing }) {
  const label = <label className="adm-label">{f.label}{f.source === 'env' && <em className="adm-src"> (variable d'environnement)</em>}{f.source === 'db' && <em className="adm-src"> (enregistré)</em>}</label>;
  let input;
  if (f.type === 'secret') {
    input = (
      <div className="adm-row">
        <input type="password" autoComplete="new-password" value={value ?? ''} placeholder={f.isSet ? `défini ${f.hint} — saisir pour remplacer` : 'non renseigné'} onChange={(e) => onChange(e.target.value)} />
        {f.isSet && value !== null && <button type="button" className="link" onClick={onClear}>Effacer</button>}
      </div>
    );
  } else if (f.type === 'select') {
    input = <select value={value ?? f.value} onChange={(e) => onChange(e.target.value)}>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  } else if (f.type === 'bool') {
    input = <select value={value ?? f.value} onChange={(e) => onChange(e.target.value)}><option value="true">Oui</option><option value="false">Non</option></select>;
  } else if (f.type === 'number') {
    input = <input type="number" min={f.min ?? undefined} max={f.max ?? undefined} value={value ?? f.value} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === 'langs') {
    const cur = new Set((value ?? f.value).split(',').filter(Boolean));
    input = (
      <div className="langs adm-langs">
        {langs.map((l) => (
          <label key={l} className="check"><input type="checkbox" checked={cur.has(l)} onChange={(e) => { e.target.checked ? cur.add(l) : cur.delete(l); onChange([...cur].join(',')); }} /> {LANG_NAMES[l] || l} <small>({l})</small></label>
        ))}
      </div>
    );
  } else {
    input = <input type={f.type === 'url' ? 'url' : 'text'} value={value ?? f.value} onChange={(e) => onChange(e.target.value)} placeholder={f.default || ''} />;
  }
  return (
    <div className="adm-field">
      {label}
      {input}
      {f.help && <p className="meta adm-help">{f.help}</p>}
      {f.test && (
        <div className="adm-row">
          <button type="button" className="btn ghost" disabled={testing || dirty} onClick={() => onTest(f.test)}>{testing ? 'Test…' : 'Tester la connexion'}</button>
          {dirty && <small className="meta">Enregistre d'abord pour tester.</small>}
        </div>
      )}
    </div>
  );
}

function Settings() {
  const { call } = useApp();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState({});
  const [open, setOpen] = useState('general');

  useEffect(() => { call('/admin/settings').then((r) => r.ok && setData(r.data)); }, [call]);
  if (!data) return <p className="meta">Chargement…</p>;

  const dirty = Object.keys(draft).length > 0;
  const setVal = (k, v) => { setMsg(null); setDraft((d) => ({ ...d, [k]: v })); };
  const secretVal = (k) => (k in draft ? (draft[k] === null ? '' : draft[k]) : '');

  const save = async (confirmStripeReset = false) => {
    setBusy(true); setMsg(null);
    const r = await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ values: draft, ...(confirmStripeReset ? { confirmStripeReset: true } : {}) }) });
    setBusy(false);
    if (r.ok) { setData(r.data); setDraft({}); setMsg({ ok: true, text: 'Enregistré. Les services prennent les nouveaux réglages en moins de 10 secondes, sans redéploiement.' }); return; }
    if (r.status === 409 && r.data.code === 'stripe_reset') {
      if (window.confirm(r.data.error)) save(true);
      return;
    }
    setMsg({ ok: false, text: r.data.error || 'Échec de l\'enregistrement' });
  };

  const test = async (target) => {
    setTests((t) => ({ ...t, [target]: { loading: true } }));
    const r = await call('/admin/settings/test', { method: 'POST', body: JSON.stringify({ target }) });
    setTests((t) => ({ ...t, [target]: r.ok ? r.data : { ok: false, message: r.data.error || 'Erreur' } }));
  };

  const fieldsOf = (g) => data.fields.filter((f) => f.group === g);
  return (
    <section>
      {!data.encryption && <p className="error">SETTINGS_KEY n'est pas définie sur l'API : les clés ne peuvent pas être enregistrées. Ajoute cette variable (voir README) puis redéploie l'API.</p>}
      <p className="meta">Une valeur laissée vide revient à la variable d'environnement, puis à la valeur par défaut. Les clés ne sont jamais réaffichées en entier.</p>
      {data.groups.map((g) => (
        <div key={g.id} className="adm-group">
          <button type="button" className="adm-group-head" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}>
            <span>{g.label}</span><span>{open === g.id ? '−' : '+'}</span>
          </button>
          {open === g.id && (
            <div className="adm-group-body">
              {fieldsOf(g.id).map((f) => (
                <div key={f.key}>
                  <Field f={f} langs={data.langs} dirty={dirty}
                    value={f.type === 'secret' ? secretVal(f.key) : draft[f.key]}
                    onChange={(v) => setVal(f.key, v)}
                    onClear={() => setVal(f.key, null)}
                    onTest={test} testing={Boolean(f.test && tests[f.test]?.loading)} />
                  {f.test && tests[f.test] && !tests[f.test].loading && <p className={tests[f.test].ok ? 'adm-ok' : 'error'}>{tests[f.test].message}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="adm-savebar">
        <button className="btn" disabled={!dirty || busy} onClick={() => save()}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        {dirty && <button className="btn ghost" onClick={() => { setDraft({}); setMsg(null); }}>Annuler les modifications</button>}
        {msg && <span className={msg.ok ? 'adm-ok' : 'error'}>{msg.text}</span>}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Utilisateurs */
function UserForm({ initial, onClose, onSaved, me }) {
  const { call } = useApp();
  const isNew = !initial;
  const [f, setF] = useState(initial ? {
    name: initial.name, email: initial.email, role: initial.role, locale: initial.locale || 'fr',
    premiumUntil: initial.premiumUntil ? initial.premiumUntil.slice(0, 10) : '', password: '',
  } : { name: '', email: '', role: 'user', locale: 'fr', premiumUntil: '', password: '' });
  const [err, setErr] = useState('');
  const [secret, setSecret] = useState(null); // mot de passe provisoire, affiché une seule fois
  const [del, setDel] = useState(null);       // { code, error, candidates }
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);
  const self = initial && initial.id === me;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    let r;
    if (isNew) {
      r = await call('/admin/users', { method: 'POST', body: JSON.stringify({ name: f.name, email: f.email, role: f.role, locale: f.locale, ...(f.password ? { password: f.password } : {}) }) });
    } else {
      r = await call(`/admin/users/${initial.id}`, { method: 'PATCH', body: JSON.stringify({
        name: f.name, email: f.email, role: f.role, locale: f.locale,
        premiumUntil: f.premiumUntil ? new Date(f.premiumUntil + 'T23:59:59').toISOString() : null }) });
    }
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || 'Erreur'); return; }
    if (isNew && r.data.temporaryPassword) { setSecret(r.data.temporaryPassword); onSaved(false); } else onSaved(true);
  };
  const toggleDisabled = async () => {
    setBusy(true); setErr('');
    const r = await call(`/admin/users/${initial.id}`, { method: 'PATCH', body: JSON.stringify({ disabled: !initial.disabledAt }) });
    setBusy(false);
    if (!r.ok) setErr(r.data.error || 'Erreur'); else onSaved(true);
  };
  const resetPwd = async () => {
    if (!window.confirm('Générer un nouveau mot de passe provisoire pour ce compte ?')) return;
    const r = await call(`/admin/users/${initial.id}/password`, { method: 'POST', body: JSON.stringify({}) });
    if (r.ok) setSecret(r.data.temporaryPassword); else setErr(r.data.error || 'Erreur');
  };
  const remove = async (to) => {
    if (!to && !window.confirm(`Supprimer définitivement ${initial.email} ?`)) return;
    setBusy(true); setErr('');
    const r = await call(`/admin/users/${initial.id}${to ? `?transferTo=${to}` : ''}`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok) { onSaved(true); return; }
    if (r.status === 409 && r.data.code === 'has_talks') {
      const c = await call('/admin/users?role=organizer&limit=100');
      const a = await call('/admin/users?role=admin&limit=100');
      const list = [...(c.data.users || []), ...(a.data.users || [])].filter((u) => u.id !== initial.id && !u.disabledAt);
      setDel({ ...r.data, candidates: list }); setTransferTo(list[0]?.id || '');
    } else setErr(r.data.error || 'Erreur');
  };

  if (secret) {
    return (
      <div className="adm-modal"><div className="adm-dialog">
        <h3>Mot de passe provisoire</h3>
        <p>Note-le maintenant : il ne sera plus affiché. Transmets-le à l'utilisateur, qui pourra le garder ou le faire changer.</p>
        <p><code className="adm-secret">{secret}</code></p>
        <div className="adm-row"><button className="btn ghost" onClick={() => navigator.clipboard?.writeText(secret)}>Copier</button><button className="btn" onClick={() => onSaved(true)}>Fermer</button></div>
      </div></div>
    );
  }
  return (
    <div className="adm-modal"><div className="adm-dialog">
      <h3>{isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}</h3>
      <form onSubmit={save} className="adm-form">
        <label>Nom<input required value={f.name} onChange={set('name')} maxLength={100} /></label>
        <label>Email<input required type="email" value={f.email} onChange={set('email')} /></label>
        <label>Rôle
          <select value={f.role} onChange={set('role')} disabled={self}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label>Langue
          <select value={f.locale} onChange={set('locale')}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select>
        </label>
        {isNew
          ? <label>Mot de passe (vide = généré automatiquement)<input type="text" minLength={8} maxLength={72} value={f.password} onChange={set('password')} autoComplete="off" /></label>
          : <label>Accès premium offert jusqu'au (vide = aucun)<input type="date" value={f.premiumUntil} onChange={set('premiumUntil')} /></label>}
        {err && <p className="error">{err}</p>}
        <div className="adm-row">
          <button className="btn" disabled={busy}>{isNew ? 'Créer' : 'Enregistrer'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </form>
      {!isNew && (
        <div className="adm-danger">
          <div className="adm-row">
            <button type="button" className="btn ghost" onClick={resetPwd}>Réinitialiser le mot de passe</button>
            {!self && <button type="button" className="btn ghost" disabled={busy} onClick={toggleDisabled}>{initial.disabledAt ? 'Réactiver le compte' : 'Suspendre le compte'}</button>}
          </div>
          {!self && !del && <button type="button" className="btn danger" disabled={busy} onClick={() => remove()}>Supprimer l'utilisateur</button>}
          {del && (
            <div>
              <p className="error">{del.error}</p>
              {del.candidates.length ? (
                <div className="adm-row">
                  <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>{del.candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select>
                  <button type="button" className="btn danger" disabled={busy || !transferTo} onClick={() => remove(transferTo)}>Transférer puis supprimer</button>
                </div>
              ) : <p className="meta">Aucun organisateur ou admin disponible pour reprendre les conférences : crée-en un d'abord.</p>}
            </div>
          )}
        </div>
      )}
    </div></div>
  );
}

function Users({ me }) {
  const { call } = useApp();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, users: [] });
  const [form, setForm] = useState(undefined); // undefined = fermé, null = création, objet = édition
  const LIMIT = 25;

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
    if (q) p.set('q', q);
    if (role) p.set('role', role);
    const r = await call('/admin/users?' + p);
    if (r.ok) setData(r.data);
  }, [call, q, role, page]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);

  const pages = Math.max(1, Math.ceil(data.total / LIMIT));
  return (
    <section>
      <div className="adm-row adm-between">
        <p className="meta">{data.total} utilisateur(s)</p>
        <button className="btn" onClick={() => setForm(null)}>+ Ajouter</button>
      </div>
      <div className="adm-row">
        <input type="search" placeholder="Rechercher (nom, email)…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }}>
          <option value="">Tous les rôles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Abonnement</th><th>Conf.</th><th>Inscrit</th><th /></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className={u.disabledAt ? 'adm-off' : ''}>
                <td>{u.name}{u.disabledAt && <span className="chip failed"> suspendu</span>}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.premiumUntil && new Date(u.premiumUntil) > new Date() ? `Offert → ${fmt(u.premiumUntil)}` : (SUB_LABEL[u.subscriptionStatus] || '—')}</td>
                <td>{u.talksCount}</td>
                <td>{fmt(u.createdAt)}</td>
                <td><button className="link" onClick={() => setForm(u)}>Modifier</button></td>
              </tr>
            ))}
            {!data.users.length && <tr><td colSpan={7} className="meta">Aucun résultat.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="adm-row">
          <button className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
          <span>{page + 1} / {pages}</span>
          <button className="btn ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}
      {form !== undefined && <UserForm initial={form} me={me} onClose={() => setForm(undefined)} onSaved={(close) => { if (close) setForm(undefined); load(); }} />}
    </section>
  );
}

/* ---------------------------------------------------------------- Pages légales */
function LegalPages() {
  const { call } = useApp();
  const [list, setList] = useState([]);
  const [cur, setCur] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('/legal', {}, null).then((r) => r.ok && setList(r.data)); }, [call]);
  const open = async (slug) => {
    setMsg(null);
    const r = await call('/legal/' + slug, {}, null);
    if (r.ok) setCur(r.data);
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await call('/admin/legal/' + cur.slug, { method: 'PUT', body: JSON.stringify({ title: cur.title, body: cur.body }) });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Enregistré. La page publique est à jour.' } : { ok: false, text: r.data.error || 'Erreur' });
  };
  const todo = cur ? (cur.body.match(/\[[^\]]{2,80}\]/g) || []).length : 0;
  return (
    <section>
      <p className="meta">Modèles à compléter (passages entre crochets) puis à faire relire par un professionnel. Mise en forme : une ligne « ## Titre », une ligne « - élément » pour une liste, une ligne vide entre deux paragraphes.</p>
      <div className="adm-row">
        {list.map((p) => <button key={p.slug} className={cur?.slug === p.slug ? 'btn' : 'btn ghost'} onClick={() => open(p.slug)}>{p.title}</button>)}
      </div>
      {cur && (
        <div className="adm-form">
          <label>Titre<input value={cur.title} onChange={(e) => setCur({ ...cur, title: e.target.value })} maxLength={120} /></label>
          <label>Texte<textarea rows={22} value={cur.body} onChange={(e) => setCur({ ...cur, body: e.target.value })} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }} /></label>
          {todo > 0 && <p className="error">{todo} passage(s) entre crochets restent à compléter.</p>}
          <div className="adm-row">
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            <a className="btn ghost" href={'/legal/' + cur.slug} target="_blank" rel="noreferrer">Voir la page</a>
            {msg && <span className={msg.ok ? 'adm-ok' : 'error'}>{msg.text}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- Page */
export default function Admin() {
  const { user, ready } = useApp();
  const params = useSearchParams();
  const tab = params.get('tab') || 'dashboard';
  if (!ready || !user) return null;
  if (user.role !== 'admin') return <main className="studio-page"><p>Cette page est réservée aux administrateurs.</p></main>;
  // Les sections se choisissent dans le menu latéral (Administration).
  const titles = { dashboard: 'Tableau de bord', users: 'Utilisateurs', settings: 'Paramètres', legal: 'Pages légales' };
  return (
    <main className="admin studio-page">
      <h1 className="studio-title">{titles[tab] || titles.dashboard}</h1>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <Users me={user.id} />}
      {tab === 'settings' && <Settings />}
      {tab === 'legal' && <LegalPages />}
    </main>
  );
}
