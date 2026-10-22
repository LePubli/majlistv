// 22b-10 : diffusion sur la télévision (Chromecast sous Android, AirPlay sous iPhone). Logique pure, testable avec Node :
// aucune bibliothèque native importée ici.
import type { PlaySource } from './playback';

/** Type MIME d'une playlist HLS, tel que le récepteur Chromecast l'attend. */
export const HLS_CONTENT_TYPE = 'application/x-mpegURL';

/** Ce que l'écran de lecture reçoit du pont de diffusion pendant une diffusion (null = pas de diffusion). */
export type CastState = {
  /** Nom de l'appareil (« Salon », « Chromecast de la chambre »…). */
  device: string;
  playing: boolean;
  /** Position actuelle du téléviseur, en secondes. */
  position: number;
  play: () => void;
  pause: () => void;
  /** Se placer à cette position (en secondes). */
  seek: (seconds: number) => void;
};

export type CastBridgeProps = {
  /** Lecteur local : mis en pause pendant la diffusion, repris à la même position ensuite. */
  player: { currentTime: number; duration: number; pause: () => void; play: () => void };
  /** Adresse HLS complète (avec le jeton de lecture). */
  uri: string;
  title: string;
  speaker?: string | null;
  posterUrl?: string | null;
  durationSec?: number;
  onCast: (state: CastState | null) => void;
};

/** La diffusion n'est proposée que pour une vidéo lue par le lecteur natif depuis notre serveur ou un fichier public :
 *  pas pour YouTube / Vimeo (lus depuis leur plateforme) ni pour un fichier téléchargé sur le téléphone (adresse locale). */
export function canCast(src: Pick<PlaySource, 'uri' | 'embed' | 'external' | 'notReady'>): boolean {
  if (!src.uri || src.embed || src.external || src.notReady) return false;
  return /^https:\/\//i.test(src.uri);
}

export type CastRequest = {
  autoplay: boolean;
  startTime: number;
  mediaInfo: {
    contentUrl: string;
    contentType: string;
    streamType: 'BUFFERED';
    streamDuration?: number;
    metadata: { type: 'movie'; title: string; subtitle?: string; images: { url: string }[] };
  };
};

/** Requête de chargement envoyée au récepteur : le téléviseur lit lui-même le flux HLS (le jeton est dans l'adresse). */
export function castRequest(i: { uri: string; title: string; speaker?: string | null; posterUrl?: string | null; startSec: number; durationSec?: number }): CastRequest {
  const start = Number.isFinite(i.startSec) && i.startSec > 0 ? Math.floor(i.startSec) : 0;
  return {
    autoplay: true,
    startTime: start,
    mediaInfo: {
      contentUrl: i.uri,
      contentType: HLS_CONTENT_TYPE,
      streamType: 'BUFFERED',
      ...(i.durationSec && i.durationSec > 0 ? { streamDuration: i.durationSec } : {}),
      metadata: {
        type: 'movie',
        title: i.title,
        ...(i.speaker ? { subtitle: i.speaker } : {}),
        images: i.posterUrl && /^https:\/\//i.test(i.posterUrl) ? [{ url: i.posterUrl }] : [],
      },
    },
  };
}

/** Position de reprise sur le téléphone à la fin de la diffusion : la dernière position connue du téléviseur, sinon celle d'avant. */
export function resumeSeconds(lastRemote: number | null, before: number, durationSec: number): number {
  const v = lastRemote !== null && Number.isFinite(lastRemote) && lastRemote >= 0 ? lastRemote : before;
  const max = durationSec > 0 ? Math.max(0, durationSec - 1) : v;
  return Math.max(0, Math.min(v, max));
}
