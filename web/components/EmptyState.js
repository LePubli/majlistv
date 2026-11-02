'use client';
// Étape B3 — État vide utile : dit POURQUOI la liste est vide et propose une ACTION (lien ou bouton).
//   <EmptyState title="…" text="…" actions={[{ href: '/coran', label: '…' }, { onClick: fn, label: '…' }]} compact />
import Link from 'next/link';

export default function EmptyState({ title, text, actions = [], compact = false, icon = '✦' }) {
  const list = actions.filter(Boolean);
  return (
    <div className={`empty${compact ? ' empty-compact' : ''}`} role="status">
      <span className="empty-ico" aria-hidden="true">{icon}</span>
      <div className="empty-body">
        {title && <p className="empty-title">{title}</p>}
        {text && <p className="empty-text">{text}</p>}
        {list.length > 0 && (
          <p className="empty-actions">
            {list.map((a, i) => (a.href
              ? <Link key={a.href} href={a.href} className={i === 0 ? 'btn' : 'btn ghost'}>{a.label}</Link>
              : <button key={a.label} type="button" className={i === 0 ? 'btn' : 'btn ghost'} onClick={a.onClick}>{a.label}</button>))}
          </p>
        )}
      </div>
    </div>
  );
}
