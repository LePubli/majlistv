'use client';
// Étape 39 — Suivi des erreurs : écoute les erreurs JavaScript non rattrapées de la page et les envoie à l'API.
import { useEffect } from 'react';
import { reportError } from '../lib/reportError';

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e) => reportError(e.error || e.message);
    const onRejection = (e) => reportError(e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
