// Histoire du soir sur la télé : couverture, « Écouter » / « Reprendre », chapitres ; la lecture s'ouvre sur l'écran « En écoute » aux couleurs Kids.
import React, { useEffect, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import { audynResumeId, fmtClock, fmtLong, type AudynDetail } from '@/lib/audyn';
import { KC } from '@/lib/kids';
import { Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';

export default function TvKidsStory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSession();
  const { kid, kidApi, epoch } = useKid();
  const au = useAudyn();
  const { width } = useWindowDimensions();
  const [saved, setSaved] = useState(false);
  const d = useAsync(async () => {
    const r = await kidApi.get<AudynDetail>(`/kids/stories/${id}`);
    return { ...r, kids: true, resumeId: `kid-${kid?.profile.id}-${r.id}` } as AudynDetail;
  }, [id, kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = d.data;
  useEffect(() => { if (b) void au.savedFor(audynResumeId(b)).then((s) => setSaved(!!s)); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return <Redirect href="/tv/kids" />;
  if (!b) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.bg }}><Txt color={KC.text2}>{d.error ? t('common.error') : '…'}</Txt></View>;
  const first = Math.max(0, b.chapters.findIndex((c) => c.playable));
  const go = async (fn: () => Promise<void>) => { await fn(); router.push('/tv/kids/listen'); };
  const btn = { paddingVertical: 12, paddingHorizontal: 24 } as const;
  return (
    <ScrollView style={{ backgroundColor: KC.bg }} contentContainerStyle={{ padding: 36, gap: 20 }}>
      <View style={{ flexDirection: 'row', gap: 32 }}>
        <View style={{ width: Math.round(width * 0.24), aspectRatio: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: KC.surface }}>
          {b.coverUrl ? <Image source={{ uri: b.coverUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : null}
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Txt weight="extrabold" size={26} color={KC.text}>{b.title}</Txt>
          <Txt size={15} color={KC.text2}>{[b.narrator ? t('aud.by', { name: b.narrator }) : '', b.durationSeconds ? fmtLong(b.durationSeconds) : ''].filter(Boolean).join(' · ')}</Txt>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
            <Focusable first accessibilityRole="button" radius={999} style={[btn, { backgroundColor: KC.accent }]}
              onPress={() => { void go(() => (saved ? au.openResume(b) : au.open(b, first, 0))); }}>
              <Txt weight="extrabold" size={18} color={KC.onAccent}>▶ {saved ? t('tv.resume') : t('tv.listen')}</Txt>
            </Focusable>
          </View>
          {b.description ? <Txt size={15} color={KC.text2} numberOfLines={5} style={{ lineHeight: 22 }}>{b.description}</Txt> : null}
        </View>
      </View>
      {b.chapters.length > 1 ? b.chapters.map((c, i) => (
        <Focusable key={c.id} accessibilityRole="button" disabled={!c.playable} onPress={() => { void go(() => au.open(b, i, 0)); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: KC.surface, opacity: c.playable ? 1 : 0.45 }}>
          <Txt weight="bold" size={15} color={KC.accent} style={{ width: 30 }}>{i + 1}</Txt>
          <Txt size={15} color={KC.text} style={{ flex: 1 }} numberOfLines={1}>{c.title}</Txt>
          <Txt size={13} color={KC.text2}>{fmtClock(c.durationSeconds)}</Txt>
        </Focusable>
      )) : null}
    </ScrollView>
  );
}
