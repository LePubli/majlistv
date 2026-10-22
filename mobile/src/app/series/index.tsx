// Toutes les séries, avec filtre par niveau.
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { SeriesItem } from '@/lib/types';
import { Page } from '@/components/Page';
import { Grid } from '@/components/Grid';
import { SeriesCard } from '@/components/SeriesCard';
import { Chip, Txt } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function SeriesIndex() {
  const { api, t } = useSession();
  const [level, setLevel] = useState<string | null>(null);
  const list = useAsync(() => api.get<SeriesItem[]>('/series', { level: level ?? undefined, limit: 100 }), [level]);
  const levels: [string | null, string][] = [[null, t('talks.all')], ['beginner', t('lvBeginner')], ['intermediate', t('lvInter')], ['advanced', t('lvAdvanced')]];
  return (
    <Page title={t('seriesNav')} loading={list.loading && !list.data} error={!!list.error && !list.data} onRetry={list.reload} onRefresh={list.reload}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {levels.map(([k, label]) => <Chip key={String(k)} label={label} active={level === k} onPress={() => setLevel(k)} />)}
      </View>
      {list.data && list.data.length ? <Grid items={list.data} render={(s, w) => <SeriesCard series={s} width={w} />} /> : <Txt color={colors.muted}>{t('noTalks')}</Txt>}
    </Page>
  );
}
