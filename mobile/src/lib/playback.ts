// Choix de la source de lecture d'une conférence, selon ce que renvoie GET /talks/:id. Pur, testable avec Node.
import { absoluteUrl } from './api';
import type { Talk } from './types';

export type PlaySource = {
  /** Adresse de la vidéo (HLS multi-qualités du serveur, fichier archive.org, ou fichier d'origine pour le propriétaire). */
  uri: string | null;
  /** Flux audio seul (économise la batterie et les données), s'il existe. */
  audioUri: string | null;
  /** Vidéo YouTube / Vimeo : lue depuis leur plateforme, donc sur le site (pas dans le lecteur natif). */
  external: boolean;
  /** Vidéo envoyée mais pas encore convertie. */
  notReady: boolean;
};

export function pickSource(talk: Talk, baseUrl: string): PlaySource {
  const abs = (p?: string) => (p ? absoluteUrl(baseUrl, p) : null);
  if (talk.source !== 'upload') {
    if (talk.fileUrl) return { uri: talk.fileUrl, audioUri: null, external: false, notReady: false };
    return { uri: null, audioUri: null, external: true, notReady: false };
  }
  if (talk.hlsPath) return { uri: abs(talk.hlsPath), audioUri: abs(talk.audioPath), external: false, notReady: false };
  if (talk.videoUrl) return { uri: talk.videoUrl, audioUri: null, external: false, notReady: false };
  return { uri: null, audioUri: null, external: false, notReady: true };
}

/** Nom de la plateforme d'une vidéo externe, pour le message affiché. */
export const platformName = (source: string) => (source === 'youtube' ? 'YouTube' : source === 'vimeo' ? 'Vimeo' : source);

/** Vitesses proposées, dans l'ordre du bouton. */
export const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
export const nextSpeed = (current: number) => SPEEDS[(Math.max(0, SPEEDS.indexOf(current)) + 1) % SPEEDS.length];

/** Chapitre en cours à la position donnée (ms) ; -1 s'il n'y en a pas. */
export function currentChapter(chapters: { s: number }[], positionMs: number): number {
  let found = -1;
  chapters.forEach((c, i) => { if (c.s <= positionMs) found = i; });
  return found;
}
