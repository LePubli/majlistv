'use client';
// Studio → Paramètres → Stockage et archivage (maquette « Studio v2 », écran 6) — module « storage », étape S2.
// Espace de Garage, fournisseur d'archivage (PlanetHoster en SFTP par défaut, S3, WebDAV ou aucun), test de la connexion,
// fichier d'essai, règles automatiques, fichiers dans les archives et restauration. Administrateurs seulement.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { hasWebModule } from '../../lib/modules';
import { fmtBytes, ago, unitsFor } from '../../lib/format';

export { fmtBytes };

const tf = (s, vars = {}) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s || '');
const BUSY = ['queued', 'archiving', 'restore_queued', 'restoring'];
const PLAIN = ['provider', 'sftp_host', 'sftp_port', 'sftp_user', 's3_endpoint', 's3_region', 's3_bucket', 's3_access_key', 'webdav_url', 'webdav_user', 'folder',
  'work_audio_days', 'keep_original_days', 'alert_free_pct', 'garage_capacity_gb'];
const SECRETS = ['sftp_secret', 's3_secret_key', 'webdav_pass', 'encrypt_pass'];

// « 18,6 Go », « 38 Mo »…
const day = (iso, locale) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' }) : '');

function Field({ label, children, wide }) {
  return <label className={`fld${wide ? ' sg-wide' : ''}`}><span>{label}</span>{children}</label>;
}

// Champ secret : jamais pré-rempli ; « défini » si une valeur est enregistrée ; vide = inchangé.
function SecretField({ label, isSet, setHint, value, onChange, multiline, placeholder }) {
  const { t } = useApp();
  const ph = isSet ? setHint || t('sgSecretSet') : placeholder || '';
  return (
    <Field label={label} wide={multiline}>
      {multiline
        ? <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} autoComplete="off" spellCheck={false} className="sg-key" />
        : <input type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} autoComplete="new-password" />}
    </Field>
  );
}

