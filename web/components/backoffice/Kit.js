'use client';
// Composants de la maquette Admin + Studio (MejlissTV-Maquettes-Statiques) en React : mêmes balises et mêmes classes
// (préfixées bm-, feuille public/premium/bo-mock.css fabriquée par web/scripts/build-bo-css.py), mais branchés sur les
// vraies données et les vraies actions du site. Utilisés seulement avec le thème Premium.
import { ICON_PATHS } from './boIconPaths';

// « a b » → « bm-a bm-b » (les classes de la maquette portent le préfixe bm-)
export const c = (s) => String(s || '').split(/\s+/).filter(Boolean).map((x) => `bm-${x}`).join(' ');

export function I({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] || ICON_PATHS.grid} />
    </svg>
  );
}

// Enveloppe : la maquette vit dans .bm-app (variables, base) ; le contenu de la page s'y place sans changer le menu.
export function Bm({ children, className = '' }) {
  return <div className={`bm-app bm-embed ${className}`}>{children}</div>;
}

export function Page({ title, sub, actions, children }) {
  return (
    <Bm>
      <header className={c('view-heading')}>
        <div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
        {actions ? <div className={c('heading-actions')}>{actions}</div> : null}
      </header>
      {children}
    </Bm>
  );
}

export function Btn({ children, primary = true, onClick, href, disabled, type = 'button', title, ...rest }) {
  const cls = c(`button ${primary ? 'primary' : 'secondary'}`);
  if (href) return <a className={cls} href={href} title={title} {...rest}>{children}</a>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title} {...rest}>{children}</button>;
}

export function Badge({ tone = 'blue', children }) { return <span className={c(`badge ${tone}`)}>{children}</span>; }

export function Tabs({ names, value, onChange }) {
  return (
    <div className={c('tabs')} role="tablist">
      {names.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? c('active') : ''} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

// Ligne de chiffres : items = [{ icon, tone, label, value, note }] ; les valeurs inconnues (null / undefined) ne sont pas montrées.
export function Metrics({ items, cols = 'four' }) {
  const shown = items.filter((m) => m.value !== null && m.value !== undefined);
  if (!shown.length) return null;
  return (
    <div className={c(`metrics ${cols}`)}>
      {shown.map((m, i) => (
        <div key={i} className={c('metric')}>
          <span className={c(`metric-icon ${m.tone || 'blue'}`)}><I name={m.icon || 'chart'} size={23} /></span>
          <span className={c('metric-label')}>{m.label}</span>
          <strong>{m.value}</strong>
          <small className={m.tone === 'green' ? c('success') : ''}>{m.note || ' '}</small>
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, extra, children, className = '' }) {
  return (
    <section className={`${c('panel')} ${className}`}>
      <div className={c('panel-heading')}><h2>{title}</h2>{extra ? <span>{extra}</span> : null}</div>
      {children}
    </section>
  );
}

export function Cols({ kind = 'two-main', children }) { return <div className={c(`cols ${kind}`)}>{children}</div>; }

export function Progress({ value }) { return <div className={c('progress')}><i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>; }

export function Userpic({ name, i = 0 }) {
  const ini = String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return <span className={c(`userpic up${i % 6}`)}>{ini}</span>;
}

// Tableau : headers = ['Titre', …], rows = [[cell, cell], …] ; onRow(i) rend la ligne cliquable.
export function Table({ headers, rows, className = '', onRow, empty }) {
  if (!rows.length && empty) return <p className={c('empty-note')} style={{ padding: '18px 4px', color: 'var(--muted)' }}>{empty}</p>;
  return (
    <div className={c('table-scroll')}>
      <table className={`${c('data-table')} ${className}`}>
        <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} onClick={onRow ? () => onRow(ri) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>
              {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }) { return <label className={c('field')}><span>{label}</span>{children}</label>; }

export function Meta({ items }) {
  return <dl className={c('metadata')}>{items.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function Drawer({ title, onClose, children, footer }) {
  return (
    <aside className={c('inspector')}>
      <div className={c('inspector-head')}><h2>{title}</h2><button type="button" className={c('button secondary')} onClick={onClose} aria-label="Fermer"><I name="close" size={15} /></button></div>
      {children}
      {footer ? <footer>{footer}</footer> : null}
    </aside>
  );
}

// Courbe simple (SVG) à partir de vraies valeurs : values = [n, …]. Rien n'est dessiné sans au moins 2 points.
export function Line({ values, labels = [], unit = '', height = 230 }) {
  if (!values || values.length < 2) return null;
  const W = 760, H = 310, L = 52, R = 25, T = 20, B = 35;
  const max = Math.max(1, ...values), min = 0;
  const x = (i) => L + (i * (W - L - R)) / (values.length - 1);
  const y = (v) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(max * k));
  const gid = `bm-fill-${values.length}-${max}`;
  return (
    <div className={c('chart')} style={{ minHeight: height }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#0aa5ff" stopOpacity=".37" /><stop offset="1" stopColor="#087dec" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((t, i) => (
          <g key={i}><line className={c('chart-grid')} x1={L} y1={y(t)} x2={W - R} y2={y(t)} /><text x={L - 12} y={y(t) + 5} textAnchor="end" className={c('chart-axis')}>{t}{unit}</text></g>
        ))}
        <path d={`${path}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gid})`} />
        <path d={path} stroke="#0da7ff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {labels.length === values.length && [0, Math.floor(values.length / 2), values.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className={c('chart-axis')}>{labels[i]}</text>
        ))}
      </svg>
    </div>
  );
}
