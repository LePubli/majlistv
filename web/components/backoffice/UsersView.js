'use client';
// Admin → Utilisateurs, thème Premium : composition de la maquette (ADMIN_USERS) — titre, 4 chiffres, liste avec outils de
// recherche + panneau « Détail du membre » à droite. La logique (chargement, filtres, lots, fiche complète) reste celle de
// web/app/admin/page.js : ce composant ne fait qu'afficher et appeler les fonctions reçues.
import { Page, Metrics, Panel, Badge, Table, Userpic, Drawer, Meta, Btn, I, c } from './Kit';

const ROLE = { user: 'Membre', organizer: 'Organisateur', moderator: 'Modérateur', admin: 'Administrateur' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

export default function UsersView({ counts, data, filters, q, setQ, role, setRole, status, setStatus, sort, setSort, page, setPage, pages, sel, toggleOne, toggleAll, allShown, bulkRole, setBulkRole, applyRole, clearSel, bulkMsg, onCreate, onOpen, subLabel, peek, setPeek }) {
  const users = data.users;
  const chosen = users.find((u) => u.id === peek) || users[0] || null;
  const rows = users.map((u, i) => [
    <input key="c" type="checkbox" checked={sel.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Cocher ${u.name}`} />,
    <button key="u" type="button" className={c('table-user')} onClick={() => setPeek(u.id)}><Userpic name={u.name} i={i} /><span><b>{u.name}</b><small>{u.email}</small></span></button>,
    <Badge key="r" tone={u.role === 'user' ? 'gray' : u.role === 'admin' ? 'violet' : 'blue'}>{ROLE[u.role] || u.role}</Badge>,
    <Badge key="s" tone={u.disabledAt ? 'red' : 'green'}>{u.disabledAt ? 'Suspendu' : 'Actif'}</Badge>,
    subLabel(u),
    fmt(u.createdAt),
    <button key="m" type="button" className={c('icon-button')} aria-label={`Ouvrir la fiche de ${u.name}`} onClick={() => onOpen(u.id)}>···</button>,
  ]);
  return (
    <Page title="Gestion des utilisateurs" sub="Membres, familles, organisateurs et abonnements"
      actions={<Btn onClick={onCreate}><I name="plus" size={15} /> Inviter un utilisateur</Btn>}>
      {counts && (
        <Metrics items={[
          { icon: 'users', tone: 'green', label: 'Utilisateurs', value: counts.all },
          { icon: 'check', tone: 'green', label: 'Abonnés actifs', value: counts.paying },
          { icon: 'plus', tone: 'blue', label: 'En période d’essai', value: counts.trialing },
          { icon: 'alert', tone: counts.suspended ? 'amber' : 'blue', label: 'Comptes suspendus', value: counts.suspended, note: counts.suspended ? 'Attention' : '' },
        ]} />
      )}
      {bulkMsg && <p className={bulkMsg.ok ? '' : 'error'} role="status" style={{ color: bulkMsg.ok ? 'var(--green)' : undefined }}>{bulkMsg.text}</p>}
      <div className={c('split inspector-split')}>
        <Panel title="Tous les utilisateurs">
          <div className={c('inline-tools')}>
            <label className={c('search-field')}><I name="search" size={16} />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Rechercher un nom, un e-mail…" aria-label="Rechercher un membre" />
            </label>
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }} aria-label="Type de compte">
              <option value="">Tous les rôles</option>
              {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={status || 'all'} onChange={(e) => { setStatus(e.target.value === 'all' ? '' : e.target.value); setPage(0); }} aria-label="Statut">
              {filters.map(([k, label]) => <option key={k} value={k}>{label}{counts ? ` (${counts[k]})` : ''}</option>)}
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Tri">
              <option value="recent">Plus récents</option><option value="oldest">Plus anciens</option><option value="name">Nom (A → Z)</option><option value="activity">Dernière lecture</option>
            </select>
          </div>
          {sel.size > 0 && (
            <div className={c('drawer-box')} role="region" aria-label="Changement de rôle en lot" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <b>{sel.size} sélectionné(s)</b>
              <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} aria-label="Nouveau rôle">
                {['user', 'organizer', 'moderator'].map((k) => <option key={k} value={k}>{ROLE[k]}</option>)}
              </select>
              <Btn onClick={applyRole}>Appliquer le rôle</Btn>
              <Btn primary={false} onClick={clearSel}>Tout désélectionner</Btn>
              <small>Les administrateurs et votre propre compte sont ignorés.</small>
            </div>
          )}
          <Table headers={[<input key="a" type="checkbox" checked={allShown} onChange={toggleAll} aria-label="Tout cocher" />, 'Utilisateur', 'Rôle', 'Statut', 'Abonnement', 'Inscription', '']} rows={rows} empty="Aucun résultat." />
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', paddingTop: 10 }}>
              <Btn primary={false} disabled={page === 0} onClick={() => setPage(page - 1)}>←</Btn>
              <span>{page + 1} / {pages}</span>
              <Btn primary={false} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>→</Btn>
            </div>
          )}
        </Panel>
        {chosen && (
          <Drawer title="Détail du membre" onClose={() => setPeek(null)}
            footer={<Btn onClick={() => onOpen(chosen.id)}>Ouvrir la fiche complète</Btn>}>
            <div className={c('person-head')}>
              <Userpic name={chosen.name} i={users.indexOf(chosen)} />
              <h3>{chosen.name}</h3><small>{chosen.email}</small>
              <Badge tone={chosen.disabledAt ? 'red' : 'green'}>{chosen.disabledAt ? 'Suspendu' : 'Actif'}</Badge>
            </div>
            <Meta items={[['Rôle', ROLE[chosen.role] || chosen.role], ['Abonnement', subLabel(chosen)], ['Membre depuis', fmt(chosen.createdAt)], ['Dernière lecture', fmt(chosen.lastWatchAt)]]} />
            <div className={c('drawer-box')}><h4>Activité</h4><p>{chosen.talksCount ? `${chosen.talksCount} contenu(s) publié(s)` : 'Aucun contenu publié'}</p></div>
          </Drawer>
        )}
      </div>
    </Page>
  );
}
