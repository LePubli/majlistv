// Lecteur de l'enfant sur la télé : vidéo du serveur (lecteur natif et ses commandes) ou YouTube / Vimeo / Dailymotion (nos boutons sous la vidéo).
// Reprise propre à l'enfant (position envoyée toutes les 10 s, à la pause et en quittant) ; temps du jour compté par le serveur (« ping »).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { pickSource } from '@/lib/playback';
import type { EmbedMessage } from '@/lib/embed';
import { KC, PROGRESS_EVERY_MS, isTimeUp, progressBody } from '@/lib/kids';
import type { Talk } from '@/lib/types';
import { Txt } from '@/components/ui';
import { ExternalVideo, type PlayerHandle } from '@/components/ExternalVideo';
import { Focusable } from '@/components/tv/Focusable';

const back = () => { if (router.canGoBack()) router.back(); else router.replace('/tv/kids/home'); };

function Message({ text, emoji }: { text: string; emoji?: string }) {
  const { t } = useSession();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, backgroundColor: KC.bg }}>
      {emoji ? <Txt size={60} style={{ lineHeight: 72 }}>{emoji}</Txt> : null}
      <Txt size={20} color={KC.text} style={{ textAlign: 'center' }}>{text}</Txt>
      <Focusable first accessibilityRole="button" radius={999} onPress={back} style={{ paddingVertical: 12, paddingHorizontal: 26, backgroundColor: KC.surface }}>
        <Txt weight="bold" size={17} color={KC.text}>{t('tv.back')}</Txt>
      </Focusable>
    </View>
  );
}

export default function TvKidsWatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSession();
  const { kid, kidApi, epoch, time } = useKid();
  const talk = useAsync(() => kidApi.get<Talk>(`/talks/${id}`), [id, epoch]);
  if (!kid) return <Redirect href="/tv/kids" />;
  const err = talk.error instanceof ApiError ? talk.error : null;
  if (time?.timeUp || isTimeUp(err)) return <Message emoji="🌙" text={t('kdTimeUpText')} />;
  if (talk.loading && !talk.data) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.bg }}><Txt color={KC.text2}>…</Txt></View>;
  if (!talk.data || talk.data.locked) return <Message text={err && err.status !== 404 && err.status !== 403 ? t('common.error') : t('kdUnavailableTalk')} />;
  return <Player key={talk.data.id} talk={talk.data} />;
}

function Player({ talk }: { talk: Talk }) {
  const { t, config } = useSession();
  const { kidApi } = useKid();
  const src = useMemo(() => pickSource(talk, API_URL, config?.dailymotionPlayerId), [talk, config?.dailymotionPlayerId]);
  const startSec = (talk.resumeMs ?? 0) / 1000;
  const live = useRef({ pos: startSec, dur: talk.durationSeconds || 0, playing: false });
  const save = () => {
    const b = progressBody(live.current.pos, live.current.dur || talk.durationSeconds || 0);
    if (b) void kidApi.put(`/kids/progress/${talk.id}`, b).catch(() => { /* la prochaine sauvegarde réessaie */ });
  };
  useEffect(() => {
    const timer = setInterval(() => { if (live.current.playing) save(); }, PROGRESS_EVERY_MS);
    return () => { clearInterval(timer); save(); };
  }, [talk.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const player = useVideoPlayer(src.uri ? { uri: src.uri, metadata: { title: talk.title } } : null, (p) => { p.staysActiveInBackground = false; p.showNowPlayingNotification = false; p.timeUpdateEventInterval = 1; });
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
  useEffect(() => { if (!src.embed) { live.current.playing = isPlaying; if (!isPlaying) save(); } }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
  useEventListener(player, 'timeUpdate', ({ currentTime }) => { live.current.pos = currentTime; if (player.duration) live.current.dur = player.duration; });
  useEventListener(player, 'playToEnd', () => { live.current.pos = live.current.dur; save(); });

  const embed = useRef<PlayerHandle>(null);
  const [embedPlaying, setEmbedPlaying] = useState(true);
  const onEmbed = (m: EmbedMessage) => {
    if (m.t === 'time') { live.current.pos = m.c; live.current.playing = m.playing; if (m.d) live.current.dur = m.d; setEmbedPlaying(m.playing); }
    else if (m.t === 'state') { live.current.playing = m.playing; setEmbedPlaying(m.playing); }
    else if (m.t === 'ended') save();
  };

  if (src.embed) {
    const b = { paddingVertical: 10, paddingHorizontal: 22, backgroundColor: KC.surface } as const;
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1 }}>
          <ExternalVideo ref={embed} kind={src.embed.kind} id={src.embed.id} playerId={config?.dailymotionPlayerId} startSeconds={startSec} limitSeconds={0} onMessage={onEmbed} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, padding: 14, backgroundColor: KC.bgBottom }}>
          <Focusable accessibilityRole="button" accessibilityLabel="-10 s" radius={999} onPress={() => embed.current?.seek(Math.max(0, live.current.pos - 10))} style={b}>
            <Txt weight="bold" size={18} color={KC.text}>⟲ 10 s</Txt>
          </Focusable>
          <Focusable first accessibilityRole="button" accessibilityLabel={embedPlaying ? t('tv.pause') : t('tv.play')} radius={999}
            onPress={() => (embedPlaying ? embed.current?.pause() : embed.current?.play())} style={[b, { paddingHorizontal: 30, backgroundColor: KC.accent }]}>
            <Txt weight="extrabold" size={18} color={KC.onAccent}>{embedPlaying ? `❚❚ ${t('tv.pause')}` : `▶ ${t('tv.play')}`}</Txt>
          </Focusable>
          <Focusable accessibilityRole="button" accessibilityLabel="+10 s" radius={999} onPress={() => embed.current?.seek(live.current.pos + 10)} style={b}>
            <Txt weight="bold" size={18} color={KC.text}>10 s ⟳</Txt>
          </Focusable>
        </View>
      </View>
    );
  }
  if (!src.uri || failed) return <Message text={src.notReady ? t('tv.notReady') : t('tv.cannotPlay')} />;
  return <VideoView player={player} style={{ flex: 1, backgroundColor: '#000' }} nativeControls contentFit="contain" allowsPictureInPicture={false} hasTVPreferredFocus focusable />;
}
