// Événements en direct : liste des événements à venir et passés (mêmes données que la page du site, étape 2).
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { fmtWhen, type LiveEvent } from '@/lib/events';
import { colors, radius } from '@/lib/theme';
import { Chip, ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { EventBadge, useNow } from '@/components/EventParts';
import { LiveChannels } from '@/components/LiveChannels';

export default function EventsScreen() {
  const { api, t, dirStyle, locale, user, feat } = useSession();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const d = useAsync(async () => (feat('events') ? api.get<LiveEvent[]>('/events', { scope }) : []), [scope, user?.id]);
  const now = useNow(scope === 'upcoming');
  // Une minute après l'ouverture ou la fin d'un direct, la liste est relue.
  useEffect(() => { const h = setInterval(() => { void d.reload(); }, 60000); return () => clearInterval(h); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('evn.title')} />
      {d.loading && !d.data ? <Loading /> : !d.data ? <ErrorBox onRetry={d.reload} /> : (
        <FlatList
          data={d.data}
          keyExtractor={(e) => e.id}
          ListHeaderComponent={(
            <View style={{ gap: 12, paddingBottom: 8 }}>
              {/* Chaînes TV en direct 24 h/24 (La Mecque, Médine…) en tête. */}
              <LiveChannels />
              <Txt size={14} color={colors.text2}>{t('evn.intro')}</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label={t('evn.upcoming')} active={scope === 'upcoming'} onPress={() => setScope('upcoming')} />
                <Chip label={t('evn.past')} active={scope === 'past'} onPress={() => setScope('past')} />
              </View>
            </View>
          )}
          ListEmptyComponent={<Txt color={colors.muted}>{t(scope === 'upcoming' ? 'evn.empty' : 'evn.emptyPast')}</Txt>}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          onRefresh={d.reload}
          refreshing={false}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="link" accessibilityLabel={item.title} onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.id } })}
              style={({ pressed }) => ({ gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <EventBadge ev={item} now={now} />
                <Txt size={12} color={colors.muted}>{fmtWhen(item.startsAt, locale)}</Txt>
              </View>
              <Txt weight="extrabold" size={16} numberOfLines={2}>{item.title}</Txt>
              {item.speaker ? <Txt size={13} color={colors.text2} numberOfLines={1}>{item.speaker}</Txt> : null}
              {item.reminded ? <Txt size={12} color={colors.goldLight}>🔔 {t('evn.reminded')}</Txt> : null}
              {item.replay ? <Txt size={12} color={colors.goldLight}>▶ {t('evn.replay')}</Txt> : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
