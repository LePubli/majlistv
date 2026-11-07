// Histoire du soir : pochette, chapitres et lecteur. Le minuteur de sommeil n'apparaît que si le parent l'a autorisé ; l'arrêt automatique réglé
// par le parent démarre avec la lecture. Reprise propre à l'enfant. Le mode veille met l'écran en noir.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import { SLEEP_CHOICES, audynResumeId, canSetTimer, fmtClock, fmtLong, resumePoint, type AudynDetail } from '@/lib/audyn';
import { KC } from '@/lib/kids';
import { KButton, KScreen, KTxt } from '@/components/kids/KidUi';
import { Cover, RoundBtn, SeekBar } from '@/components/AudynParts';

export default function KidsStory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSession();
  const { kid, kidApi, epoch } = useKid();
  const au = useAudyn();
  const [sheet, setSheet] = useState(false);
  const [dark, setDark] = useState(false);
  const [saved, setSaved] = useState<{ index: number; pos: number } | null>(null);
  const d = useAsync(async () => {
    const r = await kidApi.get<AudynDetail>(`/kids/stories/${id}`);
    return { ...r, kids: true, resumeId: `kid-${kid?.profile.id}-${r.id}` } as AudynDetail;
  }, [id, kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const book = d.data;
  useEffect(() => {
    if (!book) return;
    void au.savedFor(audynResumeId(book)).then((s) => setSaved(s ? resumePoint(book.chapters, s as never) : null));
  }, [book?.id, au.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return <Redirect href="/kids" />;

  const current = !!book && au.book?.id === book.id;
  const timerOk = !!book && canSetTimer(book);
  const timerText = au.timer.endOfChapter ? t('aud.sleepLeftEnd') : au.timerLeftMs != null ? t('aud.sleepLeft', { t: fmtClock(au.timerLeftMs / 1000) }) : '';
  const firstOk = book ? Math.max(0, book.chapters.findIndex((c) => c.playable)) : 0;

  if (dark && current) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t('aud.darkHint')} onPress={() => setDark(false)}
        style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48 }}>
        <StatusBar hidden />
        <KTxt size={13} color="#3a3a3a">{timerText || t('aud.darkHint')}</KTxt>
      </Pressable>
    );
  }

  return (
    <KScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('aud.kBack')} hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/kids/stories'))}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
          <Feather name="arrow-left" size={20} color={KC.text2} />
        </Pressable>
        <KTxt weight="extrabold" size={18} numberOfLines={1} style={{ flex: 1 }}>{book?.title ?? t('aud.kTitle')}</KTxt>
      </View>
      {d.loading && !book ? <KTxt style={{ padding: 20 }} color={KC.text2}>…</KTxt> : !book ? (
        <View style={{ padding: 20, gap: 12 }}><KTxt color={KC.text2}>{t('aud.kMissing')}</KTxt><KButton label={t('common.retry')} variant="soft" onPress={d.reload} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Cover url={book.coverUrl} size={180} radiusPx={22} />
            <KTxt weight="extrabold" size={22} style={{ textAlign: 'center' }} accessibilityRole="header">{book.title}</KTxt>
            {book.narrator ? <KTxt color={KC.text2}>{t('aud.by', { name: book.narrator })}</KTxt> : null}
            <KTxt size={13} color={KC.muted}>{book.chapters.length === 1 ? t('aud.chapter1') : t('aud.chapters', { n: book.chapters.length })} · {fmtLong(book.durationSeconds)}</KTxt>
          </View>

          {saved && (saved.pos > 0 || saved.index > 0)
            ? <KButton label={t('aud.resume')} icon={<Feather name="play" size={18} color={KC.onAccent} />} onPress={() => void au.openResume(book)} />
            : <KButton label={t('aud.listen')} icon={<Feather name="play" size={18} color={KC.onAccent} />} onPress={() => void au.open(book, firstOk, 0)} />}
          {!book.access.full ? <KTxt color={KC.accent}>{t('aud.kLocked')}</KTxt> : null}

          {current && au.chapter ? (
            <View style={{ gap: 12, padding: 14, borderRadius: 20, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.accent }}>
              <KTxt weight="extrabold" size={16} numberOfLines={2} style={{ textAlign: 'center' }}>{au.chapter.title}</KTxt>
              <View>
                <SeekBar pos={au.pos} dur={au.dur} onSeek={au.seekTo} label={t('aud.progress')} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <KTxt size={12} color={KC.muted}>{fmtClock(au.pos)}</KTxt><KTxt size={12} color={KC.muted}>{fmtClock(au.dur)}</KTxt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <RoundBtn icon="rotate-ccw" label={t('aud.back15')} onPress={() => au.skip(-15)} />
                <RoundBtn big icon={au.loading ? 'loader' : au.playing ? 'pause' : 'play'} label={au.playing ? t('aud.pause') : t('aud.play')} onPress={au.toggle} disabled={au.loading} />
                <RoundBtn icon="rotate-cw" label={t('aud.fwd15')} onPress={() => au.skip(15)} />
              </View>
              {au.err ? <KTxt color={KC.danger} style={{ textAlign: 'center' }} accessibilityRole="alert">{t('aud.err')}</KTxt> : null}
              {au.previewEnded ? <KTxt color={KC.accent} style={{ textAlign: 'center' }} accessibilityRole="alert">{t('aud.kPreviewEnded')}</KTxt> : null}
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                {timerOk
                  ? <KButton variant="soft" label={timerText || t('aud.sleep')} icon={<Feather name="moon" size={16} color={KC.text} />} onPress={() => setSheet(true)} />
                  : timerText ? <KTxt size={13} color={KC.text2}>🌙 {timerText}</KTxt> : null}
                <KButton variant="soft" label={t('aud.dark')} icon={<Feather name="eye-off" size={16} color={KC.text} />} onPress={() => setDark(true)} />
                <KButton variant="ghost" label={t('aud.stop')} onPress={au.stop} />
              </View>
            </View>
          ) : null}

          {book.description ? <KTxt size={14} color={KC.text2}>{book.description}</KTxt> : null}
          <View style={{ gap: 8 }}>
            {book.chapters.map((c, i) => {
              const active = current && au.index === i;
              return (
                <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.title} accessibilityState={{ disabled: !c.playable }} disabled={!c.playable}
                  onPress={() => void au.open(book, i, 0)}
                  style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: KC.surface,
                    borderWidth: 2, borderColor: active ? KC.accent : KC.line, opacity: c.playable ? (pressed ? 0.85 : 1) : 0.55 })}>
                  <KTxt weight="bold" size={14} color={KC.accent} style={{ width: 26 }}>{i + 1}</KTxt>
                  <KTxt size={15} numberOfLines={2} style={{ flex: 1 }}>{c.title}</KTxt>
                  <KTxt size={12} color={KC.muted}>{fmtClock(c.durationSeconds)}</KTxt>
                  {!c.playable ? <Feather name="lock" size={16} color={KC.muted} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setSheet(false)} accessibilityLabel={t('common.close')}>
          <Pressable style={{ backgroundColor: KC.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 10, borderWidth: 2, borderColor: KC.line }}>
            <KTxt weight="extrabold" size={18} accessibilityRole="header">{t('aud.sleep')}</KTxt>
            <KTxt size={13} color={KC.text2}>{t('aud.sleepHelp')}</KTxt>
            {SLEEP_CHOICES.map((m) => (
              <KButton key={m} variant="soft" label={m === 0 ? t('aud.sleepEnd') : t('aud.sleepMin', { n: m })} onPress={() => { au.setSleep(m); setSheet(false); }} />
            ))}
            {au.timer.endAt || au.timer.endOfChapter ? <KButton variant="ghost" label={t('aud.sleepOff')} onPress={() => { au.setSleep(null); setSheet(false); }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </KScreen>
  );
}
