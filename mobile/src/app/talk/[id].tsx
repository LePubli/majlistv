// Fiche et lecteur d'une conférence, fidèle à la PWA : lecteur (vidéo du serveur, archive.org, YouTube/Vimeo intégrés),
// actions, « Apprendre », onglets (résumé, chapitres, transcription, notes, à propos), série, « À suivre », aperçu verrouillé.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { VideoView, isPictureInPictureSupported, useVideoPlayer } from 'expo-video';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { API_URL, SITE_URL } from '@/lib/config';
import { formatDuration } from '@/lib/format';
import { ProgressTracker, resumeStartMs } from '@/lib/progress';
import { registerMedia } from '@/lib/mediaRegistry';
import { nextSpeed, pickSource, platformName } from '@/lib/playback';
import { levelLabel, LEVEL_COLOR } from '@/lib/media';
import type { EmbedMessage } from '@/lib/embed';
import type { Card, Insights, SeriesCtx, Talk } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, IconButton, Loading, Txt, screenStyle } from '@/components/ui';
import { Poster, TalkCard } from '@/components/TalkCard';
import { Rail } from '@/components/Rail';
import { AddToListModal } from '@/components/AddToListModal';
import { ExternalVideo, PlayerHandle } from '@/components/ExternalVideo';
import { TalkTabs } from '@/components/talk/TalkTabs';
import { ActionTile, LearnCard, LockCard, SeriesPanel } from '@/components/talk/Panels';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function TalkScreen() {
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const { api, user, t, dirStyle } = useSession();
  const talk = useAsync(() => api.get<Talk>(`/talks/${id}`), [id, user?.id]);

  if (talk.loading && !talk.data) return <SafeAreaView style={[screenStyle, dirStyle]}><Loading /></SafeAreaView>;
  if (!talk.data) {
    const notFound = talk.error instanceof ApiError && talk.error.status === 404;
    return (
      <SafeAreaView style={[screenStyle, dirStyle]}>
        <View style={{ padding: 18 }}><IconButton label={t('common.close')} onPress={goBack}><Feather name="arrow-left" size={20} color={colors.text} /></IconButton></View>
        <ErrorBox message={notFound ? t('talk.notFound') : undefined} onRetry={notFound ? undefined : talk.reload} />
      </SafeAreaView>
    );
  }
  // key : un changement de session (connexion) ou de conférence recrée proprement le lecteur.
  return <TalkView key={`${talk.data.id}:${user?.id ?? 'guest'}`} talk={talk.data} atMs={Number(at) > 0 ? Number(at) : undefined} />;
}

