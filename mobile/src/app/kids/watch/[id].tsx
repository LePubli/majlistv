// Lecteur de l'espace enfant : vidéo du serveur (HLS), archive.org, YouTube / Vimeo intégrés. Reprise propre à l'enfant (position envoyée toutes les 10 s,
// à la pause et en quittant), temps du jour compté par le « ping » du serveur, message sympa quand la durée est écoulée. Pas d'incrustation, pas de
// lecture en arrière-plan, pas de téléchargement ni de diffusion : l'enfant reste dans l'espace.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { formatDuration } from '@/lib/format';
import { pickSource } from '@/lib/playback';
import { registerMedia } from '@/lib/mediaRegistry';
import type { EmbedMessage } from '@/lib/embed';
import { KC, PROGRESS_EVERY_MS, avatarEmoji, bandKey, isTimeUp, leftMin, progressBody } from '@/lib/kids';
import type { KidCard, Talk } from '@/lib/types';
import { ExternalVideo, PlayerHandle } from '@/components/ExternalVideo';
import { KButton, KScreen, KTxt, KidVideoCard, starsText } from '@/components/kids/KidUi';

const back = () => { if (router.canGoBack()) router.back(); else router.replace('/kids/home'); };

export default function KidsWatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { kid } = useKid();
  if (!kid) return <Redirect href="/kids" />;
  return <Watch key={`${kid.profile.id}:${id}`} id={String(id)} />;
}

function Watch({ id }: { id: string }) {
  const { t, locale } = useSession();
  const { kid, kidApi, epoch, time } = useKid();
  const talk = useAsync(() => kidApi.get<Talk>(`/talks/${id}`), [id, epoch]);
  const list = useAsync(async () => (await kidApi.get<{ talks: KidCard[] }>('/kids/talks').catch(() => ({ talks: [] as KidCard[] }))).talks, [id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = talk.error instanceof ApiError ? talk.error : null;
  const timeUp = !!time?.timeUp || isTimeUp(err);

  const frame = (body: React.ReactNode) => <KScreen>{body}</KScreen>;
  const topBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('kdBack')} hitSlop={8} onPress={back}
        style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
        <Feather name="arrow-left" size={18} color={KC.text} /><KTxt weight="extrabold" size={14}>{t('kdBack').replace('← ', '')}</KTxt>
      </Pressable>
    </View>
  );
  if (timeUp) {
    return frame(<>{topBar}<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }} accessibilityRole="alert">
      <KTxt size={56} style={{ lineHeight: 68 }}>🌙</KTxt><KTxt weight="extrabold" size={24} style={{ textAlign: 'center' }}>{t('kdTimeUpTitle')}</KTxt>
      <KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdTimeUpText')}</KTxt></View></>);
  }
  if (talk.loading && !talk.data) return frame(<>{topBar}<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><KTxt>…</KTxt></View></>);
  if (!talk.data || talk.data.locked) {
    return frame(<>{topBar}<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <KTxt style={{ textAlign: 'center' }} color={KC.text2}>{err && err.status !== 404 && err.status !== 403 ? t('common.error') : t('kdUnavailableTalk')}</KTxt>
      {err && err.status !== 404 && err.status !== 403 ? <KButton label={t('common.retry')} variant="soft" onPress={talk.reload} /> : null}</View></>);
  }
  return <Player talk={talk.data} next={(list.data ?? []).filter((x) => x.id !== id).slice(0, 8)} stars={(list.data ?? []).find((x) => x.id === id)?.stars ?? null} topBar={topBar} locale={locale} kidName={kid?.profile.name ?? ''} />;
}

