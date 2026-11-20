// « En écoute » (Audyn) sur la télé (refonte TV-R) : fond flouté de la couverture, grande couverture, titre, partie en cours,
// barre d'avancement, commandes rondes (partie précédente, −15 s, lecture / pause, +15 s, partie suivante) ; liste des parties à
// droite (OK = écouter cette partie). Utilisé par Audyn (bleu nuit) et par les histoires du soir de l'espace Kids (or vif).
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useAudyn } from '@/lib/audynPlayer';
import { fmtClock } from '@/lib/audyn';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';
import { TvButton } from './TvButton';
import { TvMessage } from './TvMessage';

export type TvPalette = { bg: string; panel: string; track: string; accent: string; onAccent: string; text2: string; note: string };
export const siteTvPalette = (): TvPalette => ({ bg: tvc.bg, panel: tvc.panel, track: 'rgba(255,255,255,0.25)', accent: tvc.text, onAccent: tvc.onLight, text2: tvc.text2, note: tvc.accentLight });

export function TvNowPlaying({ pal }: { pal: TvPalette }) {
  const { t, dirStyle } = useSession();
  const au = useAudyn();
  const { u } = useTv();
  if (!au.book) return <TvMessage text={t('tv.nothingPlaying')} icon="headphones" bg={pal.bg} accent={pal.accent === tvc.text ? undefined : pal.accent} onAccent={pal.onAccent} />;
  const book = au.book;
  const pct = au.dur > 0 ? Math.min(1, au.pos / au.dur) : 0;
  const btn = { accent: pal.accent, onAccent: pal.onAccent };
  return (
    <View style={[{ flex: 1, flexDirection: 'row', backgroundColor: pal.bg }, dirStyle]}>
      {book.coverUrl ? <Image source={{ uri: book.coverUrl }} blurRadius={50} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.45 }} contentFit="cover" /> : null}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: pal.bg, opacity: 0.55 }} />
      <View style={{ flex: 1, paddingTop: u(110), paddingStart: u(96), paddingEnd: u(40), gap: u(30) }}>
        <View style={{ width: u(400), height: u(400), borderRadius: u(26), overflow: 'hidden', backgroundColor: pal.panel }}>
          {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" /> : null}
        </View>
        <View style={{ gap: u(10) }}>
          <Txt weight="bold" size={u(20)} color={pal.note} style={{ letterSpacing: u(2.6), textTransform: 'uppercase' }}>{t('tv.nowPlaying')}</Txt>
          <Txt weight="extrabold" size={u(50)} numberOfLines={2} style={{ lineHeight: u(56) }}>{book.title}</Txt>
          <Txt weight="bold" size={u(26)} color={pal.text2} numberOfLines={1}>{au.chapter?.title ?? ''}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(20), width: u(760) }}>
          <Txt weight="bold" size={u(22)}>{fmtClock(au.pos)}</Txt>
          <View style={{ flex: 1, height: u(8), borderRadius: u(4), backgroundColor: pal.track, overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: u(8), backgroundColor: pal.note }} />
          </View>
          <Txt weight="bold" size={u(22)} color={pal.text2}>{fmtClock(au.dur)}</Txt>
        </View>
        {au.previewEnded ? <Txt size={u(22)} color={pal.note}>{t('tv.audynPreviewEnd')}</Txt> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(22) }}>
          <TvButton circle icon="skip-back" label={t('tv.prevChapter')} onPress={au.prev} {...btn} />
          <TvButton circle text="−15" label="-15 s" onPress={() => au.skip(-15)} {...btn} />
          <TvButton first circle big icon={au.playing ? 'pause' : 'play'} label={au.playing ? t('tv.pause') : t('tv.play')} onPress={au.toggle} {...btn} />
          <TvButton circle text="+15" label="+15 s" onPress={() => au.skip(15)} {...btn} />
          <TvButton circle icon="skip-forward" label={t('tv.nextChapter')} onPress={au.next} {...btn} />
        </View>
      </View>
      {book.chapters.length > 1 ? (
        <ScrollView style={{ width: u(760), flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingTop: u(110), paddingBottom: u(60), paddingEnd: u(96), gap: u(14) }}>
          <Txt weight="extrabold" size={u(30)} style={{ marginBottom: u(10) }}>{t('tv.chaptersTitle')}</Txt>
          {book.chapters.map((c, i) => {
            const cur = i === au.index;
            return (
              <Focusable key={c.id} ring={false} scale={1.02} radius={u(18)} accessibilityRole="button" accessibilityLabel={c.title} accessibilityState={{ selected: cur }}
                disabled={!c.playable} onPress={() => { void au.open(book, i, 0); }}>
                {(on) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(22), minHeight: u(92), paddingHorizontal: u(26), paddingVertical: u(14), borderRadius: u(18), opacity: c.playable ? 1 : 0.45,
                    backgroundColor: on ? pal.accent : cur ? 'rgba(22,119,232,0.25)' : 'rgba(255,255,255,0.05)' }}>
                    <View style={{ width: u(48), height: u(48), borderRadius: u(24), alignItems: 'center', justifyContent: 'center', backgroundColor: on ? pal.onAccent : cur ? pal.note : 'rgba(255,255,255,0.1)' }}>
                      <Txt weight="extrabold" size={u(22)} color={on ? pal.accent : cur ? pal.bg : tvc.text2}>{i + 1}</Txt>
                    </View>
                    <Txt weight="bold" size={u(24)} color={on ? pal.onAccent : tvc.text} numberOfLines={2} style={{ flex: 1 }}>{c.title}</Txt>
                    <Txt size={u(20)} color={on ? pal.onAccent : pal.text2}>{fmtClock(c.durationSeconds)}</Txt>
                  </View>
                )}
              </Focusable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
