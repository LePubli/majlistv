// Courts de l'espace enfant : extraits verticaux des conférences de son âge (même règles que le catalogue Kids, côté serveur).
// On fait glisser vers le haut pour le suivant ; un seul lecteur à la fois ; la prière met en pause comme ailleurs.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { registerMedia } from '@/lib/mediaRegistry';
import { KC, isTimeUp, playableShorts } from '@/lib/kids';
import type { KidShort } from '@/lib/types';
import { KButton, KScreen, KTxt } from '@/components/kids/KidUi';

const back = () => { if (router.canGoBack()) router.back(); else router.replace('/kids/home'); };

export default function KidsShorts() {
  const { kid } = useKid();
  if (!kid) return <Redirect href="/kids" />;
  return <Feed key={kid.profile.id} />;
}

function Feed() {
  const { t } = useSession();
  const { kidApi, epoch, time } = useKid();
  const list = useAsync(async () => playableShorts(await kidApi.get<KidShort[]>('/shorts', { limit: 20 })), [epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const [h, setH] = useState(0);
  const [index, setIndex] = useState(0);
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => { const i = viewableItems[0]?.index; if (i != null) setIndex(i); }).current;
  const data = list.data ?? [];
  const timeUp = !!time?.timeUp;

  const top = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('kdBack')} hitSlop={8} onPress={back}
        style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
        <Feather name="arrow-left" size={18} color={KC.text} /><KTxt weight="extrabold" size={14}>{t('kdBack').replace('← ', '')}</KTxt>
      </Pressable>
      <KTxt weight="extrabold" size={18} accessibilityRole="header">🎬 {t('shrTitle')}</KTxt>
    </View>
  );
  if (timeUp) {
    return <KScreen>{top}<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }} accessibilityRole="alert">
      <KTxt size={56} style={{ lineHeight: 68 }}>🌙</KTxt><KTxt weight="extrabold" size={24} style={{ textAlign: 'center' }}>{t('kdTimeUpTitle')}</KTxt><KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdTimeUpText')}</KTxt></View></KScreen>;
  }
  return (
    <KScreen>
      {top}
      <View style={{ flex: 1 }} onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}>
        {list.loading && !list.data ? <KTxt style={{ padding: 20 }} color={KC.text2}>…</KTxt> : null}
        {list.error && !list.data ? <View style={{ padding: 20, gap: 12 }}><KTxt color={KC.text2}>{isTimeUp(list.error) ? t('kdTimeUpTitle') : t('common.error')}</KTxt><KButton label={t('common.retry')} variant="soft" onPress={list.reload} /></View> : null}
        {list.data && data.length === 0 ? <KTxt style={{ padding: 20, textAlign: 'center' }} color={KC.text2}>{t('kdEmpty')}</KTxt> : null}
        {h > 0 && data.length > 0 ? (
          <FlatList data={data} keyExtractor={(s) => s.id} pagingEnabled showsVerticalScrollIndicator={false} onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
            getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })} windowSize={3} initialNumToRender={1} maxToRenderPerBatch={2}
            renderItem={({ item, index: i }) => <Page s={item} h={h} active={i === index} />} />
        ) : null}
      </View>
    </KScreen>
  );
}

function Page({ s, h, active }: { s: KidShort; h: number; active: boolean }) {
  const { t } = useSession();
  return (
    <View style={{ height: h, paddingHorizontal: 12, paddingBottom: 12 }}>
      <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' }}>
        {s.posterUrl ? <Image source={{ uri: s.posterUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        {active ? <ActiveShort s={s} /> : null}
        <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: 'rgba(7,11,39,0.55)' }} pointerEvents="box-none">
          <KTxt weight="extrabold" size={18} numberOfLines={2}>{s.title}</KTxt>
          <Pressable accessibilityRole="button" accessibilityLabel={t('kdSee')} onPress={() => router.push({ pathname: '/kids/watch/[id]', params: { id: s.talk.id } })}
            style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', backgroundColor: KC.accent }}>
            <KTxt weight="extrabold" size={15} color={KC.onAccent}>▶ {t('kdMPlay')}</KTxt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Le seul lecteur monté : lecture en boucle, une vue comptée à l'affichage, pause demandée par la prière. */
function ActiveShort({ s }: { s: KidShort }) {
  const { kidApi } = useKid();
  const player = useVideoPlayer(s.videoUrl ? { uri: s.videoUrl } : null, (p) => { p.loop = true; p.staysActiveInBackground = false; p.showNowPlayingNotification = false; p.play(); });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const live = useRef(false);
  live.current = isPlaying;
  useEventListener(player, 'statusChange', ({ status }) => { if (status === 'readyToPlay') player.play(); });
  useEffect(() => { void kidApi.post(`/shorts/${s.id}/view`).catch(() => { /* une vue non comptée n'est pas grave */ }); }, [s.id, kidApi]);
  const toggle = useCallback(() => { if (live.current) player.pause(); else player.play(); }, [player]);
  useEffect(() => registerMedia({ isPlaying: () => live.current, pause: () => player.pause(), play: () => player.play() }), [player]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={s.title} onPress={toggle} style={{ flex: 1 }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />
      {!isPlaying ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none"><Feather name="play" size={56} color="rgba(255,255,255,0.85)" /></View> : null}
    </Pressable>
  );
}
