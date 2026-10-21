// Accueil : bannière, « Continuer à regarder », rangées du catalogue (mêmes réglages que le site).
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { Card, Home, HomeRow } from '@/lib/types';
import { colors, gradientFor, radius } from '@/lib/theme';
import { formatClock } from '@/lib/format';
import { Button, ErrorBox, Loading, Txt, screenStyle } from '@/components/ui';
import { TalkCard, openTalk } from '@/components/TalkCard';
import type { Key } from '@/lib/i18n';

const ROW_TITLES: Record<string, Key> = { new: 'home.new', beginner: 'home.beginner' };

function Hero({ home, cont }: { home: Home; cont: Card | null }) {
  const { t } = useSession();
  // Priorité : la conférence à reprendre ; sinon la première mise en avant ; sinon le texte d'accueil.
  const featured = home.hero.mode === 'featured' ? home.hero.items[0] : null;
  const talk = cont ?? featured;
  const custom = home.hero.mode === 'custom' ? home.hero : null;
  const title = talk?.title ?? custom?.title ?? t('tagline');
  const poster = talk?.posterUrl ?? custom?.imageUrl ?? null;
  const g = gradientFor(talk?.id ?? 'hero');
  return (
    <View style={{ marginHorizontal: 18, borderRadius: radius.panel, overflow: 'hidden', height: 210, backgroundColor: colors.panel }}>
      <LinearGradient colors={[g[0], g[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {poster ? <Image source={{ uri: poster }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : null}
      <LinearGradient colors={['transparent', 'rgba(11,9,6,0.88)']} style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 150 }} />
      <View style={{ position: 'absolute', start: 16, end: 16, bottom: 14, gap: 8 }}>
        {cont ? <Txt weight="bold" size={12} color={colors.goldLight} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('home.continue')}</Txt> : null}
        <Txt weight="extrabold" size={19} numberOfLines={2}>{title}</Txt>
        {cont?.positionMs ? (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(243,235,221,0.3)' }}>
            <View style={{ width: `${Math.min(100, Math.round((cont.positionMs / (cont.durationMs || (cont.durationSeconds ?? 1) * 1000 || 1)) * 100))}%`, height: 4, borderRadius: 2, backgroundColor: colors.gold }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Row({ row, title }: { row: HomeRow; title: string }) {
  const talks = row.talks ?? [];
  if (!talks.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Txt weight="extrabold" size={18} style={{ paddingHorizontal: 18 }}>{title}</Txt>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={talks}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
        renderItem={({ item }) => <TalkCard talk={item} width={210} />}
      />
    </View>
  );
}

export default function HomeScreen() {
  const { api, user, t, dirStyle } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const home = useAsync(() => api.get<Home>('/home'), [user?.id]);
  const cont = useAsync(async () => (user ? await api.get<Card[]>('/me/continue').catch(() => []) : []), [user?.id]);

  // Au retour du lecteur, la progression a changé : on actualise « Continuer à regarder ».
  useFocusEffect(useCallback(() => { if (user) void cont.reload(); }, [user?.id])); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => { setRefreshing(true); await Promise.all([home.reload(), cont.reload()]); setRefreshing(false); };

  if (home.loading && !home.data) return <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}><Loading /></SafeAreaView>;
  if (!home.data) return <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}><ErrorBox onRetry={home.reload} /></SafeAreaView>;

  const first = (cont.data ?? [])[0] ?? null;
  const rows = home.data.rows.filter((r) => r.talks?.length);
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 4 }}>
          <Txt weight="extrabold" size={22}>Mejliss<Txt weight="extrabold" size={22} color={colors.gold}>TV</Txt></Txt>
          <Txt weight="semibold" size={13} color={colors.muted}>{t('tagline')}</Txt>
        </View>
        <Hero home={home.data} cont={first} />
        {first ? (
          <View style={{ paddingHorizontal: 18 }}>
            <Button
              label={first.positionMs ? t('talk.resumeAt', { time: formatClock(first.positionMs / 1000) }) : t('home.watch')}
              icon={<Feather name="play" size={18} color={colors.onGold} />}
              onPress={() => openTalk(first.id)}
            />
          </View>
        ) : null}
        {(cont.data ?? []).length > 1 ? <Row row={{ key: 'continue', title: null, talks: (cont.data ?? []).slice(1) }} title={t('home.continue')} /> : null}
        {rows.length === 0 ? <Txt color={colors.muted} style={{ paddingHorizontal: 18 }}>{t('home.empty')}</Txt> : null}
        {rows.map((r) => (
          <Row key={r.key} row={r} title={r.title ?? (ROW_TITLES[r.key] ? t(ROW_TITLES[r.key]) : r.key)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
