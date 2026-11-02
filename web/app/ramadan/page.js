'use client';
// Circuit de Ramadan (étape 45F) : actions du jour (saisies et validées dans Admin → Ramadan), suivi des tarawih, rappel quotidien.
// Gratuit pour tout membre connecté. Hors Ramadan : le programme se consulte, les cases s'ouvrent le 1er Ramadan.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import RamadanBilan from '../../components/RamadanBilan';
import EmptyState from '../../components/EmptyState';

function DayItems({ items, day, mine, can, onMark, t }) {
  if (!items.length) return <p className="meta">{t('rzNoItem')}</p>;
  return (
    <ul className="rm-items">
      {items.map((i) => {
        const done = mine.includes(i.id);
        return (
          <li key={i.id} className={done ? 'done' : ''}>
            <label className="chk"><input type="checkbox" checked={done} disabled={!can} onChange={(e) => onMark(day, i.id, e.target.checked)} /> <b>{i.title}</b></label>
            {i.text && <p>{i.text}</p>}
            <p className="meta small">
              {i.day === 0 ? `${t('rzEveryDay')} · ` : ''}{i.reference ? `${t('atRef')} : ${i.reference}` : ''}
              {i.link ? <> {i.reference ? '· ' : ''}<Link className="link u" href={i.link}>{t('rzOpen')}</Link></> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export default function RamadanPage() {
  const { t, locale, call, user, feat } = useApp();
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => call(`/ramadan?lang=${locale}`).then((r) => { if (r.ok) { setD(r.data); setSel((s) => s ?? (r.data.status.day || 1)); } else setErr(r.data?.error || t('errGeneric')); }), [call, locale, t]);
  useEffect(() => { load(); }, [load, user]);
  const put = async (path, body) => {
    setErr('');
    const r = await call(path, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) setErr(r.data?.error || t('errGeneric'));
    load();
  };
  if (!d) return <main className="page"><p className="meta">{err || '…'}</p></main>;
  const st = d.status;
  const me = d.me;
  const itemsOf = (n) => [...d.everyDay, ...(d.days[n - 1]?.items || [])];
  const any = d.everyDay.length > 0 || d.days.some((x) => x.items.length);
  const marksOf = (n) => me?.marks?.[n] || [];
  const can = (n) => Boolean(me && st.active && n <= st.day);
  const tw = me?.tarawih?.[sel];
  const date = (s) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'long' }) : '');
  return (
    <main className="page rm-page">
      <section className="series-listhead">
        <h1>{t('rzTitle')}</h1>
        <p className="meta">{t('rzIntro')}</p>
        <p className="rm-status">{st.active ? t('rzDayOf').replace('{n}', st.day).replace('{y}', st.hyear) : st.startsOn ? t('rzStartsIn').replace('{n}', st.daysToStart).replace('{d}', date(st.startsOn)) : ''}</p>
      </section>
      {!user && <p><Link className="btn" href="/login?next=/ramadan">{t('rzLogin')}</Link></p>}
      {user && <RamadanBilan ended={!st.active} />}
      {err && <p className="error" role="alert">{err}</p>}
      {!any ? <EmptyState title={t('rzSoon')} text={t('rzSoonTx')} actions={[feat('quranplan') && { href: '/coran', label: t('esReadQuran') }, feat('athkar') && { href: '/learning?tab=athkar', label: t('obAthkar') }]} /> : (
        <>
          <nav className="rm-days" aria-label={t('rzDays')}>
            {d.days.map((x) => {
              const total = itemsOf(x.day).length; const done = marksOf(x.day).length;
              const cls = [sel === x.day ? 'on' : '', st.active && x.day === st.day ? 'today' : '', total && done >= total ? 'full' : ''].filter(Boolean).join(' ');
              return (
                <button key={x.day} type="button" className={cls} aria-pressed={sel === x.day} onClick={() => setSel(x.day)}>
                  <b>{x.day}</b>{me && st.active && x.day <= st.day ? <span dir="ltr">{done}/{total}</span> : null}
                </button>
              );
            })}
          </nav>
          <section className="rm-day" aria-label={t('rzDay').replace('{n}', sel)}>
            <h2>{t('rzDay').replace('{n}', sel)}{st.active && sel === st.day ? ` · ${t('rzToday')}` : ''}</h2>
            <DayItems items={itemsOf(sel)} day={sel} mine={marksOf(sel)} can={can(sel)} onMark={(day, itemId, done) => put('/ramadan/mark', { day, itemId, done })} t={t} />
            {me && st.active && sel <= st.day && (
              <div className="rm-tw">
                <label className="chk"><input type="checkbox" checked={Boolean(tw)} onChange={(e) => put('/ramadan/tarawih', { day: sel, done: e.target.checked })} /> <b>{t('rzTarawih').replace('{n}', sel)}</b></label>
                {tw && (
                  <div className="rm-tw-more">
                    <label>{t('rzRakaat')}<input type="number" min="2" max="40" defaultValue={tw.rakaat ?? ''} onBlur={(e) => put('/ramadan/tarawih', { day: sel, done: true, rakaat: e.target.value ? Math.min(40, Math.max(2, Number(e.target.value))) : null, place: tw.place })} dir="ltr" /></label>
                    <label>{t('rzPlace')}
                      <select value={tw.place ?? ''} onChange={(e) => put('/ramadan/tarawih', { day: sel, done: true, rakaat: tw.rakaat, place: e.target.value || null })}>
                        <option value="">—</option><option value="mosque">{t('rzMosque')}</option><option value="home">{t('rzHome')}</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}
            {me && !st.active && <p className="meta small">{t('rzLater')}</p>}
          </section>
          {me && (
            <label className="rm-remind">{t('atRemind')}
              <select value={me.remindHour ?? ''} onChange={(e) => put('/ramadan/prefs', { remindHour: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t('atNoRemind')}</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
          )}
        </>
      )}
      <p className="meta small">{t('rzNote')}</p>
    </main>
  );
}
