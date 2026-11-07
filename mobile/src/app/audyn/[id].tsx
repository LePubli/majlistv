// Audyn : fiche d'un livre (pochette, description, chapitres). Écouter / reprendre là où l'on s'est arrêté.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import { fmtClock, fmtLong, resumePoint, type AudynDetail } from '@/lib/audyn';
import { SITE_URL } from '@/lib/config';
import { Linking } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, Loading, ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { Cover } from '@/components/AudynParts';

export default function AudynBook() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, dirStyle } = useSession();
  const au = useAudyn();
  const d = useAsync(() => api.get<AudynDetail>(`/audyn/${id}`), [id]);
  const [saved, setSaved] = useState<{ index: number; pos: number } | null>(null);
  const book = d.data;

  useEffect(() => {
    if (!book) return;
    void au.savedFor(book.id).then((s) => setSaved(s ? resumePoint(book.chapters, s as never) : null));
  }, [book?.id, au.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = au.book?.id === id;
  const goPlayer = () => router.push('/audyn/player');
  const play = async (index: number, pos = 0) => { if (!book) return; goPlayer(); await au.open(book, index, pos); };
  const resume = async () => { if (!book) return; goPlayer(); await au.openResume(book); };

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={book?.title ?? t('aud.title')} />
      {d.loading && !book ? <Loading /> : !book ? <ErrorBox onRetry={d.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Cover url={book.coverUrl} size={200} radiusPx={radius.panel} />
            <Txt weight="extrabold" size={22} style={{ textAlign: 'center' }} accessibilityRole="header">{book.title}</Txt>
            {book.narrator || book.author ? <Txt color={colors.text2} style={{ textAlign: 'center' }}>{book.narrator ? t('aud.by', { name: book.narrator }) : book.author}</Txt> : null}
            <Txt size={13} color={colors.muted}>{book.chapters.length === 1 ? t('aud.chapter1') : t('aud.chapters', { n: book.chapters.length })} · {fmtLong(book.durationSeconds)}</Txt>
          </View>

          {book.chapters.length > 0 ? (
            <View style={{ gap: 10 }}>
              {saved && (saved.pos > 0 || saved.index > 0) ? (
                <Button label={t('aud.resume')} icon={<Feather name="play" size={18} color={colors.onGold} />} onPress={resume} />
              ) : (
                <Button label={t('aud.listen')} icon={<Feather name="play" size={18} color={colors.onGold} />} onPress={() => play(Math.max(0, book.chapters.findIndex((c) => c.playable)))} />
              )}
              {current && au.playing ? <Button variant="dark" label={t('aud.open')} onPress={goPlayer} /> : null}
            </View>
          ) : null}

          {!book.access.full ? (
            <View style={{ padding: 14, gap: 10, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold }}>
              <Txt size={14}>{t('aud.previewBox', { t: fmtClock(book.access.previewSeconds) })}</Txt>
              <Button variant="dark" label={t('aud.subscribe')} onPress={() => { void Linking.openURL(`${SITE_URL}/pricing`); }} />
            </View>
          ) : null}

          {book.description ? <Txt size={14} color={colors.text2}>{book.description}</Txt> : null}

          <View style={{ gap: 8 }}>
            {book.chapters.length === 0 ? <Txt color={colors.muted}>{t('aud.noChapters')}</Txt> : book.chapters.map((c, i) => {
              const active = current && au.index === i;
              return (
                <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.title} accessibilityState={{ disabled: !c.playable }}
                  disabled={!c.playable} onPress={() => play(i)}
                  style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card,
                    backgroundColor: colors.panel, borderWidth: 1, borderColor: active ? colors.gold : colors.borderSoft, opacity: c.playable ? (pressed ? 0.85 : 1) : 0.55 })}>
                  <Txt weight="bold" size={14} color={colors.goldLight} style={{ width: 28 }}>{i + 1}</Txt>
                  <Txt size={15} numberOfLines={2} style={{ flex: 1 }}>{c.title}</Txt>
                  <Txt size={12} color={colors.muted}>{fmtClock(c.durationSeconds)}</Txt>
                  {!c.playable ? <Feather name="lock" size={16} color={colors.muted} /> : active && au.playing ? <Feather name="volume-2" size={16} color={colors.gold} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
