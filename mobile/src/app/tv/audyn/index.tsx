// Audyn sur la télé : une rangée par catégorie (« Nouveautés » d'abord), couvertures carrées ; OK ouvre la fiche.
import React from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth, tvMenuWidth } from '@/lib/tv';
import type { AudynList } from '@/lib/audyn';
import { audynRows } from '@/lib/tvRules';
import { colors } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvSquare } from '@/components/tv/TvSquare';


export default function TvAudyn() {
  const { api, t } = useSession();
  const { width } = useWindowDimensions();
  const w = tvCardWidth(width - tvMenuWidth(width), 5.5);
  const d = useAsync(() => api.get<AudynList>('/audyn'), []);
  const rows = audynRows(d.data, t('tv.audynNew'), t('tv.audynOther'));
  return (
    <TvShell>
      {d.loading && !d.data ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingVertical: 28, gap: 24 }}>
          <Txt weight="extrabold" size={24} style={{ paddingHorizontal: 32 }}>Audyn</Txt>
          {rows.length === 0 ? <Txt color={colors.muted} style={{ paddingHorizontal: 32 }}>{t('tv.empty')}</Txt> : rows.map((r, i) => (
            <View key={r.key} style={{ gap: 8 }}>
              <Txt weight="extrabold" size={19} style={{ paddingHorizontal: 32 }}>{r.title}</Txt>
              <FlatList horizontal data={r.items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 28, gap: 14, paddingVertical: 6 }}
                renderItem={({ item, index }) => <TvSquare item={item} width={w} first={i === 0 && index === 0} />} />
            </View>
          ))}
        </ScrollView>
      )}
    </TvShell>
  );
}
