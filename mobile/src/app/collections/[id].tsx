// Contenu d'une collection, immersif : image de la première vidéo en en-tête, titre, repères, « Commencer »,
// puis les vidéos (numérotées pour les cycles et les séries d'un intervenant).
import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { CollectionDetail, CollectionItem } from '@/lib/types';
import { colors } from '@/lib/theme';
import { screenStyle, ErrorBox, Loading, Button, Txt } from '@/components/ui';
import { Grid } from '@/components/Grid';
import { Rail } from '@/components/Rail';
import { TalkCard, openTalk } from '@/components/TalkCard';
import { ImmersiveHero } from '@/components/ImmersiveHero';
import { CollectionCard, kindLabel, videosLabel } from '@/components/CollectionCard';
import { thumbOf, totalTime } from '@/lib/media';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, dirStyle } = useSession();
  const c = useAsync(() => api.get<CollectionDetail>(`/collections/${id}`), [id]);
  const all = useAsync(() => api.get<CollectionItem[]>('/collections').catch(() => [] as CollectionItem[]), []);
  if (c.loading && !c.data) return <View style={[screenStyle, dirStyle]}><Loading /></View>;
  if (!c.data) return <View style={[screenStyle, dirStyle]}><ErrorBox onRetry={c.reload} /></View>;
  const d = c.data;
  const talks = d.talks ?? [];
  const first = talks[0];
  const bg = talks.map((x) => thumbOf(x)).find(Boolean) ?? null;
  const numbered = d.kind === 'cycle' || d.kind === 'speaker';
  const time = totalTime(talks, t('minutes'));
  const others = (all.data ?? []).filter((x) => x.id !== d.id).slice(0, 8);
  return (
    <View style={[screenStyle, dirStyle]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 56, gap: 22 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void c.reload(); }} tintColor={colors.gold} />}>
        <ImmersiveHero id={d.id} uri={bg}>
          {d.kind ? <Txt weight="bold" size={11} color={colors.goldLight} style={{ letterSpacing: 2, textTransform: 'uppercase' }}>{kindLabel(d.kind, t)}</Txt> : null}
          <Txt weight="extrabold" size={34} accessibilityRole="header" numberOfLines={3} style={{ lineHeight: 38 }}>{d.title}</Txt>
          {d.description ? <Txt color={colors.text2} numberOfLines={4} style={{ lineHeight: 22 }}>{d.description}</Txt> : null}
          <Txt weight="bold" size={13}>{[videosLabel(talks.length, t), time].filter(Boolean).join('  •  ')}</Txt>
          {first ? <Button label={`▶  ${t('pmColPlayAll')}`} onPress={() => openTalk(first.id)} /> : null}
        </ImmersiveHero>
        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          <Txt weight="extrabold" size={19} accessibilityRole="header">{t('pmColIn')} <Txt weight="bold" size={13} color={colors.goldLight}>{talks.length}</Txt></Txt>
          {talks.length ? (
            <Grid items={talks} render={(x, w) => (
              <View style={{ width: w, gap: 6 }}>
                {numbered ? <Txt weight="extrabold" size={26} color={colors.goldLight} style={{ opacity: 0.9 }}>{String(talks.findIndex((y) => y.id === x.id) + 1).padStart(2, '0')}</Txt> : null}
                <TalkCard talk={x} width={w} />
              </View>
            )} />
          ) : <Txt color={colors.muted}>{t('noTalks')}</Txt>}
        </View>
        {others.length ? <Rail title={t('pmColMore')} items={others} render={(x, w) => <CollectionCard c={x} width={Math.round(w * 1.05)} />} /> : null}
      </ScrollView>
    </View>
  );
}
