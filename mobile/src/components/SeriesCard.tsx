// Vignette d'une série : mêmes gabarit et dimensions que les conférences, avec le nombre d'épisodes et l'avancement.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import type { SeriesItem } from '@/lib/types';
import { colors } from '@/lib/theme';
import { LEVEL_COLOR, levelLabel } from '@/lib/media';
import { Poster, Badge } from './TalkCard';
import { Txt } from './ui';

export function SeriesCard({ series, width }: { series: SeriesItem; width?: number }) {
  const { t } = useSession();
  const access = series.access === 'mixed' ? t('mixed') : t(series.access);
  const count = series.hasSeasons && (series.seasonCount ?? 0) > 1
    ? `${t('seasonCount', { n: series.seasonCount ?? 0 })} · ${t('episodeCount', { n: series.episodeCount })}`
    : t('episodeCount', { n: series.episodeCount });
  const pct = series.watched && series.episodeCount ? Math.min(100, Math.round((series.watched / series.episodeCount) * 100)) : 0;
  const lvl = levelLabel(series.level, t);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={series.title} onPress={() => router.push({ pathname: '/series/[id]', params: { id: series.id } })}
      style={({ pressed }) => ({ width: width ?? '100%', gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <Poster talk={{ id: series.id, posterUrl: series.posterUrl, source: 'upload' }}>
        <Badge label={access} premium={series.access === 'premium'} />
        <View style={{ position: 'absolute', end: 8, bottom: pct ? 10 : 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <Txt weight="medium" size={11}>{count}</Txt>
        </View>
        {pct > 0 ? <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.22)' }}><View style={{ width: `${pct}%`, height: 4, backgroundColor: colors.gold }} /></View> : null}
      </Poster>
      <Txt weight="bold" size={14} numberOfLines={2} style={{ marginTop: 2 }}>{series.title}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {lvl && series.level ? <View style={{ paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: LEVEL_COLOR[series.level] }}><Txt weight="medium" size={10} color={LEVEL_COLOR[series.level]}>{lvl}</Txt></View> : null}
        <Txt size={12} color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {series.watched !== undefined ? t('watchedOf', { n: series.watched, total: series.episodeCount }) : [t('seriesTag'), series.speaker].filter(Boolean).join(' · ')}
        </Txt>
      </View>
    </Pressable>
  );
}
