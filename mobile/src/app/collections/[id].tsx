// Contenu d'une collection.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { CollectionDetail } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Page } from '@/components/Page';
import { Grid } from '@/components/Grid';
import { TalkCard } from '@/components/TalkCard';
import { Txt } from '@/components/ui';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t } = useSession();
  const c = useAsync(() => api.get<CollectionDetail>(`/collections/${id}`), [id]);
  return (
    <Page title={c.data?.title ?? t('colNav')} loading={c.loading && !c.data} error={!!c.error && !c.data} onRetry={c.reload} onRefresh={c.reload}>
      {c.data?.description ? <Txt color={colors.text2} style={{ lineHeight: 24 }}>{c.data.description}</Txt> : null}
      {c.data && c.data.talks.length ? <Grid items={c.data.talks} render={(x, w) => <TalkCard talk={x} width={w} />} /> : <Txt color={colors.muted}>{t('noTalks')}</Txt>}
    </Page>
  );
}
