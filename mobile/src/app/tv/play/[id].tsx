// Lecteur plein écran de la télé.
//  - Vidéo du serveur (HLS) ou fichier direct : lecteur natif (expo-video / Media3) avec ses commandes d'origine, qui se pilotent
//    à la télécommande (OK = lecture / pause, gauche / droite = reculer / avancer).
//  - YouTube / Vimeo / Dailymotion : lecteur intégré de la plateforme ; nos commandes (Lecture/Pause, −10 s, +10 s) par-dessus la vidéo (TvPlayerBar).
// La progression est envoyée au serveur comme sur le téléphone (reprise sur le site et les autres appareils).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { API_URL } from '@/lib/config';
import { ProgressTracker } from '@/lib/progress';
import { pickSource } from '@/lib/playback';
import type { EmbedMessage } from '@/lib/embed';
import type { Talk } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/ui';
import { ExternalVideo, type PlayerHandle } from '@/components/ExternalVideo';
import { TvPlayerBar } from '@/components/tv/TvPlayerBar';
import { TvMessage } from '@/components/tv/TvMessage';

export default function TvPlay() {
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const { api, user } = useSession();
  const talk = useAsync(() => api.get<Talk>(`/talks/${id}`), [id, user?.id]);
  if (talk.loading && !talk.data) return <View style={{ flex: 1, backgroundColor: '#000' }}><Loading /></View>;
  if (!talk.data) return <View style={{ flex: 1, backgroundColor: '#000' }}><ErrorBox onRetry={talk.reload} /></View>;
  return <Player key={talk.data.id} talk={talk.data} startSec={Math.max(0, Number(at) || 0)} />;
}

function Player({ talk, startSec }: { talk: Talk; startSec: number }) {
  const { api, user, t, config } = useSession();
  const src = useMemo(() => pickSource(talk, API_URL, config?.dailymotionPlayerId), [talk, config?.dailymotionPlayerId]);
  const tracker = useMemo(() => new ProgressTracker((p) => api.put(`/me/progress/${talk.id}`, p).then(() => undefined), { enabled: !!user && !talk.locked }), [api, talk.id, user, talk.locked]);
  useEffect(() => () => { void tracker.flush(); }, [tracker]);
  // Retour de la télécommande : on enregistre la position avant de quitter.
  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => { void tracker.flush(); router.back(); return true; });
    return () => s.remove();
  }, [tracker]);

  const player = useVideoPlayer(src.uri ? { uri: src.uri, metadata: { title: talk.title, artist: talk.speaker } } : null, (p) => { p.timeUpdateEventInterval = 1; });
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay' && !started.current) {
      started.current = true;
      if (startSec > 0) player.currentTime = startSec;
      player.play();
    } else if (status === 'error') setFailed(true);
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => tracker.update(currentTime * 1000, (player.duration || talk.durationSeconds || 0) * 1000, player.playing));
  useEffect(() => { if (!isPlaying) void tracker.flush(); }, [isPlaying, tracker]);

  const embed = useRef<PlayerHandle>(null);
  const [embedPlaying, setEmbedPlaying] = useState(true);
  const pos = useRef(startSec);
  const onEmbed = (m: EmbedMessage) => {
    if (m.t === 'time') { pos.current = m.c; setEmbedPlaying(m.playing); tracker.update(m.c * 1000, (m.d || talk.durationSeconds || 0) * 1000, m.playing); }
    else if (m.t === 'state') setEmbedPlaying(m.playing);
  };

  if (src.embed) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <ExternalVideo ref={embed} kind={src.embed.kind} id={src.embed.id} startSeconds={startSec} limitSeconds={0} onMessage={onEmbed} />
        <TvPlayerBar title={talk.title} subtitle={talk.speaker} playing={embedPlaying}
          onToggle={() => (embedPlaying ? embed.current?.pause() : embed.current?.play())}
          onSeekBy={(d) => embed.current?.seek(Math.max(0, pos.current + d))} />
      </View>
    );
  }
  if (!src.uri || failed) return <TvMessage text={src.notReady ? t('tv.notReady') : t('tv.cannotPlay')} />;
  return <VideoView player={player} style={{ flex: 1, backgroundColor: '#000' }} nativeControls contentFit="contain" hasTVPreferredFocus focusable />;
}
