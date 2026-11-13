// Lecteur plein écran de la télé.
//  - Vidéo du serveur (HLS) ou fichier direct : lecteur natif (expo-video / Media3) avec ses commandes d'origine, qui se pilotent
//    à la télécommande (OK = lecture / pause, gauche / droite = reculer / avancer).
//  - YouTube / Vimeo / Dailymotion : lecteur intégré de la plateforme ; nos boutons (Lecture/Pause, −10 s, +10 s) sous la vidéo.
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
import { colors } from '@/lib/theme';
import { ErrorBox, Loading, Txt } from '@/components/ui';
import { ExternalVideo, type PlayerHandle } from '@/components/ExternalVideo';
import { Focusable } from '@/components/tv/Focusable';

export default function TvPlay() {
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const { api, user } = useSession();
  const talk = useAsync(() => api.get<Talk>(`/talks/${id}`), [id, user?.id]);
  if (talk.loading && !talk.data) return <Loading />;
  if (!talk.data) return <ErrorBox onRetry={talk.reload} />;
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
        <View style={{ flex: 1 }}>
          <ExternalVideo ref={embed} kind={src.embed.kind} id={src.embed.id} startSeconds={startSec} limitSeconds={0} onMessage={onEmbed} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, padding: 14, backgroundColor: colors.nav }}>
          <Focusable accessibilityRole="button" accessibilityLabel="-10 s" onPress={() => embed.current?.seek(Math.max(0, pos.current - 10))} style={{ paddingVertical: 10, paddingHorizontal: 22, backgroundColor: colors.panel }} radius={999}>
            <Txt weight="bold" size={18}>⟲ 10 s</Txt>
          </Focusable>
          <Focusable first accessibilityRole="button" accessibilityLabel={embedPlaying ? t('tv.pause') : t('tv.play')} onPress={() => (embedPlaying ? embed.current?.pause() : embed.current?.play())}
            style={{ paddingVertical: 10, paddingHorizontal: 30, backgroundColor: colors.gold }} radius={999}>
            <Txt weight="extrabold" size={18} color="#111">{embedPlaying ? `❚❚ ${t('tv.pause')}` : `▶ ${t('tv.play')}`}</Txt>
          </Focusable>
          <Focusable accessibilityRole="button" accessibilityLabel="+10 s" onPress={() => embed.current?.seek(pos.current + 10)} style={{ paddingVertical: 10, paddingHorizontal: 22, backgroundColor: colors.panel }} radius={999}>
            <Txt weight="bold" size={18}>10 s ⟳</Txt>
          </Focusable>
        </View>
      </View>
    );
  }
  if (!src.uri || failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.bg }}>
        <Txt size={20}>{src.notReady ? t('tv.notReady') : t('tv.cannotPlay')}</Txt>
        <Focusable first accessibilityRole="button" onPress={() => router.back()} radius={999} style={{ paddingVertical: 10, paddingHorizontal: 24, backgroundColor: colors.panel }}>
          <Txt weight="bold" size={18}>{t('tv.back')}</Txt>
        </Focusable>
      </View>
    );
  }
  return <VideoView player={player} style={{ flex: 1, backgroundColor: '#000' }} nativeControls contentFit="contain" hasTVPreferredFocus focusable />;
}
