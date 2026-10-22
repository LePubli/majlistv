// Mes téléchargements (22b-6) : fonctionne sans connexion. Taille utilisée, jours restants, lecture, suppression.
import React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useDownloads } from '@/lib/downloadStore';
import { DownloadRecord } from '@/lib/downloads';
import { formatSize } from '@/lib/appUpdate';
import { formatDuration } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { Button, IconButton, Panel, Txt, screenStyle } from '@/components/ui';

function goBack() { if (router.canGoBack()) router.back(); else router.replace('/'); }

function Row({ rec }: { rec: DownloadRecord }) {
  const { t, locale, dirStyle } = useSession();
  const dl = useDownloads();
  const st = dl.statusOf(rec);
  const expired = !st.playable;
  const poster = dl.posterUriOf(rec);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rec.title} onPress={() => router.push({ pathname: '/offline/[id]', params: { id: rec.talkId } })}
      style={({ pressed }) => [{ flexDirection: 'row', gap: 12, padding: 10, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }, dirStyle]}>
      <View style={{ width: 112, aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        {poster ? <Image source={{ uri: poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Feather name={rec.kind === 'audio' ? 'headphones' : 'film'} size={26} color={colors.muted} />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt weight="bold" size={14} numberOfLines={2}>{rec.title}</Txt>
        {rec.speaker ? <Txt size={12} color={colors.goldLight} numberOfLines={1}>{rec.speaker}</Txt> : null}
        <Txt size={12} color={colors.muted}>
          {rec.kind === 'audio' ? t('dl.audio') : `${rec.height}p`} · {formatSize(rec.size, locale)}{rec.durationSeconds ? ` · ${formatDuration(rec.durationSeconds)}` : ''}
        </Txt>
        <Txt size={12} color={expired ? '#FF8A7A' : colors.text2}>{!expired ? t('dl.daysLeft', { n: st.daysLeft }) : st.state === 'expired' ? t('dl.expired') : t('dl.licenceBad')}</Txt>
      </View>
      <IconButton label={t('dl.remove')} size={40} onPress={() => { void dl.remove(rec.talkId); }}><Feather name="trash-2" size={18} color={colors.text} /></IconButton>
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const { t, locale, isRTL, dirStyle } = useSession();
  const dl = useDownloads();
  return (
    <SafeAreaView style={[screenStyle, dirStyle]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, paddingBottom: 8 }}>
        <IconButton label={t('common.close')} onPress={goBack}><Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} /></IconButton>
        <Txt weight="extrabold" size={22} accessibilityRole="header" style={{ flex: 1 }}>{t('dl.listTitle')}</Txt>
      </View>
      {dl.clockWarn ? <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}><Txt size={13} color="#FF8A7A" accessibilityRole="alert">{t('dl.clockWarn')}</Txt></View> : null}
      {dl.active ? <View style={{ paddingHorizontal: 18 }}><Txt size={13} color={colors.goldLight}>{t('dl.downloading', { percent: Math.round(dl.active.ratio * 100) })}</Txt></View> : null}
      <FlatList
        data={dl.records}
        keyExtractor={(r) => r.talkId}
        contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={dl.records.length ? <Txt size={13} color={colors.muted}>{t('dl.used', { size: formatSize(dl.usedBytes, locale) })}</Txt> : undefined}
        ListEmptyComponent={dl.loaded ? <Panel style={{ gap: 10 }}><Txt color={colors.text2}>{t('dl.empty')}</Txt></Panel> : undefined}
        renderItem={({ item }) => <Row rec={item} />}
      />
      {!dl.online && dl.records.length ? <View style={{ padding: 18 }}><Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('dl.offline')}</Txt></View> : null}
      {dl.online && dl.records.some((r) => !dl.statusOf(r).playable) ? <View style={{ padding: 18 }}><Button variant="dark" label={t('dl.renew')} onPress={() => { void dl.renew(true); }} /></View> : null}
    </SafeAreaView>
  );
}