function Player({ talk, next, stars, topBar, locale, kidName }: { talk: Talk; next: KidCard[]; stars: number | null; topBar: React.ReactNode; locale: string; kidName: string }) {
  const { t } = useSession();
  const { kid, kidApi, time } = useKid();
  const src = useMemo(() => pickSource(talk, API_URL), [talk]);
  const startMs = talk.resumeMs ?? 0;
  const embedRef = useRef<PlayerHandle>(null);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const sourceObj = useMemo(() => (src.uri ? { uri: src.uri, metadata: { title: talk.title } } : null), [src.uri]); // eslint-disable-line react-hooks/exhaustive-deps
  const player = useVideoPlayer(sourceObj, (p) => { p.staysActiveInBackground = false; p.showNowPlayingNotification = false; p.timeUpdateEventInterval = 1; });
  const { isPlaying: nativePlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Position / durée connues (lecteur natif ou lecteur intégré), pour la reprise.
  const live = useRef({ pos: 0, dur: talk.durationSeconds || 0, playing: false });
  live.current.playing = src.embed ? live.current.playing : nativePlaying;

  const save = () => {
    const b = progressBody(live.current.pos, live.current.dur || talk.durationSeconds || 0);
    if (b) void kidApi.put(`/kids/progress/${talk.id}`, b).catch(() => { /* hors connexion ou temps écoulé : la prochaine sauvegarde réessaie */ });
  };
  useEffect(() => {
    const timer = setInterval(() => { if (live.current.playing) save(); }, PROGRESS_EVERY_MS);
    return () => { clearInterval(timer); save(); };
  }, [talk.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!nativePlaying && !src.embed) save(); }, [nativePlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const started = useRef(false);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      setFailed(false);
      if (!started.current) { started.current = true; if (startMs > 0) player.currentTime = startMs / 1000; player.play(); }
    } else if (status === 'error') setFailed(true);
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => { live.current.pos = currentTime; if (player.duration) live.current.dur = player.duration; });
  useEventListener(player, 'playToEnd', () => { live.current.pos = live.current.dur; setEnded(true); save(); });

  function onEmbed(m: EmbedMessage) {
    if (m.t === 'time') { live.current.pos = m.c; live.current.playing = m.playing; if (m.d) live.current.dur = m.d; }
    else if (m.t === 'state') { live.current.playing = m.playing; setFailed(false); }
    else if (m.t === 'ready') { setFailed(false); if (m.d) live.current.dur = m.d; }
    else if (m.t === 'ended') { setEnded(true); save(); }
    else if (m.t === 'error') setFailed(true);
  }

  // La prière met la lecture en pause (écran de pause du site) : même branchement que la fiche adulte.
  useEffect(() => registerMedia({
    isPlaying: () => live.current.playing && (!!src.embed || !player.muted),
    pause: () => { if (src.embed) embedRef.current?.pause(); else player.pause(); },
    play: () => { if (src.embed) embedRef.current?.play(); else player.play(); },
  }), [player, src.embed]);

  const left = leftMin(time);
  const playable = !!src.uri || !!src.embed;
  const dur = formatDuration(talk.durationSeconds || 0);
  const got = starsText(stars);
  return (
    <KScreen>
      {topBar}
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: 14 }}>
        {left != null && left <= 5 ? <KTxt weight="bold" color={KC.accent} style={{ paddingHorizontal: 20 }} accessibilityRole="alert">⏳ {t('kdTimeLow', { n: left })}</KTxt> : null}
        <View style={{ aspectRatio: 16 / 9, backgroundColor: '#000', marginHorizontal: 12, borderRadius: 20, overflow: 'hidden', justifyContent: 'center' }}>
          {src.embed ? (
            <ExternalVideo ref={embedRef} kind={src.embed.kind} id={src.embed.id} startSeconds={startMs / 1000} limitSeconds={0} onMessage={onEmbed} />
          ) : src.uri ? (
            <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" allowsPictureInPicture={false} fullscreenOptions={{ enable: true }} />
          ) : (
            <View style={{ alignItems: 'center', padding: 24 }}><KTxt style={{ textAlign: 'center' }} color={KC.text2}>{src.notReady ? t('processingMsg') : t('playerUnavailable')}</KTxt></View>
          )}
          {failed ? (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(7,11,39,0.92)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <KTxt style={{ textAlign: 'center' }}>{t('talk.playerError')}</KTxt>
              <KButton label={t('common.retry')} variant="soft" onPress={() => { setFailed(false); if (src.uri) void player.replaceAsync({ uri: src.uri }); }} />
            </View>
          ) : null}
          {ended && playable ? (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(7,11,39,0.92)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <KTxt size={40} style={{ lineHeight: 50 }}>{avatarEmoji(kid?.profile.avatar ?? 'star')}</KTxt>
              <KTxt weight="extrabold" size={18} style={{ textAlign: 'center' }}>{t('kids.done')}</KTxt>
              <KButton label={t('kdBack').replace('← ', '')} onPress={back} />
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          <KTxt weight="extrabold" size={22} accessibilityRole="header">{talk.title}</KTxt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {talk.speaker ? <Chip text={`🎤 ${talk.speaker}`} /> : null}
            {dur ? <Chip text={`⏱ ${dur}`} /> : null}
            {kid ? <Chip text={`🎈 ${t(bandKey(kid.profile.band))}`} /> : null}
            {got ? <Chip text={got} gold /> : null}
          </View>
          {talk.description ? (
            <View style={{ gap: 6, padding: 16, borderRadius: 20, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line, marginTop: 6 }}>
              <KTxt weight="extrabold" size={17}>💡 {t('kdAbout')}</KTxt>
              <KTxt color={KC.text2}>{talk.description}</KTxt>
            </View>
          ) : null}
        </View>

        {next.length > 0 ? (
          <View style={{ gap: 10, paddingHorizontal: 20 }}>
            <KTxt weight="extrabold" size={20} accessibilityRole="header">{t('kdNext')}</KTxt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {next.map((x) => <View key={x.id} style={{ width: '47.5%' }}><KidVideoCard x={x} onPress={() => router.replace({ pathname: '/kids/watch/[id]', params: { id: x.id } })} /></View>)}
            </View>
          </View>
        ) : null}
        <KTxt size={12} color={KC.muted} style={{ textAlign: 'center', paddingHorizontal: 20 }}>{kidName ? `${avatarEmoji(kid?.profile.avatar ?? 'star')} ${kidName} · ` : ''}{t('kids.lockHint')}</KTxt>
      </ScrollView>
    </KScreen>
  );
}

function Chip({ text, gold }: { text: string; gold?: boolean }) {
  return <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: KC.surface, borderWidth: 1, borderColor: KC.line }}><KTxt size={13} weight="bold" color={gold ? KC.accent : KC.text2}>{text}</KTxt></View>;
}
