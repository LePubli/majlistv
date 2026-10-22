// Vignette d'une conférence, comme sur le site : miniature 16/9, badge (Gratuit / Premium / À passer / À réviser / Épisode suivant),
// durée, barre de progression, titre, niveau, intervenant · catégorie (ou série · S1 É3).
import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { Card } from '@/lib/types';
import { colors, gradientFor, radius } from '@/lib/theme';
import { LEVEL_COLOR, levelLabel, minutesLabel, progressOf, subLine, thumbOf } from '@/lib/media';
import { useSession } from '@/lib/session';
import { Txt } from './ui';

export function Poster({ talk, radiusPx = radius.thumb, children }: { talk: Pick<Card, 'id' | 'posterUrl' | 'source' | 'video_ref'>; radiusPx?: number; children?: React.ReactNode }) {
  const g = gradientFor(talk.id);
  const uri = thumbOf(talk);
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radiusPx, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: radiusPx ? 1 : 0, borderColor: colors.borderSoft }}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={150} /> : null}
      {children}
    </View>
  );
}

export function openTalk(id: string, quiz = false) {
  router.push({ pathname: '/talk/[id]', params: quiz ? { id, quiz: '1' } : { id } });
}

export function Badge({ label, premium, accent }: { label: string; premium?: boolean; accent?: boolean }) {
  const gold = premium || accent;
  return (
    <View style={{ position: 'absolute', start: 8, top: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: gold ? colors.gold : 'rgba(0,0,0,0.67)' }}>
      <Txt weight={gold ? 'bold' : 'medium'} size={11} color={gold ? colors.onGold : colors.text}>{label}</Txt>
    </View>
  );
}

export function TalkCard({ talk, width, progress }: { talk: Card; width?: number; progress?: number }) {
  const { t, config } = useSession();
  const show = config?.cards?.show ?? {};
  const on = (k: string) => show[k] !== false;
  const pct = progress ?? progressOf(talk);
  const mins = minutesLabel(talk.durationSeconds, t);
  const sub = subLine(talk, t, { speaker: on('speaker'), category: on('category') });
  const lvl = levelLabel(talk.level, t);
  const badge = talk.quizState
    ? (talk.quizState === 'retry' ? `${t('qpRevise')} · ${talk.bestPercent ?? 0} %` : talk.quizState === 'review' ? t('revBadge') : t('qpTodo'))
    : talk.nextUp ? t('nextEp') : on('access') ? t(talk.access) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${talk.title}, ${talk.speaker}`}
      onPress={() => openTalk(talk.id, !!talk.quizState && talk.quizState !== 'review')}
      style={({ pressed }) => ({ width: width ?? '100%', gap: 6, opacity: pressed ? 0.85 : 1 })}
    >
      <Poster talk={talk}>
        {badge ? <Badge label={badge} premium={!talk.quizState && !talk.nextUp && talk.access === 'premium'} accent={!!talk.quizState || !!talk.nextUp} /> : null}
        {on('duration') && mins ? (
          <View style={{ position: 'absolute', end: 8, bottom: pct ? 10 : 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.75)' }}>
            <Txt weight="medium" size={11}>{mins}</Txt>
          </View>
        ) : null}
        {pct > 0 && on('progress') ? (
          <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.22)' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: 4, backgroundColor: colors.gold }} />
          </View>
        ) : null}
      </Poster>
      <Txt weight="bold" size={14} numberOfLines={2} style={{ marginTop: 2 }}>{talk.title}</Txt>
      {(lvl || sub) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {lvl && talk.level ? (
            <View style={{ paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: LEVEL_COLOR[talk.level] }}>
              <Txt weight="medium" size={10} color={LEVEL_COLOR[talk.level]}>{lvl}</Txt>
            </View>
          ) : null}
          {sub ? <Txt size={12} color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{sub}</Txt> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
