// Histoires du soir (espace Kids) : les histoires à écouter avant de dormir. Illimitées, hors limite quotidienne.
import React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { fmtLong, type AudynItem } from '@/lib/audyn';
import { KC } from '@/lib/kids';
import { KButton, KScreen, KTxt } from '@/components/kids/KidUi';
import { Cover } from '@/components/AudynParts';

export default function KidsStories() {
  const { t } = useSession();
  const { kid, kidApi, epoch } = useKid();
  const d = useAsync(() => kidApi.get<{ items: AudynItem[] }>('/kids/stories'), [kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return <Redirect href="/kids" />;
  return (
    <KScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('aud.kBack')} hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/kids/home'))}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
          <Feather name="arrow-left" size={20} color={KC.text2} />
        </Pressable>
        <KTxt weight="extrabold" size={22} accessibilityRole="header" style={{ flex: 1 }}>🌙 {t('aud.kTitle')}</KTxt>
      </View>
      {d.loading && !d.data ? <KTxt style={{ padding: 20 }} color={KC.text2}>…</KTxt> : !d.data ? (
        <View style={{ padding: 20, gap: 12 }}><KTxt color={KC.text2}>{t('common.error')}</KTxt><KButton label={t('common.retry')} variant="soft" onPress={d.reload} /></View>
      ) : (
        <FlatList
          data={d.data.items}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={<KTxt color={KC.text2} style={{ marginBottom: 8 }}>{t('aud.kIntro')}</KTxt>}
          ListEmptyComponent={<KTxt color={KC.text2}>{t('aud.kEmpty')}</KTxt>}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="link" accessibilityLabel={item.title} onPress={() => router.push({ pathname: '/kids/story/[id]', params: { id: item.id } })}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 14, padding: 12, borderRadius: 20, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line, opacity: pressed ? 0.85 : 1, minHeight: 64 })}>
              <Cover url={item.coverUrl} size={84} radiusPx={14} />
              <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
                <KTxt weight="extrabold" size={17} numberOfLines={2}>{item.title}</KTxt>
                {item.narrator ? <KTxt size={13} color={KC.text2} numberOfLines={1}>{t('aud.by', { name: item.narrator })}</KTxt> : null}
                <KTxt size={12} color={KC.muted}>{item.chapters === 1 ? t('aud.chapter1') : t('aud.chapters', { n: item.chapters })} · {fmtLong(item.durationSeconds)}</KTxt>
              </View>
            </Pressable>
          )}
        />
      )}
    </KScreen>
  );
}
