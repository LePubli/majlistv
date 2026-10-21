// Contenu d'une liste personnelle : conférences, retrait d'une conférence, suppression de la liste.
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { ListDetail } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Button, ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, t, dirStyle } = useSession();
  const list = useAsync(() => api.get<ListDetail>(`/me/lists/${id}`), [id, user?.id]);
  const [busy, setBusy] = useState(false);

  async function removeTalk(talkId: string) {
    try { await api.del(`/me/lists/${id}/items/${talkId}`); await list.reload(); } catch { /* la liste se recharge au prochain essai */ }
  }

  function askDelete() {
    Alert.alert(t('lib.delete'), list.data?.title ?? '', [
      { text: t('common.close'), style: 'cancel' },
      {
        text: t('lib.delete'), style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try { await api.del(`/me/lists/${id}`); router.back(); } catch { setBusy(false); }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}>
      <ScreenHeader title={list.data?.title ?? ''} />
      {list.loading && !list.data ? <Loading /> : !list.data ? <ErrorBox onRetry={list.reload} /> : (
        <FlatList
          data={list.data.talks}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }}
          ListEmptyComponent={<Txt color={colors.muted}>{t('lib.emptyList')}</Txt>}
          renderItem={({ item }) => (
            <View style={{ gap: 6 }}>
              <TalkCard talk={item} />
              <Pressable accessibilityRole="button" onPress={() => removeTalk(item.id)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="minus-circle" size={16} color={colors.muted} />
                <Txt size={13} weight="semibold" color={colors.muted}>{t('lib.removeFromList')}</Txt>
              </Pressable>
            </View>
          )}
          ListFooterComponent={<Button label={t('lib.delete')} variant="dark" onPress={askDelete} loading={busy} style={{ marginTop: 12 }} />}
        />
      )}
    </SafeAreaView>
  );
}
