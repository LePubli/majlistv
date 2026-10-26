// Lecteur hors connexion (22b-6) : lit le fichier téléchargé, sans réseau. Reprise là où on s'était arrêté (envoyée au serveur à la reconnexion),
// vitesse, son en arrière-plan. Un téléchargement expiré ne se lit pas : il se renouvelle à la reconnexion.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSession } from '@/lib/session';
import { useDownloads } from '@/lib/downloadStore';
import { resumeFor } from '@/lib/downloads';
import type { OfflinePack } from '@/lib/offlinePack';
import { OfflineTabs } from '@/components/OfflineTabs';
import { nextSpeed } from '@/lib/playback';
import { registerMedia } from '@/lib/mediaRegistry';
import { colors } from '@/lib/theme';
import { Button, IconButton, Txt, screenStyle } from '@/components/ui';

function goBack() { if (router.canGoBack()) router.back(); else router.replace('/downloads'); }

export default function OfflineScreen() {
  usePreventScreenCapture('offline');   // pas de capture ni d'enregistrement d'écran pendant la lecture d'un fichier téléchargé
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, isRTL, dirStyle } = useSession();
  const dl = useDownloads();
  const rec = dl.get(String(id));
  const header = (
    <View style={{ padding: 18 }}>
      <IconButton label={t('common.close')} onPress={goBack}><Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} /></IconButton>
    </View>
  );
  if (!dl.loaded) return <SafeAreaView style={[screenStyle, dirStyle]}>{header}</SafeAreaView>;
  if (!rec) return <SafeAreaView style={[screenStyle, dirStyle]}>{header}<View style={{ padding: 18 }}><Txt color={colors.text2}>{t('dl.notFound')}</Txt></View></SafeAreaView>;
  const status = dl.statusOf(rec);
  if (!status.playable) {
    return (
      <SafeAreaView style={[screenStyle, dirStyle]}>
        {header}
        <View style={{ padding: 18, gap: 14 }}>
          <Txt weight="extrabold" size={20}>{rec.title}</Txt>
          <Txt color={colors.text2}>{status.state === 'expired' ? t('dl.expiredHelp') : t('dl.licenceBad')}</Txt>
          {dl.clockWarn ? <Txt size={13} color="#FF8A7A">{t('dl.clockWarn')}</Txt> : null}
          {dl.online ? <Button label={t('dl.renew')} onPress={() => { void dl.renew(true); }} /> : <Txt size={13} color={colors.muted}>{t('dl.offline')}</Txt>}
        </View>
      </SafeAreaView>
    );
  }
  return <OfflinePlayer key={rec.talkId} talkId={rec.talkId} />;
}

function OfflinePlayer({ talkId }: { talkId: string }) {
  const { t, isRTL, dirStyle } = useSession();
  const dl = useDownloads();
  const rec = dl.get(talkId)!;
  const uri = dl.uriOf(rec);
  const poster = dl.posterUriOf(rec);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(false);
  const [pack, setPack] = useState<OfflinePack | null>(null);
  useEffect(() => { void dl.packOf(talkId).then(setPack); }, [talkId, rec.packAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const started = useRef(false);
  const startMs = useRef(resumeFor(rec));
  const player = useVideoPlayer({ uri, metadata: { title: rec.title, artist: rec.speaker, artwork: poster ?? undefined } }, (p) => {
    p.staysActiveInBackground = true; p.showNowPlayingNotification = true; p.timeUpdateEventInterval = 1;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay' && !started.current) { started.current = true; if (startMs.current > 0) player.currentTime = startMs.current / 1000; player.play(); }
    else if (status === 'error') setFailed(true);
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => { setPos(currentTime); dl.setPosition(talkId, currentTime * 1000); });
  const live = useRef(false); live.current = isPlaying;
  useEffect(() => registerMedia({ isPlaying: () => live.current && !player.muted, pause: () => player.pause(), play: () => player.play() }), [player]);
  const audio = rec.kind === 'audio';

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <View style={{ backgroundColor: '#000' }}>
        <View style={{ aspectRatio: 16 / 9, width: '100%', justifyContent: 'center', backgroundColor: '#000' }}>
          {audio ? (
            <View style={{ flex: 1 }}>
              {poster ? <Image source={{ uri: poster }} style={{ position: 'absolute', inset: 0, opacity: 0.5 }} contentFit="cover" /> : null}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}><Feather name="headphones" size={40} color={colors.goldLight} /><Txt weight="bold">{t('dl.audio')}</Txt></View>
              <VideoView player={player} style={{ width: 1, height: 1, opacity: 0 }} />
            </View>
          ) : <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />}
          {failed ? (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,9,6,0.88)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <Txt style={{ textAlign: 'center' }}>{t('dl.playerError')}</Txt>
              <Button variant="dark" label={t('dl.remove')} onPress={() => { void dl.remove(talkId); goBack(); }} />
            </View>
          ) : null}
          <View style={{ position: 'absolute', top: 8, start: 8 }}>
            <IconButton label={t('common.close')} onPress={goBack} style={{ backgroundColor: 'rgba(11,9,6,0.55)', borderWidth: 0 }}>
              <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} />
            </IconButton>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <IconButton label={t('talk.back10')} size={52} onPress={() => { player.currentTime = Math.max(0, pos - 10); }}><Feather name="rotate-ccw" size={22} color={colors.text} /></IconButton>
          <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? t('talk.pause') : t('talk.play')} onPress={() => (isPlaying ? player.pause() : player.play())}
            style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Feather name={isPlaying ? 'pause' : 'play'} size={28} color={colors.onGold} />
          </Pressable>
          <IconButton label={t('talk.fwd10')} size={52} onPress={() => { player.currentTime = pos + 10; }}><Feather name="rotate-cw" size={22} color={colors.text} /></IconButton>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('talk.speed')} ${speed}×`} onPress={() => { const s = nextSpeed(speed); setSpeed(s); player.playbackRate = s; }}
            style={{ minWidth: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Txt weight="extrabold" size={14}>{speed}×</Txt>
          </Pressable>
        </View>
        <View style={{ gap: 4 }}>
          <Txt weight="extrabold" size={22} accessibilityRole="header">{rec.title}</Txt>
          {rec.speaker ? <Txt weight="bold" size={14} color={colors.goldLight}>{rec.speaker}</Txt> : null}
        </View>
        <OfflineTabs talkId={talkId} pack={pack} positionMs={pos * 1000} onSeek={(ms) => { player.currentTime = ms / 1000; }} />
      </ScrollView>
    </SafeAreaView>
  );
}