function Kpi({ title, value, sub, pct, warn }) {
  return (
    <div className={`sd-card sg-kpi${warn ? ' warn' : ''}`}>
      <span className="meta">{title}</span>
      <strong className="sg-kpi-v">{value}</strong>
      {pct != null && <span className="sg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={title}><i style={{ width: `${Math.min(100, pct)}%` }} /></span>}
      <small className="meta">{sub}</small>
    </div>
  );
}

function Item({ it, onAct, busyId }) {
  const { t, locale } = useApp();
  const name = it.label || it.key;
  const meta = [fmtBytes(it.bytes, locale), it.status === 'archived' && it.archivedAt ? tf(t('sgArchivedOn'), { d: day(it.archivedAt, locale) }) : null,
    it.status === 'restored' && it.restoredAt ? tf(t('sgRestoredOn'), { d: day(it.restoredAt, locale) }) : null, it.encrypted ? t('sgEncrypted') : null].filter(Boolean).join(' · ');
  return (
    <li className={`sg-item ${it.status}`}>
      <div className="sg-item-main">
        <strong dir="auto">{name}</strong>
        <small className="meta">{meta}</small>
        {it.status === 'failed' && <small className="error">{t(it.failedOp === 'restore' ? 'sgFailRestore' : 'sgFailArchive')} {it.error}</small>}
      </div>
      <div className="sg-item-act">
        {BUSY.includes(it.status) && <span className="db-tag on">{t(`sgSt_${it.status}`)}</span>}
        {it.status === 'archived' && <button type="button" className="sg-link" disabled={busyId === it.id} onClick={() => onAct(it, 'restore')}>{t('sgRestore')}</button>}
        {it.status === 'failed' && it.failedOp === 'restore' && <button type="button" className="sg-link" disabled={busyId === it.id} onClick={() => onAct(it, 'restore')}>{t('sgRetry')}</button>}
        {it.status === 'failed' && it.failedOp === 'archive' && <button type="button" className="sg-link" disabled={busyId === it.id} onClick={() => onAct(it, 'retry')}>{t('sgRetry')}</button>}
        {it.status === 'restored' && <span className="db-tag ok">{t('sgSt_restored')}</span>}
      </div>
    </li>
  );
}

export default function StoragePage() {
  const { t, locale, user, call, feat } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [sec, setSec] = useState({ sftp_secret: '', s3_secret_key: '', webdav_pass: '', encrypt_pass: '' });
  const [useKey, setUseKey] = useState(false);
  const [msg, setMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showHist, setShowHist] = useState(false);

  const apply = useCallback((data, keepForm) => {
    setD(data);
    if (!keepForm) {
      setForm(Object.fromEntries(PLAIN.map((k) => [k, data.settings[k] == null ? '' : String(data.settings[k])])));
      setUseKey(data.secret.sftp_secret.kind === 'key');
    }
  }, []);
  const load = useCallback(async (keepForm) => {
    const r = await call('/studio/storage');
    if (r.ok) { apply(r.data, keepForm); setErr(null); } else setErr(r.data?.code === 'module_off' ? 'off' : (r.data?.error || 'error'));
  }, [call, apply]);
  useEffect(() => { load(false); }, [load]);

  // Tant qu'un fichier part aux archives ou en revient, l'écran se met à jour seul.
  const moving = (d?.items || []).some((i) => BUSY.includes(i.status));
  useEffect(() => {
    if (!moving) return undefined;
    const h = setInterval(() => load(true), 3000);
    return () => clearInterval(h);
  }, [moving, load]);

  const dirty = useMemo(() => {
    if (!d || !form) return false;
    return PLAIN.some((k) => String(d.settings[k] ?? '') !== form[k]) || SECRETS.some((k) => sec[k] !== '');
  }, [d, form, sec]);

  if (!user) return null;
  if (user.role !== 'admin') return <main className="studio-page studio-narrow"><h1 className="studio-title">{t('sgTitle')}</h1><section className="sd-card"><p>{t('sgAdminOnly')}</p></section></main>;
  if (err === 'off') return <main className="studio-page studio-narrow"><h1 className="studio-title">{t('sgTitle')}</h1><section className="sd-card"><p>{t('sgModuleOff')}</p><Link href="/admin?tab=modules" className="btn">{t('dbOpenModules')}</Link></section></main>;
  if (err) return <main className="studio-page"><p className="error" role="alert">{err}</p></main>;
  if (!d || !form) return <main className="studio-page"><p className="meta">{t('dbLoading')}</p></main>;

  const set = (k, v) => { setForm({ ...form, [k]: v }); setMsg(null); };
  const setS = (k, v) => { setSec({ ...sec, [k]: v }); setMsg(null); };
  const save = async () => {
    setSaving(true);
    const body = {};
    for (const k of PLAIN) if (String(d.settings[k] ?? '') !== form[k]) body[k] = form[k];
    for (const k of SECRETS) if (sec[k] !== '') body[k] = sec[k];
    const r = await call('/studio/storage/settings', { method: 'PUT', body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { apply(r.data, false); setSec({ sftp_secret: '', s3_secret_key: '', webdav_pass: '', encrypt_pass: '' }); }
    setMsg(r.ok ? { ok: true, text: t('dbSaved') } : { ok: false, text: r.data?.error || t('dbError') });
    return r.ok;
  };
  // « Tester la connexion » teste les réglages enregistrés : on enregistre d'abord ce qui a été modifié.
  const test = async () => {
    if (dirty && !(await save())) return;
    setTesting(true);
    const r = await call('/studio/storage/test', { method: 'POST' });
    setTesting(false);
    await load(true);
    if (!r.ok) setMsg({ ok: false, text: r.data?.error || t('dbError') });
    else setMsg(r.data.ok ? { ok: true, text: t('sgTestOk') } : { ok: false, text: tf(t('sgTestFail'), { e: r.data.message }) });
  };
  const testFile = async () => {
    if (dirty && !(await save())) return;
    const r = await call('/studio/storage/test-file', { method: 'POST' });
    setMsg(r.ok ? { ok: true, text: t('sgTestFileQueued') } : { ok: false, text: r.data?.error || t('dbError') });
    load(true);
  };
  const act = async (it, what) => {
    setBusyId(it.id);
    const r = await call(`/studio/storage/archives/${it.id}/${what}`, { method: 'POST' });
    setBusyId(null);
    setMsg(r.ok ? { ok: true, text: t(what === 'restore' ? 'sgRestoreQueued' : 'sgRetryQueued') } : { ok: false, text: r.data?.error || t('dbError') });
    load(true);
  };
  const runRules = async () => {
    const r = await call('/studio/storage/auto-run', { method: 'POST' });
    setMsg(r.ok ? { ok: true, text: tf(t('sgRulesRun'), { n: r.data.queued }) } : { ok: false, text: r.data?.error || t('dbError') });
    load(true);
  };
  const refreshSpace = async () => {
    const r = await call('/studio/storage/usage', { method: 'POST' });
    if (r.ok) setD({ ...d, space: r.data });
  };

  const sp = d.space;
  const ar = d.archives;
  const p = form.provider;
  const lt = d.lastTest && d.lastTest.provider === d.settings.provider ? d.lastTest : null;
  const arSub = ar.count ? tf(t(ar.count === 1 ? 'sgArchFiles1' : 'sgArchFiles'), { n: ar.count, a: ar.audio, v: ar.video }) : t('sgArchNone');
  const live = d.items;

  return (
    <main className="studio-page sg-page">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}>
        <Link href="/studio">{t('dbStudio')}</Link> / <Link href="/studio/settings">{t('sdSettings')}</Link> / <span>{t('sgTitle')}</span>
      </nav>
      <div className="studio-head"><h1 className="studio-title">{t('sgTitle')}</h1></div>
      <nav className="st-tabs" aria-label={t('sdSettings')}>
        <Link href="/studio/settings">{t('sgTabGeneral')}</Link>
        {hasWebModule('dubbing') && feat('dubbing') && <Link href="/studio/dubbing#defaults">{t('sgTabDubbing')}</Link>}
        <Link href="/studio/settings/storage" className="on" aria-current="page">{t('sgTitle')}</Link>
      </nav>

      <div className="sg-kpis">
        <Kpi title={t('sgKpiGarage')} value={sp.usedBytes == null ? '—' : fmtBytes(sp.usedBytes, locale)} pct={sp.usedPct} warn={sp.alert}
          sub={sp.usedBytes == null ? (sp.error || t('sgGarageOff')) : tf(t('sgKpiGarageSub'), { c: fmtBytes(sp.capacityBytes, locale), p: sp.usedPct.toLocaleString(locale) })} />
        <Kpi title={t('sgKpiArchives')} value={fmtBytes(ar.bytes, locale)} sub={arSub} />
        <Kpi title={tf(t('sgKpiOriginals'), { n: d.pendingOriginals.days })} value="—" sub={t('sgKpiOriginalsSub')} />
      </div>
      {sp.alert && <p className="sg-alert" role="alert">{tf(t('sgSpaceAlert'), { p: sp.freePct.toLocaleString(locale), s: sp.alertPct })}</p>}
      {sp.measuredAt && <p className="meta small sg-measured">{tf(t('sgMeasured'), { d: ago(sp.measuredAt, locale), n: (sp.objects || 0).toLocaleString(locale) })} <button type="button" className="sg-link" onClick={refreshSpace}>{t('sgRefresh')}</button></p>}

      <section className="sd-card sg-where" aria-labelledby="sg-where">
        <div className="sd-card-head">
          <h2 id="sg-where">{t('sgWhere')}</h2>
          {lt && <span className={`sg-chip ${lt.ok ? 'ok' : 'ko'}`}>{tf(t(lt.ok ? 'sgChipOk' : 'sgChipKo'), { d: ago(lt.at, locale) })}</span>}
        </div>
        <div className="sg-providers" role="radiogroup" aria-label={t('sgWhere')}>
          {d.providers.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={p === x.id} className={`sg-prov${p === x.id ? ' on' : ''}`} onClick={() => set('provider', x.id)}>
              <strong>{t(`sgProv_${x.id}`)}</strong><small>{t(`sgProvSub_${x.id}`)}</small>
            </button>
          ))}
        </div>

        {p === 'planethoster' && (
          <div className="sg-grid">
            <Field label={t('sgHost')}><input value={form.sftp_host} onChange={(e) => set('sftp_host', e.target.value)} placeholder="node228-eu.n0c.com" autoComplete="off" /></Field>
            <Field label={t('sgPort')}><input inputMode="numeric" value={form.sftp_port} onChange={(e) => set('sftp_port', e.target.value)} /></Field>
            <Field label={t('sgUser')}><input value={form.sftp_user} onChange={(e) => set('sftp_user', e.target.value)} autoComplete="off" /></Field>
            <SecretField label={t(useKey ? 'sgKey' : 'sgPassOrKey')} isSet={d.secret.sftp_secret.isSet} multiline={useKey}
              setHint={d.secret.sftp_secret.kind === 'key' ? t('sgKeySet') : t('sgSecretSet')} value={sec.sftp_secret} onChange={(v) => setS('sftp_secret', v)}
              placeholder={useKey ? '-----BEGIN OPENSSH PRIVATE KEY-----' : ''} />
            <p className="sg-wide sg-switch"><button type="button" className="sg-link" onClick={() => setUseKey(!useKey)}>{t(useKey ? 'sgUsePass' : 'sgUseKey')}</button></p>
          </div>
        )}
        {p === 's3' && (
          <div className="sg-grid">
            <Field label={t('sgS3Endpoint')} wide><input value={form.s3_endpoint} onChange={(e) => set('s3_endpoint', e.target.value)} placeholder="https://s3.fr-par.scw.cloud" autoComplete="off" /></Field>
            <Field label={t('sgS3Region')}><input value={form.s3_region} onChange={(e) => set('s3_region', e.target.value)} /></Field>
            <Field label={t('sgS3Bucket')}><input value={form.s3_bucket} onChange={(e) => set('s3_bucket', e.target.value)} autoComplete="off" /></Field>
            <Field label={t('sgS3Access')}><input value={form.s3_access_key} onChange={(e) => set('s3_access_key', e.target.value)} autoComplete="off" /></Field>
            <SecretField label={t('sgS3Secret')} isSet={d.secret.s3_secret_key.isSet} value={sec.s3_secret_key} onChange={(v) => setS('s3_secret_key', v)} />
          </div>
        )}
        {p === 'webdav' && (
          <div className="sg-grid">
            <Field label={t('sgDavUrl')} wide><input value={form.webdav_url} onChange={(e) => set('webdav_url', e.target.value)} placeholder="https://cloud.exemple.fr/remote.php/dav/files/…" autoComplete="off" /></Field>
            <Field label={t('sgUser')}><input value={form.webdav_user} onChange={(e) => set('webdav_user', e.target.value)} autoComplete="off" /></Field>
            <SecretField label={t('sgPass')} isSet={d.secret.webdav_pass.isSet} value={sec.webdav_pass} onChange={(v) => setS('webdav_pass', v)} />
          </div>
        )}
        {p === 'none' && <p className="meta">{t('sgNoneText')}</p>}
        {p !== 'none' && (
          <details className="db-adv">
            <summary>{t('sgAdvanced')}</summary>
            <div className="sg-grid">
              <Field label={t('sgFolder')}><input value={form.folder} onChange={(e) => set('folder', e.target.value)} /></Field>
              <SecretField label={t('sgEncrypt')} isSet={d.secret.encrypt_pass.isSet} value={sec.encrypt_pass} onChange={(v) => setS('encrypt_pass', v)} />
              <p className="meta small sg-wide">{t('sgEncryptHelp')}</p>
              {d.secret.encrypt_pass.isSet && <p className="sg-wide"><button type="button" className="sg-link" onClick={async () => { if (!window.confirm(t('sgEncryptRemoveConfirm'))) return; const r = await call('/studio/storage/settings', { method: 'PUT', body: JSON.stringify({ encrypt_pass: null }) }); if (r.ok) apply(r.data, true); }}>{t('sgEncryptRemove')}</button></p>}
            </div>
          </details>
        )}
        {!d.encryptionReady && <p className="error small">{t('sgNoEncryption')}</p>}
        <div className="sg-test">
          <button type="button" className="btn ghost sg-pill" disabled={testing || p === 'none'} onClick={test}>{testing ? t('sgTesting') : t('sgTest')}</button>
          <button type="button" className="btn ghost sg-pill" disabled={testing || p === 'none'} onClick={testFile}>{t('sgTestFile')}</button>
          <small className="meta">{t('sgCipherNote')}</small>
        </div>
        {lt && !lt.ok && <p className="error small" role="status">{lt.message}</p>}
        {lt?.ok && lt.about?.freeBytes != null && <p className="meta small">{tf(t('sgAbout'), { f: fmtBytes(lt.about.freeBytes, locale) })}</p>}
      </section>

      <div className="sg-two">
        <section className="sd-card" aria-labelledby="sg-rules">
          <h2 id="sg-rules">{t('sgRules')}</h2>
          <div className="sg-rule">
            <span>{t('sgRuleWork')}</span>
            <span className="sg-num"><input type="number" min={0} max={3650} value={form.work_audio_days} onChange={(e) => set('work_audio_days', e.target.value)} aria-label={t('sgRuleWork')} /> {t('sgDays')}</span>
          </div>
          <div className="sg-rule">
            <span>{t('sgRuleKeep')}<small className="meta">{t('sgRuleKeepNote')}</small></span>
            <span className="sg-num"><input type="number" min={1} max={365} value={form.keep_original_days} onChange={(e) => set('keep_original_days', e.target.value)} aria-label={t('sgRuleKeep')} /> {t('sgDays')}</span>
          </div>
          <div className="sg-rule">
            <span>{t('sgRuleAlert')}</span>
            <span className="sg-num"><input type="number" min={0} max={90} value={form.alert_free_pct} onChange={(e) => set('alert_free_pct', e.target.value)} aria-label={t('sgRuleAlert')} /> %</span>
          </div>
          <div className="sg-rule">
            <span>{t('sgRuleCapacity')}<small className="meta">{t('sgRuleCapacityNote')}</small></span>
            <span className="sg-num"><input type="number" min={1} max={100000} value={form.garage_capacity_gb} onChange={(e) => set('garage_capacity_gb', e.target.value)} aria-label={t('sgRuleCapacity')} /> {unitsFor(locale)[3]}</span>
          </div>
          <div className="sg-rule"><span>{t('sgRuleBackup')}</span><strong className="sg-same">{t('sgUnchanged')}</strong></div>
          <p className="meta small">
            {d.autoLast ? tf(t('sgRulesLast'), { d: ago(d.autoLast.at, locale), n: d.autoLast.queued }) : t('sgRulesNever')}{' '}
            {p !== 'none' && <button type="button" className="sg-link" onClick={runRules}>{t('sgRulesNow')}</button>}
          </p>
        </section>

        <section className="sd-card" aria-labelledby="sg-arch">
          <h2 id="sg-arch">{t('sgInArchives')}</h2>
          {live.length ? <ul className="sg-items">{live.map((it) => <Item key={it.id} it={it} onAct={act} busyId={busyId} />)}</ul> : <p className="meta">{t('sgArchEmpty')}</p>}
          {d.history.length > 0 && (
            <>
              <button type="button" className="sg-link" aria-expanded={showHist} onClick={() => setShowHist(!showHist)}>{tf(t(showHist ? 'sgHistHide' : 'sgHistShow'), { n: d.history.length })}</button>
              {showHist && <ul className="sg-items">{d.history.map((it) => <Item key={it.id} it={it} onAct={act} busyId={busyId} />)}</ul>}
            </>
          )}
        </section>
      </div>

      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      <div className="db-actions">
        <button type="button" className="btn sg-save" disabled={!dirty || saving} onClick={save}>{saving ? t('sgSaving') : t('dbSave')}</button>
        {dirty && <button type="button" className="btn ghost" onClick={() => { apply(d, false); setSec({ sftp_secret: '', s3_secret_key: '', webdav_pass: '', encrypt_pass: '' }); setMsg(null); }}>{t('dbCancel')}</button>}
      </div>
    </main>
  );
}
