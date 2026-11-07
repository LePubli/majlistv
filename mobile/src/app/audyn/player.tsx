// Audyn : lecteur plein écran. Commandes, vitesse, minuteur de sommeil (fondu du volume) et mode veille (écran noir).
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAudyn } from '@/lib/audynPlayer';
import { SLEEP_CHOICES, fmtClock } from '@/lib/audyn';
import { SITE_URL } from '@/lib/config';
import { Linking } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { Button, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { Cover, RoundBtn, SeekBar } from '@/components/AudynParts';

export default function AudynPlayerScreen() {
  const { t, dirStyle } = useSession();
  const au = useAudyn();
  const [sheet, setSheet] = useState(false);
  const [dark, setDark] = useState(false);
  const book = au.book;
  const timerText = au.timer.endOfChapter ? t('aud.sleepLeftEnd') : au.timerLeftMs != null ? t('aud.sleepLeft', { t: fmtClock(au.timerLeftMs / 1000) }) : '';

  if (!book || !au.chapter) {
    return (
      <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
        <ScreenHeader title={t('aud.player')} />
        <View style={{ padding: 16, gap: 12 }}>
          <Txt color={colors.muted}>{t('aud.empty')}</Txt>
          <Button variant="dark" label={t('aud.title')} onPress={() => router.replace('/audyn')} />
        </View>
      </SafeAreaView>
    );
  }

  // Mode veille : écran entièrement noir (économise l'écran OLED, n'éclaire pas la chambre) ; un toucher revient au lecteur.
  if (dark) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t('aud.darkHint')} onPress={() => setDark(false)}
        style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48 }}>
        <StatusBar hidden />
        <Txt size={13} color="#3a3a3a">{timerText || t('aud.darkHint')}</Txt>
      </Pressable>
    );
  }

  const first = au.index <= 0;
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={book.title} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, alignItems: 'stretch' }}>
        <View style={{ alignItems: 'center' }}><Cover url={book.coverUrl} size={240} radiusPx={radius.panel} /></View>
        <View style={{ gap: 4, alignItems: 'center' }}>
          <Txt weight="extrabold" size={19} numberOfLines={2} style={{ textAlign: 'center' }}>{au.chapter.title}</Txt>
          <Txt size={13} color={colors.text2} numberOfLines={1}>{book.narrator ? t('aud.by', { name: book.narrator }) : book.author}</Txt>
        </View>

        <View>
          <SeekBar pos={au.pos} dur={au.dur} onSeek={au.seekTo} label={t('aud.progress')} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={12} color={colors.muted}>{fmtClock(au.pos)}</Txt>
            <Txt size={12} color={colors.muted}>{fmtClock(au.dur)}</Txt>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <RoundBtn icon="skip-back" label={t('aud.prevCh')} onPress={au.prev} disabled={first && au.pos <= 5} />
          <RoundBtn icon="rotate-ccw" label={t('aud.back15')} onPress={() => au.skip(-15)} />
          <RoundBtn big icon={au.loading ? 'loader' : au.playing ? 'pause' : 'play'} label={au.playing ? t('aud.pause') : t('aud.play')} onPress={au.toggle} disabled={au.loading} />
          <RoundBtn icon="rotate-cw" label={t('aud.fwd15')} onPress={() => au.skip(15)} />
          <RoundBtn icon="skip-forward" label={t('aud.nextCh')} onPress={au.next} disabled={au.index >= book.chapters.length - 1} />
        </View>

        {au.err ? <Txt color={colors.danger ?? '#ff6b6b'} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{t('aud.err')}</Txt> : null}
        {au.previewEnded ? (
          <View style={{ padding: 14, gap: 10, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold }}>
            <Txt size={14} accessibilityLiveRegion="polite">{t('aud.previewEnded')}</Txt>
            <Button variant="dark" label={t('aud.subscribe')} onPress={() => { void Linking.openURL(`${SITE_URL}/pricing`); }} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="dark" label={t('aud.speed', { x: au.speed })} onPress={au.cycleSpeed} icon={<Feather name="fast-forward" size={16} color={colors.text} />} />
          <Button variant="dark" label={timerText || t('aud.sleep')} onPress={() => setSheet(true)} icon={<Feather name="moon" size={16} color={colors.text} />} />
          <Button variant="dark" label={t('aud.dark')} onPress={() => setDark(true)} icon={<Feather name="eye-off" size={16} color={colors.text} />} />
        </View>
        <Button variant="ghost" label={t('aud.stop')} onPress={() => { au.stop(); router.back(); }} />
      </ScrollView>

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setSheet(false)} accessibilityLabel={t('common.close')}>
          <Pressable style={[{ backgroundColor: colors.bg, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, padding: 20, gap: 10, borderWidth: 1, borderColor: colors.border }, dirStyle]}>
            <Txt weight="extrabold" size={18} accessibilityRole="header">{t('aud.sleep')}</Txt>
            <Txt size={13} color={colors.text2}>{t('aud.sleepHelp')}</Txt>
            {SLEEP_CHOICES.map((m) => (
              <Button key={m} variant="dark" label={m === 0 ? t('aud.sleepEnd') : t('aud.sleepMin', { n: m })} onPress={() => { au.setSleep(m); setSheet(false); }} />
            ))}
            {au.timer.endAt || au.timer.endOfChapter ? <Button variant="ghost" label={t('aud.sleepOff')} onPress={() => { au.setSleep(null); setSheet(false); }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
