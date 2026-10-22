// Collections de conférences choisies par l'équipe.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { CollectionItem } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Page } from '@/components/Page';
import { Poster } from '@/components/TalkCard';
import { Grid } from '@/components/Grid';
import { Txt } from '@/components/ui';

export default function CollectionsScreen() {
  const { api, t } = useSession();
  const list = useAsync(() => api.get<CollectionItem[]>('/collections'), []);
  return (
    <Page title={t('colNav')} loading={list.loading && !list.data} error={!!list.error && !list.data} onRetry={list.reload} onRefresh={list.reload}>
      {list.data && list.data.length ? (
        <Grid items={list.data} render={(c, w) => (
          <Pressable accessibilityRole="button" accessibilityLabel={c.title} onPress={() => router.push({ pathname: '/collections/[id]', params: { id: c.id } })} style={{ width: w, gap: 6 }}>
            <Poster talk={{ id: c.id, posterUrl: c.posterUrl, source: 'upload' }} />
            <Txt weight="bold" size={14} numberOfLines={2}>{c.title}</Txt>
            <Txt size={12} color={colors.muted}>{c.talks === 1 ? t('chTalks1') : t('chTalksN', { n: c.talks })}</Txt>
          </Pressable>
        )} />
      ) : <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel }}><Txt color={colors.muted}>{t('colNone')}</Txt></View>}
    </Page>
  );
}
