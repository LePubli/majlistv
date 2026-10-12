'use client';
// Back-office : tableau de bord, gestion des utilisateurs, paramètres (clés d'API, Stripe, moteurs IA…).
// Tout passe par l'API (/admin/*) ; les clés secrètes ne sont jamais renvoyées par le serveur (seulement ••••xxxx).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';

const ROLE_LABEL = { user: 'Utilisateur', organizer: 'Organisateur', admin: 'Administrateur' };
const SUB_LABEL = { trialing: 'Essai', active: 'Abonné', past_due: 'Paiement en retard', canceled: 'Résilié', incomplete: 'Incomplet', unpaid: 'Impayé' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const LANG_NAMES = { fr: 'Français', en: 'Anglais', ar: 'Arabe', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', tr: 'Turc', ur: 'Ourdou', id: 'Indonésien', ru: 'Russe', nl: 'Néerlandais', zh: 'Chinois', ja: 'Japonais', ko: 'Coréen', hi: 'Hindi', fa: 'Persan', bn: 'Bengali', ms: 'Malais', sw: 'Swahili' };

/* ---------------------------------------------------------------- Tableau de bord */
const money = (c, cur) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (cur || 'eur').toUpperCase() }).format(c / 100);
const HEALTH_ICON = { ok: '●', warn: '▲', error: '✕', off: '○' };

function Kpi({ value, label, hint, href }) {
  const body = (<><strong>{value}</strong><span>{label}</span>{hint && <small className="meta">{hint}</small>}</>);
  return href ? <Link className="admin-card kpi" href={href}>{body}</Link> : <div className="admin-card kpi">{body}</div>;
}

