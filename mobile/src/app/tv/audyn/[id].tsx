// Fiche Audyn sur la télé : couverture, titre, auteur, description ; « Écouter » / « Reprendre » ; liste des chapitres (OK = écouter
// ce chapitre). La lecture continue en fond ; l'écran « En écoute » donne les commandes (pause, ±15 s, chapitre précédent / suivant).
import React, { useEffect, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import { fmtClock, fmtLong, type AudynDetail } from '@/lib/audyn';
import { colors } from '@/lib/theme';
import { ErrorBox, Loading, Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';

const btn = { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 } as const;

export default function TvAudynItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, user } = useSession();
  const au = useAudyn();
  const { width } = useWindowDimensions();
  const d = useAsync(() => api.get<AudynDetail>(`/audyn/${id}`), [id, user?.id]);
  const [saved, setSaved] = useState<{ index: number; pos: number } | null>(null);
  useEffect(() => { if (d.data) void au.savedFor(d.data.id).then(setSaved); }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorBox onRetry={d.reload} />;
  const b = d.data;
  const go = async (fn: () => Promise<void>) => { await fn(); router.push('/tv/audyn/player'); };
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 36, gap: 20 }}>
      <View style={{ flexDirection: 'row', gap: 32 }}>
        <View style={{ width: Math.round(width * 0.26), aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.panel }}>
          {b.coverUrl ? <Image source={{ uri: b.coverUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : null}
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Txt weight="extrabold" size={26}>{b.title}</Txt>
          <Txt size={16} color={colors.text2}>{[b.author || b.narrator, `${b.chapters.length} ${t('tv.chapters')}`, b.durationSeconds ? fmtLong(b.durationSeconds) : ''].filter(Boolean).join(' · ')}</Txt>
          {!b.access.full ? <Txt size={15} color={colors.goldLight}>{t('tv.audynPreview')}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 }}>
            <Focusable first accessibilityRole="button" radius={999} style={[btn, { backgroundColor: colors.gold }]} onPress={() => { void go(() => au.openResume(b)); }}>
              <Txt weight="extrabold" size={18} color="#111">▶ {saved ? t('tv.resume') : t('tv.listen')}</Txt>
            </Focusable>
            {saved ? (
              <Focusable accessibilityRole="button" radius={999} style={[btn, { backgroundColor: colors.panel }]} onPress={() => { void go(() => au.open(b, 0, 0)); }}>
                <Txt weight="bold" size={18}>{t('tv.fromStart')}</Txt>
              </Focusable>
            ) : null}
          </View>
          {b.description ? <Txt size={15} color={colors.text2} numberOfLines={6} style={{ lineHeight: 22, marginTop: 6 }}>{b.description}</Txt> : null}
        </View>
      </View>
      {b.chapters.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Txt weight="extrabold" size={19}>{t('tv.chaptersTitle')}</Txt>
          {b.chapters.map((c, i) => (
            <Focusable key={c.id} accessibilityRole="button" disabled={!c.playable} onPress={() => { void go(() => au.open(b, i, 0)); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.panel, opacity: c.playable ? 1 : 0.45 }}>
              <Txt weight="bold" size={15} color={colors.goldLight} style={{ width: 30 }}>{i + 1}</Txt>
              <Txt size={15} style={{ flex: 1 }} numberOfLines={1}>{c.title}</Txt>
              <Txt size={13} color={colors.text2}>{fmtClock(c.durationSeconds)}</Txt>
            </Focusable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
