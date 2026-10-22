// Thème : présentation, petits pas proposés, conférences qui en parlent.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { formatDuration } from '@/lib/format';
import type { ThemeDetail } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Page } from '@/components/Page';
import { Panel, Txt } from '@/components/ui';

export default function ThemeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, isRTL } = useSession();
  const th = useAsync(() => api.get<ThemeDetail>(`/themes/${id}`), [id]);
  const d = th.data;
  return (
    <Page title={d?.title ?? ''} loading={th.loading && !d} error={!!th.error && !d} onRetry={th.reload} onRefresh={th.reload}>
      {d ? (
        <>
          {d.ar && isRTL ? <Txt weight="extrabold" size={22} color={colors.quoteArabic}>{d.ar}</Txt> : null}
          {d.desc ? <Txt color={colors.text2} style={{ lineHeight: 24 }}>{d.desc}</Txt> : null}
          {d.steps?.length ? (
            <Panel>
              {d.steps.map((s) => <Txt key={s.size} size={14} color={colors.text2}>{'•'.repeat(1)} {s.text}</Txt>)}
            </Panel>
          ) : null}
          <View style={{ gap: 8 }}>
            {d.talks.map((x) => (
              <Pressable key={x.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/talk/[id]', params: { id: x.id } })}
                style={{ minHeight: 56, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, gap: 2 }}>
                <Txt weight="bold" size={14}>{x.title}</Txt>
                <Txt size={12} color={colors.muted}>{[x.speaker, formatDuration(x.durationSeconds)].filter(Boolean).join(' · ')}</Txt>
              </Pressable>
            ))}
            {!d.talks.length ? <Txt color={colors.muted}>{t('noTalks')}</Txt> : null}
          </View>
        </>
      ) : null}
    </Page>
  );
}
