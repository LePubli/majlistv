// Fiche d'une série : présentation, bouton Regarder / Reprendre, saisons et épisodes.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { formatClock } from '@/lib/format';
import { levelLabel } from '@/lib/media';
import type { SeriesDetail, SeriesEpisode } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Page } from '@/components/Page';
import { Poster } from '@/components/TalkCard';
import { Button, Txt } from '@/components/ui';

export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, user } = useSession();
  const s = useAsync(() => api.get<SeriesDetail>(`/series/${id}`), [id, user?.id]);
  const d = s.data;
  const groups = d ? (d.seasons && d.seasons.length ? d.seasons : [{ id: null, number: null, title: '', episodes: d.episodes }]) : [];
  const open = (talkId: string) => router.push({ pathname: '/talk/[id]', params: { id: talkId } });
  return (
    <Page title={d?.title ?? t('seriesNav')} loading={s.loading && !d} error={!!s.error && !d} onRetry={s.reload} onRefresh={s.reload}>
      {d ? (
        <>
          <View style={{ borderRadius: radius.panel, overflow: 'hidden' }}><Poster talk={{ id: d.id, posterUrl: d.posterUrl, source: 'upload' }} radiusPx={radius.panel} /></View>
          <View style={{ gap: 6 }}>
            <Txt weight="extrabold" size={22} accessibilityRole="header">{d.title}</Txt>
            <Txt size={13} color={colors.muted}>{[d.speaker, d.category, levelLabel(d.level, t), t('episodeCount', { n: d.episodeCount })].filter(Boolean).join(' · ')}</Txt>
          </View>
          {d.resume ? <Button label={d.resume.started ? t('continueWatching') : t('watchNow')} onPress={() => open(d.resume!.talkId)} /> : null}
          {d.description ? <Txt color={colors.text2} style={{ lineHeight: 24 }}>{d.description}</Txt> : null}
          {groups.map((g, gi) => (
            <View key={gi} style={{ gap: 8 }}>
              {g.number ? <Txt weight="extrabold" size={16}>{t('seasonN', { n: g.number })}{g.title ? ` — ${g.title}` : ''}</Txt> : null}
              {g.episodes.map((e) => <Episode key={e.id} e={e} onPress={() => open(e.id)} />)}
            </View>
          ))}
        </>
      ) : null}
    </Page>
  );
}

function Episode({ e, onPress }: { e: SeriesEpisode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft }}>
      <Txt weight="bold" size={13} color={colors.goldLight} style={{ minWidth: 26 }}>{e.completed ? '✓' : e.number}</Txt>
      <Txt weight="medium" size={14} style={{ flex: 1 }}>{e.title}</Txt>
      {e.durationSeconds ? <Txt size={12} color={colors.muted}>{formatClock(e.durationSeconds)}</Txt> : null}
    </Pressable>
  );
}
