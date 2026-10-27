'use client';
// Étape 39 — Page d'erreur d'une section : l'erreur est signalée à l'administrateur (Admin → Erreurs), le visiteur peut réessayer.
import { useEffect } from 'react';
import { reportError } from '../lib/reportError';

export default function RouteError({ error, reset }) {
  useEffect(() => { reportError(error); }, [error]);
  return (
    <main className="wrap" style={{ padding: '64px 0', textAlign: 'center' }}>
      <h1>Un problème est survenu</h1>
      <p>Cette page n’a pas pu s’afficher. L’équipe en a été informée automatiquement.</p>
      <p lang="en" style={{ opacity: 0.8 }}>Something went wrong. The team has been notified.</p>
      <p style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => reset()}>Réessayer / Try again</button>
        <a className="btn ghost" href="/">Accueil / Home</a>
      </p>
    </main>
  );
}
