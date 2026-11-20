// Vignette d'une vidéo sur la télé (refonte TV-R) : image 16:9 arrondie, titre et intervenant dessous ; barre de progression pour
// « Continuer ». La vignette choisie grandit avec un cadre blanc et son titre passe en blanc ; les autres restent calmes.
import React from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import type { Card } from '@/lib/types';
import { thumbOf } from '@/lib/media';
import { tvLeftMin } from '@/lib/tv';
import { tvc, tvGradient, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

export function TvCard({ talk, first, width, onFocusTalk, meta }: { talk: Card; first?: boolean; width: number; onFocusTalk?: (t: Card) => void; meta?: string }) {
  const { t } = useSession();
  const { u } = useTv();
  const pct = talk.positionMs && talk.durationMs ? Math.min(1, talk.positionMs / talk.durationMs) : 0;
  const left = pct ? tvLeftMin(talk.positionMs, talk.durationSeconds || (talk.durationMs ? talk.durationMs / 1000 : 0)) : 0;
  const sub = meta ?? [talk.speaker, left ? t('tv.leftMin', { n: left }) : ''].filter(Boolean).join(' · ');
  const uri = thumbOf(talk);
  const g = tvGradient(talk.id);
  return (
    <Focusable first={first} ring={false} scale={1.08} radius={u(16)} accessibilityRole="button" accessibilityLabel={talk.title}
      onFocus={() => onFocusTalk?.(talk)} onPress={() => router.push({ pathname: '/tv/talk/[id]', params: { id: talk.id } })} style={{ width }}>
      {(on) => (
        <View style={{ gap: u(10) }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: u(16), overflow: 'hidden', backgroundColor: tvc.panel, borderWidth: on ? u(5) : 0, borderColor: tvc.text }}>
            <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
            {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} /> : (
              <View style={{ flex: 1, justifyContent: 'flex-end', padding: u(14) }}><Txt weight="bold" size={u(20)} numberOfLines={3}>{talk.title}</Txt></View>
            )}
            {pct > 0 ? (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: u(6), backgroundColor: 'rgba(255,255,255,0.22)' }}>
                <View style={{ width: `${pct * 100}%`, height: u(6), backgroundColor: tvc.accent }} />
              </View>
            ) : null}
          </View>
          <Txt weight="bold" size={u(on ? 23 : 22)} color={on ? tvc.text : tvc.text2} numberOfLines={1}>{talk.title}</Txt>
          {sub ? <Txt size={u(19)} color={tvc.muted} numberOfLines={1} style={{ marginTop: -u(6) }}>{sub}</Txt> : null}
        </View>
      )}
    </Focusable>
  );
}

/** Rangée horizontale de vignettes avec son titre (accueil, fiche). */
export function TvRow({ title, talks, first, cardW, onFocusTalk, padStart }: { title: string; talks: Card[]; first?: boolean; cardW: number; onFocusTalk?: (t: Card) => void; padStart: number }) {
  const { u } = useTv();
  return (
    <View style={{ gap: u(14) }}>
      <Txt weight="extrabold" size={u(30)} style={{ paddingHorizontal: padStart }}>{title}</Txt>
      <FlatList horizontal data={talks} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingStart: padStart, paddingEnd: u(96), gap: u(28), paddingVertical: u(14) }}
        renderItem={({ item, index }) => <TvCard talk={item} width={cardW} first={first && index === 0} onFocusTalk={onFocusTalk} />} />
    </View>
  );
}
