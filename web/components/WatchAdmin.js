'use client';
// Admin → Veille (étape 23b) : suivre des chaînes / comptes YouTube, Dailymotion, Vimeo ; les nouvelles vidéos arrivent ici,
// l'administrateur choisit « Ajouter » (avec l'attestation des droits) ou « Ignorer ». Aucune notification hors de l'admin.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { langName } from './Transcript';
import { Page, Metrics, Panel, Tabs, Btn, Badge, Table, I, c } from './backoffice/Kit';

const PLATFORMS = { youtube: 'YouTube', dailymotion: 'Dailymotion', vimeo: 'Vimeo' };
const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const pageUrl = (platform, id) => (platform === 'youtube' ? `https://www.youtube.com/watch?v=${id}` : platform === 'dailymotion' ? `https://www.dailymotion.com/video/${id}` : `https://vimeo.com/${id}`);
const dur = (s) => (s ? (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(s / 60))} min`) : '');
const when = (d, locale) => (d ? new Date(d).toLocaleString(locale === 'ar' ? 'ar' : locale, { dateStyle: 'short', timeStyle: 'short' }) : '—');
const EMPTY = { language: 'fr', categoryId: '', access: 'free', speaker: '', translateTo: [], rightsConfirmed: false };

function AddForm({ item, cats, onDone, onCancel }) {
  const { t, call, locale } = useApp();
  const [o, setO] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggleLang = (c) => setO({ ...o, translateTo: o.translateTo.includes(c) ? o.translateTo.filter((x) => x !== c) : [...o.translateTo, c] });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const body = { ...o, categoryId: o.categoryId ? Number(o.categoryId) : null, translateTo: o.rightsConfirmed ? o.translateTo : [] };
    const r = await call(`/admin/watch/items/${item.id}/add`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onDone(r.data); else setErr(r.data?.error || t('errGeneric'));
  };
  return (
    <form className="form watch-add" onSubmit={submit}>
      <div className="form-grid">
        <label>{t('speaker')}<input value={o.speaker} maxLength={200} onChange={(e) => setO({ ...o, speaker: e.target.value })} /></label>
        <label>{t('category')}
          <select value={o.categoryId} onChange={(e) => setO({ ...o, categoryId: e.target.value })}>
            <option value="">—</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.fullName || c.name}</option>)}
          </select>
        </label>
        <label>{t('access')}
          <select value={o.access} onChange={(e) => setO({ ...o, access: e.target.value })}>
            <option value="free">{t('free')}</option>
            <option value="premium">{t('premium')}</option>
          </select>
        </label>
        <label>Langue de la vidéo
          <select value={o.language} onChange={(e) => setO({ ...o, language: e.target.value, translateTo: o.translateTo.filter((x) => x !== e.target.value) })}>
            {['fr', 'ar', 'en', 'es', 'de', 'it', 'pt', 'nl', 'tr', 'ru', 'ur', 'id'].map((c) => <option key={c} value={c}>{langName(c, locale)}</option>)}
          </select>
        </label>
      </div>
      <label className="check rights"><input type="checkbox" checked={o.rightsConfirmed} onChange={(e) => setO({ ...o, rightsConfirmed: e.target.checked })} /> {t('rightsConfirm')}</label>
      {o.rightsConfirmed && (
        <fieldset className="langs">
          <legend>{t('translateTo')}</legend>
          {TR_LANGS.filter((c) => c !== o.language.split('-')[0]).map((c) => (
            <label key={c} className="check"><input type="checkbox" checked={o.translateTo.includes(c)} onChange={() => toggleLang(c)} /> {langName(c, locale)}</label>
          ))}
        </fieldset>
      )}
      {!o.rightsConfirmed && <p className="meta">Sans l'accord de l'auteur, la vidéo est ajoutée mais n'est ni transcrite ni traduite.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="studio-tools">
        <button className="btn" disabled={busy}>Ajouter au catalogue</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

export default function WatchAdmin() {
  const { call, locale, skin } = useApp();
  const [data, setData] = useState(null);
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('new');
  const [sourceId, setSourceId] = useState('');
  const [cats, setCats] = useState([]);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [open, setOpen] = useState(null); // vidéo dont le formulaire « Ajouter » est ouvert
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sourceTab, setSourceTab] = useState(false);   // thème Premium : onglet « Sources suivies »

  const loadSources = useCallback(() => call('/admin/watch').then((r) => r.ok && setData(r.data)), [call]);
  const loadItems = useCallback(() => call(`/admin/watch/items?status=${status}${sourceId ? `&sourceId=${sourceId}` : ''}`).then((r) => r.ok && setItems(r.data)), [call, status, sourceId]);
  const refresh = useCallback(() => { loadSources(); loadItems(); }, [loadSources, loadItems]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  // Le contrôle tourne sur le serveur : on actualise la page toutes les minutes.
  useEffect(() => { const id = setInterval(refresh, 60000); return () => clearInterval(id); }, [refresh]);

  const flash = (ok, text) => setMsg({ ok, text });
  const add = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await call('/admin/watch', { method: 'POST', body: JSON.stringify({ url, label }) });
    setBusy(false);
    if (r.ok) { setUrl(''); setLabel(''); flash(true, 'Source ajoutée. La première lecture sert de référence : seules les vidéos publiées ensuite seront signalées.'); loadSources(); }
    else flash(false, r.data?.error || 'Ajout impossible.');
  };
  const act = async (path, opts, okText) => {
    const r = await call(path, opts);
    if (r.ok) { if (okText) flash(true, okText); refresh(); } else flash(false, r.data?.error || 'Action impossible.');
    return r;
  };
  const ignore = (ids) => act('/admin/watch/items/ignore', { method: 'POST', body: JSON.stringify({ ids }) });
  const remove = (s) => { if (window.confirm(`Ne plus suivre « ${s.label || s.url} » ? Sa liste de nouveautés sera supprimée (les vidéos déjà ajoutées restent).`)) act(`/admin/watch/${s.id}`, { method: 'DELETE' }, 'Source supprimée.'); };

  const sources = data?.sources || [];
  // Thème Premium : composition de la maquette (ADMIN_WATCH) — onglets, grille de cartes « à examiner ».
  if (skin === 'premium') {
    const tabId = sourceTab ? 'sources' : status === 'new' ? 'review' : status === 'added' ? 'added' : 'ignored';
    const pick = (k) => { setOpen(null); if (k === 'sources') { setSourceTab(true); return; } setSourceTab(false); setStatus(k === 'review' ? 'new' : k); };
    const newTotal = sources.reduce((a, x) => a + (x.newCount || 0), 0);
    return (
      <Page title="Veille & acquisition de contenus" sub="Repérez des contenus pertinents et vérifiez les droits avant toute intégration."
        actions={<Btn onClick={() => pick('sources')}><I name="plus" size={15} /> Ajouter une source</Btn>}>
        <Tabs names={[['review', `À examiner${newTotal ? ` (${newTotal})` : ''}`], ['sources', 'Sources suivies'], ['added', 'Contenus intégrés'], ['ignored', 'Historique']]} value={tabId} onChange={pick} />
        {msg && <p className={msg.ok ? '' : 'error'} role="status" style={{ color: msg.ok ? 'var(--green)' : undefined }}>{msg.text}</p>}
        {tabId === 'sources' ? (
          <>
            <Panel title="Suivre une source">
              <form className={c('form')} style={{ padding: '4px 14px 14px' }} onSubmit={add}>
                <label>Adresse<input type="url" required value={url} placeholder="youtube.com/@chaine · dailymotion.com/compte · vimeo.com/compte" onChange={(e) => setUrl(e.target.value)} /></label>
                <label>Nom (facultatif)<input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} /></label>
                <Btn type="submit" disabled={busy || !url.trim()}>Suivre</Btn>
                <p style={{ color: 'var(--muted)' }}>Toutes les {data?.intervalHours ?? 6} h, le serveur relit chaque source ; les nouvelles vidéos arrivent dans « À examiner ».</p>
              </form>
            </Panel>
            <Panel title="Sources suivies">
              <Table headers={['Source', 'Dernier contrôle', 'État', 'Nouvelles', '']} empty="Aucune source suivie pour l'instant."
                rows={sources.map((x) => [
                  <span key="s"><b>{x.label || x.url}</b><br /><small>{PLATFORMS[x.platform] || x.platform} · {x.url}</small></span>,
                  when(x.lastCheckAt, locale),
                  !x.active ? <Badge key="e" tone="gray">En pause</Badge> : x.lastError ? <Badge key="e" tone="red">Erreur</Badge> : x.baselined ? <Badge key="e" tone="green">{`OK · ${x.lastCount} lues`}</Badge> : <Badge key="e" tone="amber">1re lecture à venir</Badge>,
                  x.newCount > 0 ? <button key="n" type="button" className={c('linkish')} style={{ background: 'none', border: 0 }} onClick={() => { setSourceId(x.id); pick('review'); }}><b>{x.newCount}</b></button> : 0,
                  <span key="a" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    <Btn primary={false} onClick={() => act(`/admin/watch/${x.id}/check`, { method: 'POST' }, 'Contrôle demandé : le serveur le fait dans la minute.')}>Vérifier</Btn>
                    <Btn primary={false} onClick={() => act(`/admin/watch/${x.id}`, { method: 'PATCH', body: JSON.stringify({ active: !x.active }) })}>{x.active ? 'Pause' : 'Reprendre'}</Btn>
                    <Btn primary={false} onClick={() => remove(x)}>Supprimer</Btn>
                  </span>,
                ])} />
            </Panel>
          </>
        ) : (
          <>
            <div className={c('inline-tools')} style={{ marginBottom: 14 }}>
              {sources.length > 1 && (
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="Source">
                  <option value="">Toutes les sources</option>
                  {sources.map((x) => <option key={x.id} value={x.id}>{x.label || x.url}</option>)}
                </select>
              )}
              {status === 'new' && items && items.length > 1 && <Btn primary={false} onClick={() => ignore(items.map((i) => i.id))}>Tout ignorer ({items.length})</Btn>}
            </div>
            {items && items.length === 0 && <p style={{ color: 'var(--muted)' }}>{status === 'new' ? 'Rien de nouveau à examiner.' : 'Aucune vidéo.'}</p>}
            <div className={c('poster-grid watch-grid')}>
              {(items || []).map((i) => (
                <article key={i.id} className={c('watch-card')}>
                  {i.thumb ? <img src={i.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
                  <div>
                    <h3>{i.title || i.videoId}</h3>
                    <p>{PLATFORMS[i.platform] || i.platform} · {i.sourceLabel}{i.duration ? ` · ${dur(i.duration)}` : ''}</p>
                    <small>Trouvée le {when(i.foundAt, locale)}</small>
                    <div className={c('btn-row')}>
                      <Btn primary={false} href={pageUrl(i.platform, i.videoId)} target="_blank" rel="noopener noreferrer">Voir</Btn>
                      {status !== 'added' && <Btn onClick={() => setOpen(open === i.id ? null : i.id)}>Examiner</Btn>}
                      {status === 'new' && <Btn primary={false} onClick={() => ignore([i.id])}>Ignorer</Btn>}
                      {status === 'ignored' && <Btn primary={false} onClick={() => act(`/admin/watch/items/${i.id}/restore`, { method: 'POST' })}>Remettre à examiner</Btn>}
                      {status === 'added' && i.talkId && <Btn primary={false} href={`/talks/${i.talkId}`}>Ouvrir la vidéo</Btn>}
                    </div>
                    {open === i.id && <div className={c('form')} style={{ marginTop: 12 }}><AddForm item={i} cats={cats} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); flash(true, 'Vidéo ajoutée au catalogue.'); refresh(); }} /></div>}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Page>
    );
  }

  return (
    <section className="watch-admin">
      <p className="meta">Suivez des chaînes, comptes, playlists ou albums YouTube, Dailymotion et Vimeo. Toutes les {data?.intervalHours ?? 6} h, le serveur relit chaque source ; les nouvelles vidéos s'affichent ci-dessous, visibles de vous seul. Rien n'est ajouté au catalogue sans votre action. L'intervalle se règle dans Admin → Paramètres → « Vidéos YouTube, Vimeo et Dailymotion ».</p>

      <form className="form watch-new" onSubmit={add}>
        <h2>Suivre une source</h2>
        <div className="form-grid">
          <label>Adresse<input type="url" required value={url} placeholder="youtube.com/@chaine · dailymotion.com/compte · vimeo.com/compte" onChange={(e) => setUrl(e.target.value)} /></label>
          <label>Nom (facultatif)<input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} /></label>
        </div>
        <button className="btn" disabled={busy || !url.trim()}>Suivre</button>
      </form>
      {msg && <p className={msg.ok ? 'meta ok' : 'error'} role="status">{msg.text}</p>}

      <h2>Sources suivies</h2>
      {data && sources.length === 0 && <p className="meta">Aucune source suivie pour l'instant.</p>}
      {sources.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th>Source</th><th>Dernier contrôle</th><th>État</th><th>Nouvelles</th><th /></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.label || s.url}</b><br /><small className="meta">{PLATFORMS[s.platform] || s.platform} · {s.url}</small></td>
                  <td>{when(s.lastCheckAt, locale)}{s.checkRequested && <><br /><small className="meta">contrôle demandé…</small></>}</td>
                  <td>
                    {!s.active && <span className="meta">En pause</span>}
                    {s.active && s.lastError && <span className="error" title={s.lastError}>Erreur : {s.lastError.slice(0, 140)}</span>}
                    {s.active && !s.lastError && s.baselined && <span className="meta">OK · {s.lastCount} vidéo(s) lues</span>}
                    {s.active && !s.lastError && !s.baselined && <span className="meta">Première lecture à venir</span>}
                  </td>
                  <td>{s.newCount > 0 ? <button type="button" className="link" onClick={() => { setStatus('new'); setSourceId(s.id); }}><b>{s.newCount}</b></button> : 0}</td>
                  <td className="studio-actions">
                    <button type="button" className="btn ghost" onClick={() => act(`/admin/watch/${s.id}/check`, { method: 'POST' }, 'Contrôle demandé : le serveur le fait dans la minute.')}>Vérifier maintenant</button>{' '}
                    <button type="button" className="btn ghost" onClick={() => act(`/admin/watch/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: !s.active }) })}>{s.active ? 'Pause' : 'Reprendre'}</button>{' '}
                    <button type="button" className="btn ghost" onClick={() => remove(s)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Vidéos</h2>
      <div className="studio-tools">
        <label className="fld"><span>Afficher</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOpen(null); }}>
            <option value="new">À traiter</option><option value="ignored">Ignorées</option><option value="added">Ajoutées</option>
          </select>
        </label>
        <label className="fld"><span>Source</span>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Toutes</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label || s.url}</option>)}
          </select>
        </label>
        {status === 'new' && items && items.length > 1 && <button type="button" className="btn ghost" onClick={() => ignore(items.map((i) => i.id))}>Tout ignorer ({items.length})</button>}
      </div>
      {items && items.length === 0 && <p className="meta">{status === 'new' ? 'Rien de nouveau à traiter.' : 'Aucune vidéo.'}</p>}
      <ul className="watch-list">
        {(items || []).map((i) => (
          <li key={i.id} className="watch-item card">
            <div className="watch-row">
              {i.thumb && <img className="watch-thumb" src={i.thumb} alt="" width="160" height="90" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              <div className="watch-info">
                <b>{i.title || i.videoId}</b>
                <small className="meta">{PLATFORMS[i.platform] || i.platform} · {i.sourceLabel}{i.duration ? ` · ${dur(i.duration)}` : ''} · trouvée le {when(i.foundAt, locale)}</small>
                <div className="studio-tools">
                  <a className="btn ghost" href={pageUrl(i.platform, i.videoId)} target="_blank" rel="noopener noreferrer">Voir</a>
                  {status !== 'added' && <button type="button" className="btn" onClick={() => setOpen(open === i.id ? null : i.id)}>Ajouter…</button>}
                  {status === 'new' && <button type="button" className="btn ghost" onClick={() => ignore([i.id])}>Ignorer</button>}
                  {status === 'ignored' && <button type="button" className="btn ghost" onClick={() => act(`/admin/watch/items/${i.id}/restore`, { method: 'POST' })}>Remettre à traiter</button>}
                  {status === 'added' && i.talkId && <a className="btn ghost" href={`/talks/${i.talkId}`}>Ouvrir la vidéo</a>}
                </div>
              </div>
            </div>
            {open === i.id && <AddForm item={i} cats={cats} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); flash(true, 'Vidéo ajoutée au catalogue.'); refresh(); }} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
