// « En écoute » (Audyn) sur la télé : grande couverture, chapitre, barre d'avancement, commandes à la télécommande.
import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useAudyn } from '@/lib/audynPlayer';
import { fmtClock } from '@/lib/audyn';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';


export default function TvAudynPlayer() {
  const { t } = useSession();
  const au = useAudyn();
  const btn = { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999, backgroundColor: colors.panel } as const;
  const { width } = useWindowDimensions();
  if (!au.book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.bg }}>
        <Txt>{t('tv.nothingPlaying')}</Txt>
        <Focusable first accessibilityRole="button" onPress={() => router.back()} radius={999} style={btn}><Txt weight="bold">{t('tv.back')}</Txt></Focusable>
      </View>
    );
  }
  const pct = au.dur > 0 ? Math.min(1, au.pos / au.dur) : 0;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 40, padding: 48, backgroundColor: colors.bg }}>
      <View style={{ width: Math.round(width * 0.3), aspectRatio: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.panel }}>
        {au.book.coverUrl ? <Image source={{ uri: au.book.coverUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : null}
      </View>
      <View style={{ flex: 1, gap: 14 }}>
        <Txt weight="extrabold" size={26} numberOfLines={2}>{au.book.title}</Txt>
        <Txt size={17} color={colors.text2} numberOfLines={1}>{au.chapter?.title ?? ''}</Txt>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.panel2, overflow: 'hidden' }}>
          <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: colors.gold }} />
        </View>
        <Txt size={14} color={colors.text2}>{fmtClock(au.pos)} / {fmtClock(au.dur)}</Txt>
        {au.previewEnded ? <Txt size={15} color={colors.goldLight}>{t('tv.audynPreviewEnd')}</Txt> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
          <Focusable accessibilityRole="button" accessibilityLabel={t('tv.prevChapter')} onPress={au.prev} radius={999} style={btn}><Txt weight="bold" size={17}>⏮</Txt></Focusable>
          <Focusable accessibilityRole="button" accessibilityLabel="-15 s" onPress={() => au.skip(-15)} radius={999} style={btn}><Txt weight="bold" size={17}>⟲ 15 s</Txt></Focusable>
          <Focusable first accessibilityRole="button" accessibilityLabel={au.playing ? t('tv.pause') : t('tv.play')} onPress={au.toggle} radius={999} style={[btn, { backgroundColor: colors.gold, paddingHorizontal: 30 }]}>
            <Txt weight="extrabold" size={18} color="#111">{au.playing ? `❚❚ ${t('tv.pause')}` : `▶ ${t('tv.play')}`}</Txt>
          </Focusable>
          <Focusable accessibilityRole="button" accessibilityLabel="+15 s" onPress={() => au.skip(15)} radius={999} style={btn}><Txt weight="bold" size={17}>15 s ⟳</Txt></Focusable>
          <Focusable accessibilityRole="button" accessibilityLabel={t('tv.nextChapter')} onPress={au.next} radius={999} style={btn}><Txt weight="bold" size={17}>⏭</Txt></Focusable>
        </View>
      </View>
    </View>
  );
}
