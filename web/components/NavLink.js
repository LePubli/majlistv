'use client';
// Étape I4 — Lien de menu : page du site (navigation sans rechargement), lien https (nouvel onglet), mailto: / tel:.
import Link from 'next/link';

export default function NavLink({ href, children, ...rest }) {
  if (typeof href === 'string' && href.startsWith('/')) return <Link href={href} {...rest}>{children}</Link>;
  const web = typeof href === 'string' && href.startsWith('https://');
  return <a href={href} {...rest} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
}
