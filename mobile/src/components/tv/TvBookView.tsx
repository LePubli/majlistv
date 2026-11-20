// Fiche d'un livre audio sur la télé (refonte TV-R), commune à Audyn et aux histoires du soir de l'espace Kids :
// grande couverture, titre, auteur, durée, « Écouter » / « Reprendre » / « Depuis le début », description ; parties à droite
// (OK = écouter cette partie). Les couleurs viennent de la palette (bleu nuit pour Audyn, or vif pour Kids).
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { fmtClock, fmtLong, type AudynDetail } from '@/lib/audyn';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';
import { TvButton } from './TvButton';

export type TvBookPalette = { bg: string; panel: string; accent: string; onAccent: string; text2: string; muted: string; mark: string };
export const TV_BOOK_SITE: TvBookPalette = { bg: tvc.bg, panel: tvc.panel, accent: tvc.text, onAccent: tvc.onLight, text2: tvc.text2, muted: tvc.muted, mark: tvc.accentLight };

type Props = {
  b: AudynDetail;
  pal?: TvBookPalette;
  by: string;
  saved: boolean;
  onListen: () => void;
  onFromStart?: () => void;
  onChapter: (i: number) => void;
  /** Encart sous les boutons (aperçu, prix à l'unité). */
  extra?: React.ReactNode;
};

export function TvBookView({ b, pal = TV_BOOK_SITE, by, saved, onListen, onFromStart, onChapter, extra }: Props) {
  const { t, dirStyle } = useSession();
  const { u } = useTv();
  const meta = [by, b.chapters.length > 1 ? `${b.chapters.length} ${t('tv.chapters')}` : '', b.durationSeconds ? fmtLong(b.durationSeconds) : ''].filter(Boolean).join('  ·  ');
  return (
    <View style={[{ flex: 1, flexDirection: 'row', backgroundColor: pal.bg }, dirStyle]}>
      {b.coverUrl ? <Image source={{ uri: b.coverUrl }} blurRadius={40} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.35 }} contentFit="cover" /> : null}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: pal.bg, opacity: 0.6 }} />
      <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ paddingTop: u(110), paddingBottom: u(60), paddingStart: u(96), paddingEnd: u(40), gap: u(30) }}>
        <View style={{ width: u(380), height: u(380), borderRadius: u(26), overflow: 'hidden', backgroundColor: pal.panel, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="headphones" size={u(96)} color={pal.muted} />
          {b.coverUrl ? <Image source={{ uri: b.coverUrl }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" /> : null}
        </View>
        <View style={{ gap: u(12) }}>
          <Txt weight="extrabold" size={u(54)} numberOfLines={2} style={{ lineHeight: u(60) }}>{b.title}</Txt>
          {meta ? <Txt weight="bold" size={u(24)} color={pal.text2}>{meta}</Txt> : null}
        </View>
        {extra}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u(18) }}>
          <TvButton first label={saved ? t('tv.resume') : t('tv.listen')} icon="play" onPress={onListen} accent={pal.accent} onAccent={pal.onAccent} />
          {saved && onFromStart ? <TvButton label={t('tv.fromStart')} icon="rotate-ccw" onPress={onFromStart} accent={pal.accent} onAccent={pal.onAccent} /> : null}
        </View>
        {b.description ? <Txt size={u(24)} color={pal.text2} numberOfLines={5} style={{ lineHeight: u(36), maxWidth: u(820) }}>{b.description}</Txt> : null}
      </ScrollView>
      {b.chapters.length > 1 ? (
        <ScrollView style={{ width: u(760), flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingTop: u(110), paddingBottom: u(60), paddingEnd: u(96), gap: u(14) }}>
          <Txt weight="extrabold" size={u(30)} style={{ marginBottom: u(10) }}>{t('tv.chaptersTitle')}</Txt>
          {b.chapters.map((c, i) => (
            <Focusable key={c.id} ring={false} scale={1.02} radius={u(18)} accessibilityRole="button" accessibilityLabel={c.title} disabled={!c.playable} onPress={() => onChapter(i)}>
              {(on) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(22), minHeight: u(92), paddingHorizontal: u(26), paddingVertical: u(14), borderRadius: u(18), backgroundColor: on ? pal.accent : 'rgba(255,255,255,0.06)', opacity: c.playable ? 1 : 0.45 }}>
                  <View style={{ width: u(48), height: u(48), borderRadius: u(24), alignItems: 'center', justifyContent: 'center', backgroundColor: on ? pal.onAccent : 'rgba(255,255,255,0.1)' }}>
                    <Txt weight="extrabold" size={u(22)} color={on ? pal.accent : pal.mark}>{i + 1}</Txt>
                  </View>
                  <Txt weight="bold" size={u(24)} color={on ? pal.onAccent : tvc.text} numberOfLines={2} style={{ flex: 1 }}>{c.title}</Txt>
                  {c.playable ? <Txt size={u(20)} color={on ? pal.onAccent : pal.muted}>{fmtClock(c.durationSeconds)}</Txt> : <Feather name="lock" size={u(22)} color={pal.muted} />}
                </View>
              )}
            </Focusable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
