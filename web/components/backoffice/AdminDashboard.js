'use client';
// Admin → Vue d'ensemble, thème Premium : composition identique à la maquette (ADMIN_DASH) avec les vraies données de
// GET /admin/dashboard. Rien n'est inventé : un chiffre inconnu n'est pas affiché ; il n'y a pas de courbe d'audience tant
// que l'API n'en fournit pas.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../Providers';
import { ago } from '../../lib/format';
import { Page, Metrics, Panel, Cols, Badge, Table, Userpic, I, Btn, c } from './Kit';

const ROLE = { user: 'Membre', organizer: 'Organisateur', moderator: 'Modérateur', admin: 'Administrateur' };
const SUB = { trialing: 'en essai', active: 'abonné', past_due: 'paiement en retard', canceled: 'résilié', incomplete: 'incomplet', unpaid: 'impayé' };
const HEALTH = { ok: ['Opérationnel', 'green'], warn: ['À vérifier', 'amber'], error: ['En erreur', 'red'], off: ['Désactivé', 'blue'] };
const LIGHT = { ok: 'green', warn: 'amber', error: 'red', off: 'amber' };
const nf = (n) => new Intl.NumberFormat('fr-FR').format(n);
const money = (cents, cur) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (cur || 'eur').toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);

export default function AdminDashboard() {
  const { call, locale } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('/admin/dashboard').then((r) => (r.ok ? (setD(r.data), setErr(false)) : setErr(true))), [call]);
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  if (err && !d) return <Page title="Vue d’ensemble"><p className="error">Impossible de charger le tableau de bord.</p></Page>;
  if (!d) return <Page title="Vue d’ensemble"><p style={{ color: 'var(--muted)' }}>Chargement…</p></Page>;
  const { users, talks, subscribers: sb, todo, health, signups, failedTalks } = d;
  const searchOn = health.find((h) => h.key === 'search')?.state !== 'off';
  const reindex = async () => {
    if (!window.confirm("Vider l'index de recherche et le reconstruire ? (quelques minutes, la recherche simple prend le relais pendant ce temps)")) return;
    setBusy(true);
    await call('/admin/search/reindex', { method: 'POST' });
    setBusy(false);
    setTimeout(load, 4000);
  };

  return (
    <Page title="Vue d’ensemble" sub="Pilotez la plateforme MejlissTV en temps réel"
      actions={<Btn href="/studio/new"><I name="plus" size={15} /> Ajouter un contenu</Btn>}>
      <Metrics items={[
        { icon: 'users', tone: 'green', label: 'Membres inscrits', value: nf(users.total), note: `+${users.week} cette semaine · +${users.month} ce mois` },
        { icon: 'check', tone: 'green', label: 'Abonnés payants', value: nf(sb.paying), note: sb.trialing ? `${sb.trialing} en essai` : '' },
        { icon: 'wallet', tone: 'green', label: 'Revenu mensuel estimé', value: sb.mrr ? money(sb.mrr.amount, sb.mrr.currency) : null, note: 'hors essais' },
        { icon: 'video', tone: 'blue', label: 'Contenus publiés', value: nf(talks.live), note: talks.processing ? `${talks.processing} en traitement` : '' },
      ]} />

      <Panel title="◉ Activité récente" extra={<Link href="/admin?tab=audit" className={c('linkish')}>Voir l’audit →</Link>}>
        {signups.length === 0 ? <p style={{ color: 'var(--muted)' }}>Aucune inscription pour le moment.</p> : (
          <div className={c('activities')}>
            {signups.slice(0, 5).map((u, i) => (
              <div key={u.id} className={c('activity-row')}>
                <Userpic name={u.name} i={i} />
                <div><b>{u.name}</b><small>{u.disabledAt ? 'Compte suspendu' : `${ROLE[u.role] || u.role}${u.subscription ? ` · ${SUB[u.subscription] || u.subscription}` : ''}`}</small></div>
                <time>{ago(u.createdAt, locale)}</time>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Cols kind="three-bottom">
        <Panel title="▣ Contenus et actions à traiter">
          {todo.length === 0 ? <p style={{ color: 'var(--green)' }}>✓ Rien à signaler, tout fonctionne.</p> : (
            <Table headers={['Action', 'Nombre', 'Priorité', '']} rows={todo.map((t) => [
              t.label, <strong key="n">{t.count}</strong>,
              <Badge key="b" tone={t.severity === 'error' ? 'red' : 'amber'}>{t.severity === 'error' ? 'Urgent' : 'À traiter'}</Badge>,
              <Link key="l" href={t.link} className={c('icon-button')} aria-label="Ouvrir">›</Link>,
            ])} />
          )}
          {failedTalks.length > 0 && (
            <div className={c('activities')} style={{ marginTop: 10 }}>
              {failedTalks.map((t) => (
                <Link key={t.id} href={`/studio/${t.id}`} className={c('activity-row')}>
                  <span className={c('square-icon')}><I name="video" size={16} /></span>
                  <div><b>{t.title}</b><small>{t.videoStatus === 'failed' ? 'conversion en échec' : 'transcription en échec'}</small></div>
                  <time>{ago(t.createdAt, locale)}</time>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="⌁ Santé de la plateforme">
          <div className={c('health-list')} title="Mise à jour toutes les 30 secondes">
            {health.map((h) => {
              const [label, tone] = HEALTH[h.state] || HEALTH.warn;
              return (
                <div key={h.key} title={h.message}><span className={c(`health-light ${LIGHT[h.state] || 'amber'}`)} />{h.label}<Badge tone={tone}>{label}</Badge></div>
              );
            })}
          </div>
          {searchOn && <div style={{ marginTop: 12 }}><Btn primary={false} disabled={busy} onClick={reindex}>Réindexer la recherche</Btn></div>}
        </Panel>

        <Panel title="ϟ Actions rapides">
          <div className={c('quicklinks')}>
            {[['/studio/new', 'Ajouter un contenu'], ['/admin?tab=categories', 'Créer une catégorie'], ['/admin?tab=speakers', 'Intervenants'], ['/admin?tab=users', 'Gérer les membres']].map(([href, label]) => (
              <Link key={href} href={href} className={c('quicklink')}><I name="plus" size={15} /> {label} <span>›</span></Link>
            ))}
          </div>
        </Panel>
      </Cols>
    </Page>
  );
}
