// Shorts (étape 24b) : fil vertical plein écran dans l'application. On glisse vers le haut pour le suivant ; un seul lecteur à la fois,
// en boucle ; le son se coupe d'un bouton ; favori, liste, partage ; « Voir la conférence complète » ouvre la fiche (jamais le site).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Share, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { registerMedia } from '@/lib/mediaRegistry';
import { SITE_URL } from '@/lib/config';
import { hasMore, mergeShorts, playableList, shortRatio } from '@/lib/shorts';
import type { Short } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';
import { AddToListModal } from '@/components/AddToListModal';

const LIMIT = 12;
const back = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };

export default function ShortsScreen() {
  const { api, t, dirStyle, user, favs, toggleFav } = useSession();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Short[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(true);
  const loading = useRef(false);
  const [h, setH] = useState(0);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [focused, setFocused] = useState(true);
  const [listFor, setListFor] = useState<string | null>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => { const i = viewableItems[0]?.index; if (i != null) setIndex(i); }).current;

  // Quitter l'écran (fiche d'une conférence) arrête la lecture ; y revenir la reprend.
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  const load = useCallback(async (offset: number) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const batch = await api.get<unknown>('/shorts', { limit: LIMIT, offset });
      const size = Array.isArray(batch) ? batch.length : 0;
      setData((prev) => mergeShorts(offset === 0 ? [] : prev, playableList(batch)));
      setMore(hasMore(size, LIMIT));
      setState('ready');
    } catch {
      setState((s) => (s === 'loading' ? 'error' : s));
    } finally { loading.current = false; }
  }, [api]);
  useEffect(() => { void load(0); }, [load]);

  const needLogin = (go: () => void) => { if (!user) router.push({ pathname: '/login', params: { mode: 'register' } }); else go(); };

  return (
    <View style={[{ flex: 1, backgroundColor: '#000' }, dirStyle]} onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}>
      {state === 'loading' ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.gold} /></View> : null}
      {state === 'error' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <Txt style={{ textAlign: 'center' }}>{t('common.error')}</Txt>
          <Button label={t('common.retry')} onPress={() => { setState('loading'); void load(0); }} />
        </View>
      ) : null}
      {state === 'ready' && data.length === 0 ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Txt style={{ textAlign: 'center' }} color={colors.text2}>{t('shorts.empty')}</Txt></View> : null}
      {h > 0 && data.length > 0 ? (
        <FlatList
          data={data} keyExtractor={(s) => s.id} pagingEnabled showsVerticalScrollIndicator={false} onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })} windowSize={3} initialNumToRender={1} maxToRenderPerBatch={2}
          onEndReachedThreshold={1.5} onEndReached={() => { if (more && state === 'ready') void load(data.length); }}
          renderItem={({ item, index: i }) => (
            <Page s={item} h={h} top={insets.top} bottom={insets.bottom} active={i === index && focused} muted={muted} fav={favs.has(item.talk.id)}
              onFav={() => needLogin(() => { void toggleFav(item.talk.id); })} onList={() => needLogin(() => setListFor(item.talk.id))} />
          )}
        />
      ) : null}

      {/* Barre du haut, par-dessus le fil */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 6, start: 8, end: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={back} hitSlop={6}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,9,6,0.55)' }}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Txt weight="extrabold" size={17} accessibilityRole="header">{t('shrTitle')}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? t('shorts.unmute') : t('shorts.mute')} onPress={() => setMuted((m) => !m)} hitSlop={6}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,9,6,0.55)' }}>
          <Feather name={muted ? 'volume-x' : 'volume-2'} size={22} color={colors.text} />
        </Pressable>
      </View>
      <AddToListModal talkId={listFor ?? ''} visible={listFor !== null} onClose={() => setListFor(null)} />
    </View>
  );
}

function RailButton({ icon, label, onPress, active }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.goldTint : 'rgba(11,9,6,0.55)' }}>
        <Feather name={icon} size={22} color={active ? colors.goldLight : colors.text} />
      </View>
      <Txt size={11} weight="medium" numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}

function Page({ s, h, top, bottom, active, muted, fav, onFav, onList }: {
  s: Short; h: number; top: number; bottom: number; active: boolean; muted: boolean; fav: boolean; onFav: () => void; onList: () => void;
}) {
  const { t } = useSession();
  const [ratio, setRatio] = useState(0);
  return (
    <View style={{ height: h, backgroundColor: '#000' }}>
      {s.posterUrl ? <Image source={{ uri: s.posterUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      {active ? <ActiveShort s={s} muted={muted} onRatio={setRatio} /> : null}

      <View pointerEvents="box-none" style={{ position: 'absolute', end: 6, bottom: bottom + 150, gap: 6, alignItems: 'center' }}>
        <RailButton icon="bookmark" label={t('talk.fav')} active={fav} onPress={onFav} />
        <RailButton icon="list" label={t('wbList')} onPress={onList} />
        <RailButton icon="share-2" label={t('wbShare')} onPress={() => { void Share.share({ message: `${s.title} — ${SITE_URL}/talks/${s.talk.id}` }); }} />
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', start: 0, end: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 28, paddingBottom: bottom + 18, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        {s.channel ? (
          <Pressable accessibilityRole="link" onPress={() => s.channel && router.push({ pathname: '/speaker/[slug]', params: { slug: s.channel.slug } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, alignSelf: 'flex-start' }}>
            {s.channel.avatarUrl ? <Image source={{ uri: s.channel.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} contentFit="cover" /> : null}
            <Txt weight="bold" size={14} color={colors.goldLight}>{s.channel.name}</Txt>
          </Pressable>
        ) : null}
        <Txt weight="extrabold" size={18} numberOfLines={2} style={{ paddingEnd: 64 }}>{s.title}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={t('shorts.full')} onPress={() => router.push({ pathname: '/talk/[id]', params: { id: s.talk.id } })}
          style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: colors.gold, backgroundColor: 'rgba(11,9,6,0.55)' }}>
          <Txt weight="bold" size={14} color={colors.goldLight}>{t('shorts.full')}</Txt>
        </Pressable>
      </View>
      <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
        <View style={{ width: `${ratio * 100}%`, height: 3, backgroundColor: colors.gold }} />
      </View>
    </View>
  );
}

/** Le seul lecteur monté : lecture en boucle, une vue comptée à l'affichage, pause demandée par la prière. */
function ActiveShort({ s, muted, onRatio }: { s: Short; muted: boolean; onRatio: (r: number) => void }) {
  const { api } = useSession();
  const player = useVideoPlayer(s.videoUrl ? { uri: s.videoUrl } : null, (p) => { p.loop = true; p.staysActiveInBackground = false; p.showNowPlayingNotification = false; p.timeUpdateEventInterval = 0.25; p.play(); });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const live = useRef(false);
  live.current = isPlaying;
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useEventListener(player, 'statusChange', ({ status }) => { if (status === 'readyToPlay') player.play(); });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => onRatio(shortRatio(currentTime, player.duration || s.duration || 0)));
  useEffect(() => { void api.post(`/shorts/${s.id}/view`).catch(() => { /* une vue non comptée n'est pas grave */ }); }, [s.id, api]);
  const toggle = useCallback(() => { if (live.current) player.pause(); else player.play(); }, [player]);
  useEffect(() => registerMedia({ isPlaying: () => live.current && !player.muted, pause: () => player.pause(), play: () => player.play() }), [player]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={s.title} onPress={toggle} style={{ position: 'absolute', inset: 0 }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />
      {!isPlaying ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none"><Feather name="play" size={56} color="rgba(255,255,255,0.85)" /></View> : null}
    </Pressable>
  );
}