function TalkView({ talk, atMs }: { talk: Talk; atMs?: number }) {
  const { api, user, t, locale, isRTL, dirStyle, favs, toggleFav, config } = useSession();
  const src = useMemo(() => pickSource(talk, API_URL), [talk]);
  const locked = !!talk.locked;
  const startMs = locked ? 0 : atMs ?? resumeStartMs(talk.resumeMs, talk.durationSeconds);
  const meta = { title: talk.title, artist: talk.speaker, artwork: talk.posterUrl ?? undefined };
  const sourceObj = useMemo(() => (src.uri ? { uri: src.uri, metadata: meta } : null), [src.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const videoRef = useRef<VideoView>(null);
  const embedRef = useRef<PlayerHandle>(null);
  const [audioMode, setAudioMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState(startMs / 1000);
  const [embedPlaying, setEmbedPlaying] = useState(false);
  const [embedDuration, setEmbedDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const fav = favs.has(talk.id);

  // Vidéo native : lecture en arrière-plan et notification de lecture (le son continue écran éteint).
  const player = useVideoPlayer(sourceObj, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
  });
  const { isPlaying: nativePlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const isPlaying = src.embed ? embedPlaying : nativePlaying;

  const started = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      setFailed(false);
      if (pendingSeek.current !== null) {
        player.currentTime = pendingSeek.current;
        pendingSeek.current = null;
        player.play();
      } else if (!started.current) {
        started.current = true;
        if (startMs > 0) player.currentTime = startMs / 1000;
        player.play();
      }
    } else if (status === 'error') setFailed(true);
  });
  useEventListener(player, 'playToEnd', () => setEnded(true));

  // Progression envoyée au serveur (même reprise que sur le site) ; rien pour un visiteur ou un aperçu.
  const tracker = useMemo(
    () => new ProgressTracker((p) => api.put(`/me/progress/${talk.id}`, p).then(() => undefined), { enabled: !!user && !locked }),
    [api, talk.id, user?.id, locked], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setPos(currentTime);
    tracker.update(currentTime * 1000, (player.duration || 0) * 1000, player.playing);
    // Fichier public (archive.org) : l'aperçu est limité ici, le serveur ne peut pas le couper.
    if (locked && talk.source !== 'upload' && talk.previewSeconds && currentTime >= talk.previewSeconds) { player.pause(); player.currentTime = 0; }
  });
  useEffect(() => { if (!isPlaying) void tracker.flush(); }, [isPlaying, tracker]);
  useEffect(() => () => { void tracker.flush(); }, [tracker]);
  useEffect(() => {
    const s = AppState.addEventListener('change', (st) => { if (st !== 'active') void tracker.flush(); });
    return () => s.remove();
  }, [tracker]);

  function onEmbed(m: EmbedMessage) {
    if (m.t === 'time') {
      setPos(m.c); setEmbedPlaying(m.playing); if (m.d) setEmbedDuration(m.d);
      tracker.update(m.c * 1000, (m.d || talk.durationSeconds || 0) * 1000, m.playing);
    } else if (m.t === 'state') { setEmbedPlaying(m.playing); setFailed(false); }
    else if (m.t === 'ready') { setFailed(false); if (m.d) setEmbedDuration(m.d); }
    else if (m.t === 'ended') setEnded(true);
    else if (m.t === 'error') setFailed(true);
  }

  const insights = useAsync(
    async () => (talk.playbackToken ? await api.get<Insights>(`/talks/${talk.id}/insights`, { t: talk.playbackToken, lang: locale }).catch(() => null) : null),
    [talk.id, locale],
  );
  const series = useAsync(async () => (await api.get<{ series: SeriesCtx | null }>(`/talks/${talk.id}/series`).catch(() => ({ series: null }))).series, [talk.id, user?.id]);
  const similar = useAsync(async () => await api.get<Card[]>(`/talks/${talk.id}/similar`).catch(() => [] as Card[]), [talk.id]);

  const seekMs = (ms: number) => {
    setEnded(false);
    if (src.embed) { embedRef.current?.seek(ms / 1000); embedRef.current?.play(); } else { player.currentTime = ms / 1000; player.play(); }
  };
  // L'écran de pause de la prière peut mettre ce lecteur en pause puis le reprendre (sans toucher à un lecteur muet).
  const live = useRef({ playing: false, embed: false });
  live.current = { playing: isPlaying, embed: !!src.embed };
  useEffect(() => registerMedia({
    isPlaying: () => live.current.playing && (live.current.embed || !player.muted),
    pause: () => { if (live.current.embed) embedRef.current?.pause(); else player.pause(); },
    play: () => { if (live.current.embed) embedRef.current?.play(); else player.play(); },
  }), [player]);
  const play = () => (src.embed ? embedRef.current?.play() : player.play());
  const pause = () => (src.embed ? embedRef.current?.pause() : player.pause());

  async function switchMode(audio: boolean) {
    const target = audio ? src.audioUri : src.uri;
    if (!target) return;
    pendingSeek.current = player.currentTime;
    setAudioMode(audio);
    await player.replaceAsync({ uri: target, metadata: meta });
  }
  async function retry() {
    setFailed(false);
    if (src.embed) return; // la WebView se recharge en rouvrant la fiche
    pendingSeek.current = player.currentTime;
    const target = audioMode && src.audioUri ? src.audioUri : src.uri;
    if (target) await player.replaceAsync({ uri: target, metadata: meta });
  }
  function needLogin(go: () => void) { if (!user) router.push({ pathname: '/login', params: { mode: 'register' } }); else go(); }
  async function follow() {
    if (!talk.speakerSlug) return;
    const next = !following;
    setFollowing(next);
    try { if (next) await api.put(`/speakers/${talk.speakerSlug}/follow`); else await api.del(`/speakers/${talk.speakerSlug}/follow`); }
    catch { setFollowing(!next); }
  }

  const playable = !!src.uri || !!src.embed;
  const pip = !!src.uri && !audioMode && isPictureInPictureSupported();
  const nextEp = series.data?.next;
  const dur = formatDuration(talk.durationSeconds || embedDuration);
  const eyebrow = [series.data?.title, talk.category].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}>
      <View style={{ backgroundColor: '#000' }}>
        <View style={{ aspectRatio: 16 / 9, width: '100%', backgroundColor: '#000', justifyContent: 'center' }}>
          {src.embed ? (
            <ExternalVideo ref={embedRef} kind={src.embed.kind} id={src.embed.id} startSeconds={startMs / 1000} limitSeconds={locked ? talk.previewSeconds || 120 : 0} onMessage={onEmbed} />
          ) : src.uri && !audioMode ? (
            <VideoView ref={videoRef} player={player} style={{ flex: 1 }} nativeControls contentFit="contain" allowsPictureInPicture fullscreenOptions={{ enable: true }} />
          ) : (
            <View style={{ flex: 1 }}>
              <Poster talk={talk} radiusPx={0} />
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,9,6,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
                {audioMode ? (
                  <><Feather name="headphones" size={40} color={colors.goldLight} /><Txt weight="bold">{t('talk.audio')}</Txt></>
                ) : (
                  <Txt style={{ textAlign: 'center' }}>{src.external ? t('playerUnavailable') : talk.playerError || (src.notReady ? t('processingMsg') : t('talk.notReady'))}</Txt>
                )}
              </View>
            </View>
          )}
          {failed ? (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,9,6,0.88)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <Txt style={{ textAlign: 'center' }}>{t('talk.playerError')}</Txt>
              <Button label={t('common.retry')} variant="dark" onPress={retry} />
            </View>
          ) : null}
          {ended && (locked || nextEp) ? (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,9,6,0.9)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              {locked ? <Txt weight="extrabold" size={16} style={{ textAlign: 'center' }}>{t('lkEndTitle')}</Txt> : <Txt weight="extrabold" size={16} style={{ textAlign: 'center' }}>{t('nextTitle')} : {nextEp?.title}</Txt>}
              {!locked && nextEp ? <Button label={t('playNow')} onPress={() => router.replace({ pathname: '/talk/[id]', params: { id: nextEp.id } })} /> : null}
              <Button label={t('fromStart')} variant="dark" onPress={() => seekMs(0)} />
            </View>
          ) : null}
          <View style={{ position: 'absolute', top: 8, start: 8 }}>
            <IconButton label={t('common.close')} onPress={goBack} style={{ backgroundColor: 'rgba(11,9,6,0.55)', borderWidth: 0 }}>
              <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} />
            </IconButton>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {playable ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <IconButton label={t('talk.back10')} size={52} onPress={() => seekMs(Math.max(0, pos * 1000 - 10_000))}><Feather name="rotate-ccw" size={22} color={colors.text} /></IconButton>
            <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? t('talk.pause') : t('talk.play')} onPress={() => (isPlaying ? pause() : play())}
              style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Feather name={isPlaying ? 'pause' : 'play'} size={28} color={colors.onGold} />
            </Pressable>
            <IconButton label={t('talk.fwd10')} size={52} onPress={() => seekMs(pos * 1000 + 10_000)}><Feather name="rotate-cw" size={22} color={colors.text} /></IconButton>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('talk.speed')} ${speed}×`}
              onPress={() => { const s = nextSpeed(speed); setSpeed(s); if (src.embed) embedRef.current?.rate(s); else player.playbackRate = s; }}
              style={{ minWidth: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
              <Txt weight="extrabold" size={14}>{speed}×</Txt>
            </Pressable>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          {eyebrow ? <Txt weight="bold" size={12} color={colors.goldLight} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{eyebrow}</Txt> : null}
          <Txt weight="extrabold" size={22} accessibilityRole="header">{talk.title}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            {talk.speaker ? (
              <Pressable accessibilityRole="link" disabled={!talk.speakerSlug} onPress={() => talk.speakerSlug && router.push({ pathname: '/speaker/[slug]', params: { slug: talk.speakerSlug } })}>
                <Txt weight="bold" size={14} color={colors.goldLight}>{talk.speaker}</Txt>
              </Pressable>
            ) : null}
            {dur ? <Txt size={14} color={colors.muted}>{dur}</Txt> : null}
            {talk.level ? <Txt weight="bold" size={12} color={LEVEL_COLOR[talk.level] ?? colors.muted}>{levelLabel(talk.level, t)}</Txt> : null}
            {talk.speakerSlug ? (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: following }} onPress={() => needLogin(follow)}
                style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: following ? colors.goldTint : colors.panel, borderWidth: 1, borderColor: following ? colors.goldLine : colors.border }}>
                <Txt weight="bold" size={12} color={following ? colors.goldLight : colors.text}>{following ? t('nfUnfollow') : t('nfFollow')}</Txt>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionTile icon="bookmark" label={fav ? t('removeFav') : t('addFav')} active={fav} onPress={() => needLogin(() => { void toggleFav(talk.id); })} />
          <ActionTile icon="list" label={t('wbList')} onPress={() => needLogin(() => setListOpen(true))} />
          <ActionTile icon="share-2" label={t('wbShare')} onPress={() => { void Share.share({ message: `${talk.title} — ${SITE_URL}/talks/${talk.id}` }); }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionTile icon="headphones" label={audioMode ? t('audBackVideo') : t('audMode')} active={audioMode} disabled={!src.audioUri} onPress={() => switchMode(!audioMode)} />
          <ActionTile icon="minimize-2" label={t('talk.pip')} disabled={!pip} onPress={() => { void videoRef.current?.startPictureInPicture(); }} />
        </View>

        {locked ? <LockCard talk={talk} /> : <LearnCard talk={talk} />}

        <TalkTabs talk={talk} insights={insights.data} positionMs={pos * 1000} onSeek={seekMs} getPositionMs={() => pos * 1000} />

        {series.data ? <SeriesPanel ctx={series.data} /> : null}
      </ScrollView>
      {similar.data && similar.data.length ? (
        <View style={{ paddingBottom: 24 }}>
          <Rail title={t('sameVein')} items={similar.data} render={(c, w) => <TalkCard talk={c} width={w} />} />
        </View>
      ) : null}
      <AddToListModal talkId={talk.id} visible={listOpen} onClose={() => setListOpen(false)} />
    </SafeAreaView>
  );
}