function Dashboard() {
  const { call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('/admin/dashboard').then((r) => (r.ok ? (setD(r.data), setErr(false)) : setErr(true))), [call]);
  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // rafraîchi toutes les 30 s tant que l'onglet est ouvert
    return () => clearInterval(id);
  }, [load]);
  const reindex = async () => {
    if (!window.confirm("Vider l'index de recherche et le reconstruire ? (quelques minutes, la recherche simple prend le relais pendant ce temps)")) return;
    setBusy(true);
    await call('/admin/search/reindex', { method: 'POST' });
    setBusy(false);
    setTimeout(load, 4000);
  };
  if (err && !d) return <p className="error">Impossible de charger le tableau de bord.</p>;
  if (!d) return <p className="meta">Chargement…</p>;
  const { users, talks, subscribers: sb, todo, health, signups, failedTalks } = d;
  const searchOn = health.find((h) => h.key === 'search')?.state !== 'off';
  return (
    <section className="dash">
      <h3 className="dash-h">Abonnés</h3>
      <div className="admin-cards">
        <Kpi value={sb.paying} label="abonnés payants" hint={sb.pastDue ? `dont ${sb.pastDue} en retard de paiement` : null} href="/admin?tab=users" />
        <Kpi value={sb.trialing} label="en période d'essai" />
        <Kpi value={sb.mrr ? money(sb.mrr.amount, sb.mrr.currency) : '—'} label="revenu mensuel estimé" hint={sb.mrr ? 'abonnements payants, annuels ramenés au mois (hors essais)' : 'Stripe non configuré'} />
        <Kpi value={sb.cancelling} label="résiliations programmées" hint="actifs qui s'arrêtent à la fin de la période" />
        <Kpi value={users.total} label="comptes" hint={`+${users.week} cette semaine · +${users.month} ce mois`} href="/admin?tab=users" />
        <Kpi value={users.complimentary} label="accès offerts en cours" hint={users.suspended ? `${users.suspended} compte(s) suspendu(s)` : null} />
      </div>

      <h3 className="dash-h">Conférences</h3>
      <div className="admin-cards">
        <Kpi value={talks.live} label="en ligne" href="/studio?filter=live" />
        <Kpi value={talks.processing} label="en traitement" href="/studio?filter=run" />
        <Kpi value={talks.failed} label="en échec" href="/studio?filter=err" />
        <Kpi value={talks.draft + talks.scheduled} label="brouillons / planifiées" hint={talks.scheduled ? `dont ${talks.scheduled} planifiée(s)` : null} href="/studio?filter=draft" />
      </div>

      <div className="dash-cols">
        <div>
          <h3 className="dash-h">À traiter</h3>
          {todo.length === 0 ? <p className="dash-ok">✓ Rien à signaler, tout fonctionne.</p> : (
            <ul className="dash-todo">
              {todo.map((t) => (
                <li key={t.key} className={`sev-${t.severity}`}>
                  <Link href={t.link}><b>{t.count}</b> {t.label}</Link>
                </li>
              ))}
            </ul>
          )}
          {failedTalks.length > 0 && (
            <ul className="dash-list">
              {failedTalks.map((t) => (
                <li key={t.id}><Link href={`/studio/${t.id}`}>{t.title}</Link><small className="meta">{t.videoStatus === 'failed' ? 'conversion en échec' : 'transcription en échec'} · {fmt(t.createdAt)}</small></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="dash-h">État des services</h3>
          <ul className="dash-health">
            {health.map((h) => (
              <li key={h.key} className={`hs-${h.state}`}>
                <span className="hs-dot" aria-hidden="true">{HEALTH_ICON[h.state]}</span>
                <span className="hs-name">{h.label}</span>
                <small className="meta">{h.message}</small>
              </li>
            ))}
          </ul>
          {searchOn && <button className="btn ghost" disabled={busy} onClick={reindex}>Réindexer la recherche</button>}
        </div>
      </div>

      <h3 className="dash-h">Dernières inscriptions</h3>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Abonnement</th><th>Inscrit le</th></tr></thead>
          <tbody>
            {signups.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.disabledAt && <em className="adm-src"> (suspendu)</em>}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role] || u.role}</td>
                <td>{u.subscription ? SUB_LABEL[u.subscription] || u.subscription : '—'}</td>
                <td>{fmt(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">Le tableau se met à jour tout seul toutes les 30 secondes. Les clés et moteurs se règlent dans l'onglet Paramètres, sans redéploiement.</p>
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
const ROLE_HELP = {
  user: 'Regarde les conférences, garde ses favoris et sa progression. Les conférences premium demandent un abonnement ou un accès offert.',
  organizer: "Comme un utilisateur, et accède au Studio : ajoute, modifie et publie ses propres conférences. Ne voit pas le back-office.",
  admin: 'Accès total : back-office (utilisateurs, paramètres, catégories, pages légales) et toutes les conférences du Studio.',
};
const FILTERS = [['all', 'Tous'], ['paying', 'Abonnés'], ['trialing', 'Essais'], ['offered', 'Accès offerts'], ['none', 'Sans abonnement'], ['suspended', 'Suspendus']];
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); };
const fmtDT = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Création : petite fenêtre (le mot de passe provisoire est affiché une seule fois).
function NewUser({ onClose, onDone }) {
  const { call } = useApp();
  const [f, setF] = useState({ name: '', email: '', role: 'user', locale: 'fr', password: '' });
  const [err, setErr] = useState('');
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('/admin/users', { method: 'POST', body: JSON.stringify({ name: f.name, email: f.email, role: f.role, locale: f.locale, ...(f.password ? { password: f.password } : {}) }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || 'Erreur'); return; }
    if (r.data.temporaryPassword) setSecret(r.data); else onDone(r.data.user);
  };
  if (secret) {
    return (
      <div className="adm-modal"><div className="adm-dialog">
        <h3>Compte créé</h3>
        <p>Mot de passe provisoire (affiché une seule fois) : transmets-le à l'utilisateur.</p>
        <p><code className="adm-secret">{secret.temporaryPassword}</code></p>
        <div className="adm-row"><button className="btn ghost" onClick={() => navigator.clipboard?.writeText(secret.temporaryPassword)}>Copier</button><button className="btn" onClick={() => onDone(secret.user)}>Ouvrir la fiche</button></div>
      </div></div>
    );
  }
  return (
    <div className="adm-modal"><div className="adm-dialog">
      <h3>Nouvel utilisateur</h3>
      <form onSubmit={save} className="adm-form">
        <label>Nom<input required value={f.name} onChange={set('name')} maxLength={100} /></label>
        <label>E-mail<input required type="email" value={f.email} onChange={set('email')} /></label>
        <label>Rôle<select value={f.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <p className="meta">{ROLE_HELP[f.role]}</p>
        <label>Langue<select value={f.locale} onChange={set('locale')}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select></label>
        <label>Mot de passe (vide = généré automatiquement)<input type="text" minLength={8} maxLength={72} value={f.password} onChange={set('password')} autoComplete="off" /></label>
        {err && <p className="error">{err}</p>}
        <div className="adm-row"><button className="btn" disabled={busy}>Créer</button><button type="button" className="btn ghost" onClick={onClose}>Fermer</button></div>
      </form>
    </div></div>
  );
}

// Fiche latérale d'un utilisateur : tout se règle ici, chaque bloc s'enregistre seul.
function UserSheet({ id, me, onClose, onChanged }) {
  const { call } = useApp();
  const [d, setD] = useState(null);
  const [id_, setId_] = useState({ name: '', email: '', locale: 'fr' });
  const [until, setUntil] = useState('');
  const [msg, setMsg] = useState(null);       // { ok, text }
  const [secret, setSecret] = useState(null);
  const [del, setDel] = useState(null);
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await call(`/admin/users/${id}`);
    if (!r.ok) { setMsg({ ok: false, text: r.data.error || 'Introuvable' }); return; }
    setD(r.data);
    const u = r.data.user;
    setId_({ name: u.name, email: u.email, locale: u.locale || 'fr' });
    setUntil(u.premiumUntil ? u.premiumUntil.slice(0, 10) : '');
  }, [call, id]);
  useEffect(() => { setD(null); setMsg(null); setSecret(null); setDel(null); load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = async (body, okText) => {
    setBusy(true); setMsg(null);
    const r = await call(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data.error || 'Erreur' }); return false; }
    setMsg({ ok: true, text: okText || 'Enregistré' });
    await load(); onChanged();
    return true;
  };
  const toEnd = (day) => new Date(day + 'T23:59:59').toISOString();
  const setRole = (role) => {
    if (role === d.user.role) return;
    if (role === 'admin' && !window.confirm('Donner un accès administrateur complet à ce compte ?')) return;
    patch({ role }, 'Rôle modifié');
  };
  const resetLink = async () => {
    if (!window.confirm(`Envoyer un lien de réinitialisation à ${d.user.email} ?`)) return;
    setBusy(true);
    const r = await call(`/admin/users/${id}/reset-link`, { method: 'POST' });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: `Lien envoyé à ${r.data.email} (valable 1 h)` } : { ok: false, text: r.data.error || 'Erreur' });
    if (r.ok) load();
  };
  const tempPwd = async () => {
    if (!window.confirm('Générer un mot de passe provisoire ? Les sessions ouvertes de ce compte seront fermées.')) return;
    const r = await call(`/admin/users/${id}/password`, { method: 'POST', body: JSON.stringify({}) });
    if (r.ok) setSecret(r.data.temporaryPassword); else setMsg({ ok: false, text: r.data.error || 'Erreur' });
  };
  const remove = async (to) => {
    if (!to && !window.confirm(`Supprimer définitivement ${d.user.email} ? Ses favoris et sa progression seront effacés.`)) return;
    setBusy(true); setMsg(null);
    const r = await call(`/admin/users/${id}${to ? `?transferTo=${to}` : ''}`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok) { onChanged(); onClose(); return; }
    if (r.status === 409 && r.data.code === 'has_talks') {
      const [c, a] = await Promise.all([call('/admin/users?role=organizer&limit=100'), call('/admin/users?role=admin&limit=100')]);
      const list = [...(c.data.users || []), ...(a.data.users || [])].filter((u) => u.id !== id && !u.disabledAt);
      setDel({ ...r.data, candidates: list }); setTransferTo(list[0]?.id || '');
    } else setMsg({ ok: false, text: r.data.error || 'Erreur' });
  };

  const u = d?.user;
  const self = u && u.id === me;
  const offered = u?.premiumUntil && new Date(u.premiumUntil) > new Date();
  const dirty = u && (id_.name !== u.name || id_.email !== u.email || id_.locale !== (u.locale || 'fr'));
  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-label="Fiche utilisateur">
        <header className="sheet-head">
          <div>
            <h3>{u ? u.name : '…'}</h3>
            {u && <small className="meta">{u.email} · inscrit le {fmt(u.createdAt)}</small>}
          </div>
          <button className="link" onClick={onClose} aria-label="Fermer">✕</button>
        </header>
        {!u ? <p className="meta">{msg ? msg.text : 'Chargement…'}</p> : (
          <div className="sheet-body">
            {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
            {u.disabledAt && <p className="sheet-warn">Compte suspendu depuis le {fmt(u.disabledAt)} : connexion impossible.</p>}

            <section className="sheet-sec">
              <h4>Identité</h4>
              <form className="adm-form" onSubmit={(e) => { e.preventDefault(); patch(id_, 'Identité enregistrée'); }}>
                <label>Nom<input required value={id_.name} maxLength={100} onChange={(e) => setId_({ ...id_, name: e.target.value })} /></label>
                <label>E-mail<input required type="email" value={id_.email} onChange={(e) => setId_({ ...id_, email: e.target.value })} /></label>
                <label>Langue<select value={id_.locale} onChange={(e) => setId_({ ...id_, locale: e.target.value })}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select></label>
                <div><button className="btn" disabled={busy || !dirty}>Enregistrer</button></div>
              </form>
            </section>

            <section className="sheet-sec">
              <h4>Rôle</h4>
              <div className="role-cards">
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <button key={k} type="button" disabled={busy || (self && k !== 'admin')} aria-pressed={u.role === k} className={u.role === k ? 'role-card on' : 'role-card'} onClick={() => setRole(k)}>
                    <strong>{v}</strong><small>{ROLE_HELP[k]}</small>
                  </button>
                ))}
              </div>
              {self && <p className="meta">Tu ne peux pas modifier ton propre rôle.</p>}
            </section>

            <section className="sheet-sec">
              <h4>Abonnement et accès</h4>
              {d.subscriptions.length === 0 ? <p className="meta">Aucun abonnement Stripe.</p> : (
                <ul className="sheet-list">
                  {d.subscriptions.map((s) => (
                    <li key={s.id}>
                      <b>{SUB_LABEL[s.status] || s.status}</b> {s.interval === 'year' ? 'annuel' : s.interval === 'month' ? 'mensuel' : ''}
                      <small className="meta">
                        {s.trialEnd && s.status === 'trialing' ? ` · essai jusqu'au ${fmt(s.trialEnd)}` : ''}
                        {s.currentPeriodEnd ? ` · période jusqu'au ${fmt(s.currentPeriodEnd)}` : ''}
                        {s.cancelAtPeriodEnd ? ' · résiliation programmée' : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              <p className="meta">Les paiements, remboursements et résiliations se gèrent dans Stripe{u.stripeCustomerId ? ' (client lié)' : ''}.</p>
              <div className="gift">
                <b>Accès premium offert</b>
                <p className="meta">{offered ? `Actif jusqu'au ${fmt(u.premiumUntil)}.` : 'Aucun accès offert en cours.'} Donne l'accès aux conférences premium sans abonnement.</p>
                <div className="adm-row">
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => patch({ premiumUntil: addDays(30) }, 'Accès offert : 1 mois')}>+1 mois</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => patch({ premiumUntil: addDays(90) }, 'Accès offert : 3 mois')}>+3 mois</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => patch({ premiumUntil: addDays(365) }, 'Accès offert : 1 an')}>+1 an</button>
                  {u.premiumUntil && <button type="button" className="link" disabled={busy} onClick={() => patch({ premiumUntil: null }, 'Accès offert retiré')}>Retirer</button>}
                </div>
                <div className="adm-row">
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Date de fin de l'accès offert" />
                  <button type="button" className="btn ghost" disabled={busy || !until} onClick={() => patch({ premiumUntil: toEnd(until) }, 'Date enregistrée')}>Fixer la date</button>
                </div>
              </div>
            </section>

            <section className="sheet-sec">
              <h4>Activité</h4>
              <div className="sheet-stats">
                <div><strong>{d.stats.favorites}</strong><small>favoris</small></div>
                <div><strong>{d.stats.watched}</strong><small>conférences commencées</small></div>
                <div><strong>{d.stats.completed}</strong><small>terminées</small></div>
              </div>
              <p className="meta">Dernière lecture : {fmtDT(d.stats.lastWatchAt)}</p>
              {d.emails.length > 0 && <p className="meta">Derniers e-mails : {d.emails.map((m) => `${m.kind} (${m.status})`).join(', ')}</p>}
              {d.talks.length > 0 && (
                <>
                  <p className="meta">Conférences de ce compte ({u.talksCount}) :</p>
                  <ul className="sheet-list">{d.talks.map((t) => <li key={t.id}><Link href={`/studio/${t.id}`}>{t.title}</Link><small className="meta">{t.publication === 'published' ? 'publiée' : t.publication === 'scheduled' ? 'planifiée' : 'brouillon'}</small></li>)}</ul>
                </>
              )}
            </section>

            <section className="sheet-sec">
              <h4>Sécurité</h4>
              <div className="adm-row">
                <button type="button" className="btn ghost" disabled={busy || Boolean(u.disabledAt)} onClick={resetLink}>Envoyer un lien de réinitialisation</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={tempPwd}>Mot de passe provisoire</button>
              </div>
              {secret && (
                <p><code className="adm-secret">{secret}</code> <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(secret)}>Copier</button><br /><small className="meta">Affiché une seule fois. Les sessions ouvertes de ce compte ont été fermées.</small></p>
              )}
              {!self && (
                <div className="adm-row">
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => (u.disabledAt || window.confirm(`Suspendre ${u.email} ? La connexion sera immédiatement refusée.`)) && patch({ disabled: !u.disabledAt }, u.disabledAt ? 'Compte réactivé' : 'Compte suspendu')}>{u.disabledAt ? 'Réactiver le compte' : 'Suspendre le compte'}</button>
                </div>
              )}
            </section>

            {!self && (
              <section className="sheet-sec adm-danger">
                <h4>Zone dangereuse</h4>
                {!del && <button type="button" className="btn danger" disabled={busy} onClick={() => remove()}>Supprimer l'utilisateur</button>}
                {del && (
                  <div>
                    <p className="error">{del.error}</p>
                    {del.candidates.length ? (
                      <div className="adm-row">
                        <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>{del.candidates.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.email})</option>)}</select>
                        <button type="button" className="btn danger" disabled={busy || !transferTo} onClick={() => remove(transferTo)}>Transférer puis supprimer</button>
                      </div>
                    ) : <p className="meta">Aucun organisateur ou admin disponible pour reprendre les conférences : crée-en un d'abord.</p>}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Users({ me }) {
  const { call } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, users: [] });
  const [counts, setCounts] = useState(null);
  const [creating, setCreating] = useState(false);
  const open = sp.get('user');            // fiche ouverte (dans l'adresse : on peut la partager / recharger)
  const LIMIT = 25;
  const openSheet = (uid) => router.replace(uid ? `/admin?tab=users&user=${uid}` : '/admin?tab=users', { scroll: false });

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT), sort });
    if (q) p.set('q', q);
    if (role) p.set('role', role);
    if (status && status !== 'all') p.set('status', status);
    const [r, c] = await Promise.all([call('/admin/users?' + p), call('/admin/users-counts')]);
    if (r.ok) setData(r.data);
    if (c.ok) setCounts(c.data);
  }, [call, q, role, status, sort, page]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);

  const pages = Math.max(1, Math.ceil(data.total / LIMIT));
  const subLabel = (u) => (u.premiumUntil && new Date(u.premiumUntil) > new Date() ? `Offert → ${fmt(u.premiumUntil)}` : (SUB_LABEL[u.subscriptionStatus] || '—'));
  return (
    <section>
      <div className="adm-row adm-between">
        <div className="pills" role="group" aria-label="Filtrer par statut">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" className={(status || 'all') === k ? 'pill on' : 'pill'} aria-pressed={(status || 'all') === k} onClick={() => { setStatus(k === 'all' ? '' : k); setPage(0); }}>
              {label}{counts ? ` (${counts[k]})` : ''}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setCreating(true)}>+ Ajouter</button>
      </div>
      <div className="adm-row users-bar">
        <input type="search" placeholder="Rechercher (nom, e-mail)…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }} aria-label="Rôle">
          <option value="">Tous les rôles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Tri">
          <option value="recent">Plus récents</option><option value="oldest">Plus anciens</option><option value="name">Nom (A → Z)</option><option value="activity">Dernière lecture</option>
        </select>
      </div>
      <p className="meta">{data.total} utilisateur(s) — clique sur une ligne pour ouvrir la fiche.</p>
      <div className="adm-table-wrap">
        <table className="adm-table users-table">
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Abonnement</th><th>Conf.</th><th>Dernière lecture</th><th>Inscrit</th></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className={`${u.disabledAt ? 'adm-off ' : ''}row-click${open === u.id ? ' sel' : ''}`} tabIndex={0} onClick={() => openSheet(u.id)} onKeyDown={(e) => e.key === 'Enter' && openSheet(u.id)}>
                <td>{u.name}{u.disabledAt && <span className="chip failed"> suspendu</span>}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{subLabel(u)}</td>
                <td>{u.talksCount}</td>
                <td>{fmt(u.lastWatchAt)}</td>
                <td>{fmt(u.createdAt)}</td>
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
      {creating && <NewUser onClose={() => setCreating(false)} onDone={(user) => { setCreating(false); load(); openSheet(user.id); }} />}
      {open && <UserSheet id={open} me={me} onClose={() => openSheet(null)} onChanged={load} />}
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

