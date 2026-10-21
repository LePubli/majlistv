// Fiche et lecteur d'une conférence : lecture HLS, plein écran, incrustation, audio seul (écran éteint),
// reprise synchronisée avec le site, résumé et chapitres, favori. Aperçu de 2 min si pas d'abonnement.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { VideoView, isPictureInPictureSupported, useVideoPlayer } from 'expo-video';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { API_URL, SITE_URL } from '@/lib/config';
import { formatClock, formatDuration } from '@/lib/format';
import { ProgressTracker, resumeStartMs } from '@/lib/progress';
import { currentChapter, nextSpeed, pickSource, platformName } from '@/lib/playback';
import type { Insights, Talk } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, IconButton, Loading, Txt, screenStyle } from '@/components/ui';
import { Poster } from '@/components/TalkCard';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function TalkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  // key : un changement de session (connexion) recharge la fiche et recrée proprement le lecteur.
  return <TalkView key={`${talk.data.id}:${user?.id ?? 'guest'}`} talk={talk.data} />;
}

function TalkView({ talk }: { talk: Talk }) {
  const { api, user, t, locale, isRTL, dirStyle } = useSession();
  const src = useMemo(() => pickSource(talk, API_URL), [talk]);
  const locked = !!talk.locked;
  const startMs = locked ? 0 : resumeStartMs(talk.resumeMs, talk.durationSeconds);
  const meta = { title: talk.title, artist: talk.speaker, artwork: talk.posterUrl ?? undefined };
  const sourceObj = useMemo(() => (src.uri ? { uri: src.uri, metadata: meta } : null), [src.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const videoRef = useRef<VideoView>(null);
  const [audioMode, setAudioMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(false);
  const [fav, setFav] = useState(!!talk.favorite);
  const [tab, setTab] = useState<'summary' | 'chapters'>('summary');

  // Lecture en arrière-plan et notification de lecture : l'écran peut s'éteindre, le son continue.
  const player = useVideoPlayer(sourceObj, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Reprise : position du serveur au premier chargement ; position conservée quand on change vidéo ↔ audio.
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
    } else if (status === 'error') {
      setFailed(true);
    }
  });

  // Progression envoyée au serveur (même reprise que sur le site) ; rien pour un visiteur ou un aperçu.
  const tracker = useMemo(
    () => new ProgressTracker((p) => api.put(`/me/progress/${talk.id}`, p).then(() => undefined), { enabled: !!user && !locked }),
    [api, talk.id, user?.id, locked], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setPos(currentTime);
    tracker.update(currentTime * 1000, (player.duration || 0) * 1000, player.playing);
    // Fichier public (archive.org) : l'aperçu est limité ici, le serveur ne peut pas le couper.
    if (locked && talk.source !== 'upload' && talk.previewSeconds && currentTime >= talk.previewSeconds) {
      player.pause();
      player.currentTime = 0;
    }
  });
  useEffect(() => { if (!isPlaying) void tracker.flush(); }, [isPlaying, tracker]);
  useEffect(() => () => { void tracker.flush(); }, [tracker]);
  useEffect(() => {
    const s = AppState.addEventListener('change', (st) => { if (st !== 'active') void tracker.flush(); });
    return () => s.remove();
  }, [tracker]);

  const insights = useAsync(
    async () => (talk.playbackToken ? await api.get<Insights>(`/talks/${talk.id}/insights`, { t: talk.playbackToken, lang: locale }).catch(() => null) : null),
    [talk.id, locale],
  );

  async function switchMode(audio: boolean) {
    const target = audio ? src.audioUri : src.uri;
    if (!target) return;
    pendingSeek.current = player.currentTime;
    setAudioMode(audio);
    await player.replaceAsync({ uri: target, metadata: meta });
  }

  async function retry() {
    setFailed(false);
    pendingSeek.current = player.currentTime;
    const target = audioMode && src.audioUri ? src.audioUri : src.uri;
    if (target) await player.replaceAsync({ uri: target, metadata: meta });
  }

  async function toggleFav() {
    if (!user) { router.push('/login'); return; }
    const next = !fav;
    setFav(next);
    try {
      if (next) await api.put(`/me/favorites/${talk.id}`); else await api.del(`/me/favorites/${talk.id}`);
    } catch { setFav(!next); }
  }

  const chapters = insights.data?.chapters ?? [];
  const activeChapter = currentChapter(chapters, pos * 1000);
  const canPlay = !!src.uri;
  const pip = canPlay && !audioMode && isPictureInPictureSupported();
  const dur = formatDuration(talk.durationSeconds);

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}>
      <View style={{ backgroundColor: '#000' }}>
        <View style={{ aspectRatio: 16 / 9, width: '100%', backgroundColor: '#000', justifyContent: 'center' }}>
          {canPlay && !audioMode ? (
            <VideoView
              ref={videoRef}
              player={player}
              style={{ flex: 1 }}
              nativeControls
              contentFit="contain"
              allowsPictureInPicture
              fullscreenOptions={{ enable: true }}
            />
          ) : (
            <View style={{ flex: 1 }}>
              <Poster talk={talk} radiusPx={0} />
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,9,6,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
                {audioMode ? (
                  <>
                    <Feather name="headphones" size={40} color={colors.goldLight} />
                    <Txt weight="bold" color={colors.text}>{t('talk.audio')}</Txt>
                  </>
                ) : src.external ? (
                  <>
                    <Txt style={{ textAlign: 'center' }}>{t('talk.externalOnly', { platform: platformName(talk.source) })}</Txt>
                    <Button label={t('talk.openSite')} onPress={() => Linking.openURL(`${SITE_URL}/talks/${talk.id}`)} />
                  </>
                ) : (
                  <Txt style={{ textAlign: 'center' }}>{talk.playerError || t('talk.notReady')}</Txt>
                )}
              </View>
            </View>
          )}
          {failed ? (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,9,6,0.85)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <Txt style={{ textAlign: 'center' }}>{t('talk.playerError')}</Txt>
              <Button label={t('common.retry')} variant="dark" onPress={retry} />
            </View>
          ) : null}
          <View style={{ position: 'absolute', top: 8, start: 8 }}>
            <IconButton label={t('common.close')} onPress={goBack} style={{ backgroundColor: 'rgba(11,9,6,0.55)', borderWidth: 0 }}>
              <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} />
            </IconButton>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
        {canPlay ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <IconButton label={t('talk.back10')} size={52} onPress={() => player.seekBy(-10)}><Feather name="rotate-ccw" size={22} color={colors.text} /></IconButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? t('talk.pause') : t('talk.play')}
              onPress={() => (isPlaying ? player.pause() : player.play())}
              style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Feather name={isPlaying ? 'pause' : 'play'} size={28} color={colors.onGold} />
            </Pressable>
            <IconButton label={t('talk.fwd10')} size={52} onPress={() => player.seekBy(10)}><Feather name="rotate-cw" size={22} color={colors.text} /></IconButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('talk.speed')} ${speed}×`}
              onPress={() => { const s = nextSpeed(speed); setSpeed(s); player.playbackRate = s; }}
              style={{ minWidth: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Txt weight="extrabold" size={14}>{speed}×</Txt>
            </Pressable>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Txt weight="extrabold" size={21}>{talk.title}</Txt>
          <Txt size={14} color={colors.muted}>{[talk.speaker, dur, formatClock(pos) !== '0:00' ? formatClock(pos) : ''].filter(Boolean).join(' · ')}</Txt>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionTile icon="headphones" label={audioMode ? t('talk.video') : t('talk.audio')} active={audioMode}
            disabled={!src.audioUri} onPress={() => switchMode(!audioMode)} />
          <ActionTile icon="minimize-2" label={t('talk.pip')} disabled={!pip} onPress={() => { void videoRef.current?.startPictureInPicture(); }} />
          <ActionTile icon="bookmark" label={fav ? t('talk.unfav') : t('talk.fav')} active={fav} onPress={toggleFav} />
        </View>

        {locked ? (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine, gap: 10 }}>
            <Txt weight="extrabold" size={15} color={colors.goldLight}>{t('talk.preview', { min: Math.round((talk.previewSeconds || 120) / 60) })}</Txt>
            <Txt size={14} color={colors.text2}>{t('talk.previewHelp')}</Txt>
            <Button label={t('talk.openSite')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/talks/${talk.id}`)} />
          </View>
        ) : null}

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {(['summary', 'chapters'] as const).map((k) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)}
              style={{ minHeight: 46, paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
              <Txt weight={tab === k ? 'bold' : 'semibold'} size={14} color={tab === k ? colors.goldLight : colors.muted}>{t(k === 'summary' ? 'talk.summary' : 'talk.chapters')}</Txt>
            </Pressable>
          ))}
        </View>

        {tab === 'summary' ? (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
            {insights.data?.summary || talk.description ? <Txt color={colors.text2} style={{ lineHeight: 23 }}>{insights.data?.summary || talk.description}</Txt> : <Txt color={colors.muted}>{t('talk.noSummary')}</Txt>}
            {insights.data?.keyPoints?.length ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Txt weight="extrabold" size={15}>{t('talk.keyPoints')}</Txt>
                {insights.data.keyPoints.map((k, i) => <Txt key={i} size={14} color={colors.text2}>• {k}</Txt>)}
              </View>
            ) : null}
          </View>
        ) : chapters.length === 0 ? (
          <Txt color={colors.muted}>{t('talk.noChapters')}</Txt>
        ) : (
          <View style={{ gap: 4 }}>
            {chapters.map((c, i) => (
              <Pressable key={i} accessibilityRole="button" onPress={() => { player.currentTime = c.s / 1000; player.play(); }}
                style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: i === activeChapter ? colors.goldTint : 'transparent' }}>
                <Txt weight="bold" size={13} color={colors.goldLight} style={{ minWidth: 52 }}>{formatClock(c.s / 1000)}</Txt>
                <Txt weight={i === activeChapter ? 'bold' : 'medium'} size={14} style={{ flex: 1 }}>{c.t}</Txt>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionTile({ icon, label, onPress, active, disabled }: {
  icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress?: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4,
        backgroundColor: active ? colors.goldTint : colors.panel, borderWidth: 1, borderColor: active ? colors.goldLine : colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Feather name={icon} size={20} color={active ? colors.goldLight : colors.text} />
      <Txt weight="bold" size={12} color={active ? colors.goldLight : colors.text}>{label}</Txt>
    </Pressable>
  );
}
