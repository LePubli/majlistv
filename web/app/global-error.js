'use client';
// Étape 39 — Dernier filet : erreur dans la structure même du site (remplace toute la page). Signalée comme les autres.
import { useEffect } from 'react';
import { reportError } from '../lib/reportError';

export default function GlobalError({ error, reset }) {
  useEffect(() => { reportError(error); }, [error]);
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: '#0B0906', color: '#FFFFFF', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '72px 16px' }}>
        <h1>Un problème est survenu</h1>
        <p>Le site n’a pas pu s’afficher. L’équipe en a été informée automatiquement.</p>
        <p lang="en" style={{ opacity: 0.8 }}>Something went wrong. The team has been notified.</p>
        <button type="button" onClick={() => reset()} style={{ background: '#E6A739', color: '#120D06', border: 0, borderRadius: 999, padding: '12px 28px', fontWeight: 700, cursor: 'pointer' }}>Réessayer / Try again</button>
      </body>
    </html>
  );
}