/* ---------------------------------------------------------------- Catégories */
function Categories() {
  const { call } = useApp();
  const [cats, setCats] = useState(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => call('/categories/stats').then((r) => r.ok && setCats(r.data)), [call]);
  useEffect(() => { load(); }, [load]);

  const done = (ok, text) => setMsg({ ok, text });
  const add = async (e) => {
    e.preventDefault();
    const r = await call('/categories', { method: 'POST', body: JSON.stringify({ name }) });
    if (r.ok) { setName(''); done(true, `Catégorie « ${r.data.name} » ajoutée.`); load(); } else done(false, r.data?.error || 'Erreur');
  };
  const rename = async (e) => {
    e.preventDefault();
    const r = await call(`/categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editing.name }) });
    if (r.ok) { setEditing(null); done(true, 'Catégorie renommée.'); load(); } else done(false, r.data?.error || 'Erreur');
  };
  const remove = async (c) => {
    const warn = c.count > 0
      ? `Supprimer « ${c.name} » ? Ses ${c.count} conférence(s) resteront en ligne, mais sans catégorie.`
      : `Supprimer la catégorie « ${c.name} » ?`;
    if (!window.confirm(warn)) return;
    const r = await call(`/categories/${c.id}`, { method: 'DELETE' });
    if (r.ok) { done(true, `Catégorie « ${c.name} » supprimée.`); load(); } else done(false, r.data?.error || 'Erreur');
  };

  return (
    <section className="panel">
      <p className="meta">Les catégories classent les conférences dans le catalogue, la recherche et le Studio. Supprimer une catégorie ne supprime jamais de conférence.</p>
      <form className="cat-add" onSubmit={add}>
        <input required maxLength={60} placeholder="Nouvelle catégorie (ex. Jurisprudence)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom de la nouvelle catégorie" />
        <button className="btn">+ Ajouter</button>
      </form>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      {cats === null && <p className="meta">…</p>}
      {cats && cats.length === 0 && <p className="meta">Aucune catégorie pour l'instant.</p>}
      {cats && cats.length > 0 && (
        <ul className="cat-list">
          {cats.map((c) => (
            <li key={c.id}>
              {editing?.id === c.id ? (
                <form className="cat-edit" onSubmit={rename}>
                  <input autoFocus required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nouveau nom" />
                  <button className="btn">Enregistrer</button>
                  <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Annuler</button>
                </form>
              ) : (
                <>
                  <span className="cat-name"><b>{c.name}</b><small className="meta">{c.count} conférence{c.count > 1 ? 's' : ''}</small></span>
                  <span className="cat-actions">
                    <button type="button" className="link u" onClick={() => { setMsg(null); setEditing({ id: c.id, name: c.name }); }}>Renommer</button>
                    <button type="button" className="link u danger-link" onClick={() => remove(c)}>Supprimer</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
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
  const titles = { dashboard: 'Tableau de bord', users: 'Utilisateurs', settings: 'Paramètres', legal: 'Pages légales', categories: 'Catégories' };
  return (
    <main className="admin studio-page">
      <h1 className="studio-title">{titles[tab] || titles.dashboard}</h1>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <Users me={user.id} />}
      {tab === 'settings' && <Settings />}
      {tab === 'legal' && <LegalPages />}
      {tab === 'categories' && <Categories />}
    </main>
  );
}
