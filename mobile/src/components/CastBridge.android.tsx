// Chromecast (Android) : bouton natif de choix de l'appareil + pont avec le lecteur local.
// Connexion → le lecteur du téléphone se met en pause et le téléviseur charge le même flux HLS à la même position.
// Déconnexion → le téléphone reprend à la dernière position du téléviseur.
import React, { useEffect, useRef } from 'react';
import { CastButton, MediaPlayerState, MediaStreamType, useCastDevice, useMediaStatus, useRemoteMediaClient, useStreamPosition } from 'react-native-google-cast';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { castRequest, resumeSeconds, type CastBridgeProps } from '@/lib/cast';
import { CastTile } from './CastTile';

export function CastBridge({ player, uri, title, speaker, posterUrl, durationSec, onCast }: CastBridgeProps) {
  const { t } = useSession();
  const client = useRemoteMediaClient();
  const device = useCastDevice();
  const status = useMediaStatus();
  const position = useStreamPosition(1);
  const last = useRef<number | null>(null);
  const casting = useRef(false);
  const playing = status?.playerState === MediaPlayerState.PLAYING;

  useEffect(() => { if (position !== null) last.current = position; }, [position]);

  // Connexion / déconnexion.
  useEffect(() => {
    if (client) {
      casting.current = true;
      last.current = null;
      const start = player.currentTime;
      player.pause();
      const req = castRequest({ uri, title, speaker, posterUrl, startSec: start, durationSec });
      client.loadMedia({ ...req, mediaInfo: { ...req.mediaInfo, streamType: MediaStreamType.BUFFERED } }).catch(() => {
        casting.current = false; // le téléviseur n'a pas pu charger : on reste sur le téléphone
        onCast(null);
        player.play();
      });
    } else if (casting.current) {
      casting.current = false;
      onCast(null);
      player.currentTime = resumeSeconds(last.current, player.currentTime, durationSec ?? player.duration);
      player.play();
    }
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  // État transmis à l'écran de lecture (boutons lecture / pause / ±10 s, nom de l'appareil, position pour la reprise).
  useEffect(() => {
    if (!client) return;
    onCast({
      device: device?.friendlyName || 'Chromecast',
      playing,
      position: position ?? 0,
      play: () => { void client.play(); },
      pause: () => { void client.pause(); },
      seek: (s) => { void client.seek({ position: Math.max(0, s) }); },
    });
  }, [client, device?.friendlyName, playing, position]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CastTile label={t('cast.tile')} active={!!client}>
      <CastButton style={{ width: 28, height: 28, tintColor: client ? colors.goldLight : colors.text }} />
    </CastTile>
  );
}
