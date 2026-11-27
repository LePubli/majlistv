// Vignette d'une vidéo, comme sur le site : miniature 16/9, badge (Gratuit / Premium / À passer / À réviser / Épisode suivant),
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
import { useFormatName } from '@/lib/formats';
import { Txt } from './ui';

export function Poster({ talk, radiusPx = radius.thumb, ratio = 16 / 9, children }: { talk: Pick<Card, 'id' | 'posterUrl' | 'source' | 'video_ref'>; radiusPx?: number; ratio?: number; children?: React.ReactNode }) {
  const g = gradientFor(talk.id);
  const uri = thumbOf(talk);
  return (
    <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radiusPx, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: radiusPx ? 1 : 0, borderColor: colors.borderSoft }}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={150} /> : null}
      {children}
    </View>
  );
}

export function openTalk(id: string, quiz = false) {
  router.push({ pathname: '/talk/[id]', params: quiz ? { id, quiz: '1' } : { id } });
}

export function Badge({ label, premium, accent, top = 8 }: { label: string; premium?: boolean; accent?: boolean; top?: number }) {
  const gold = premium || accent;
  return (
    <View style={{ position: 'absolute', start: 8, top, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: gold ? colors.gold : 'rgba(0,0,0,0.67)' }}>
      <Txt weight={gold ? 'bold' : 'medium'} size={11} color={gold ? colors.onGold : colors.text}>{label}</Txt>
    </View>
  );
}

/** Pastille ronde du format (Conférence, Cours…), en haut à gauche de la vignette. */
export function FormatPill({ label }: { label: string }) {
  if (!label) return null;
  return (
    <View style={{ position: 'absolute', start: 8, top: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' }}>
      <Txt weight="bold" size={11}>{label}</Txt>
    </View>
  );
}

/** Durée « mm:ss » ou « h:mm:ss » pour la pastille en haut à droite. */
export function clock(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/** variant : 'wide' (16/9, défaut), 'big' (16/9 plus grande) ou 'tall' (affiche 2/3) — comme les rangées du site. */
export function TalkCard({ talk, width, progress, variant = 'wide' }: { talk: Card; width?: number; progress?: number; variant?: 'wide' | 'tall' | 'big' }) {
  const { t, config } = useSession();
  const fmtName = useFormatName();
  const fmt = on_(config, 'format') ? fmtName(talk.format) : '';
  const show = config?.cards?.show ?? {};
  const on = (k: string) => show[k] !== false;
  const pct = progress ?? progressOf(talk);
  const mins = clock(talk.durationSeconds);
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
      <Poster talk={talk} ratio={variant === 'tall' ? 2 / 3 : 16 / 9} radiusPx={radius.card}>
        <FormatPill label={fmt} />
        {badge ? <Badge top={fmt ? 34 : 8} label={badge} premium={!talk.quizState && !talk.nextUp && talk.access === 'premium'} accent={!!talk.quizState || !!talk.nextUp} /> : null}
        {on('duration') && mins ? (
          <View style={{ position: 'absolute', end: 8, top: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <Txt weight="medium" size={11}>{mins}</Txt>
          </View>
        ) : null}
        {pct > 0 && on('progress') ? (
          <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.22)' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: 4, backgroundColor: colors.gold }} />
          </View>
        ) : null}
      </Poster>
      <Txt weight="extrabold" size={variant === 'big' ? 16 : 14} color="#fff" numberOfLines={2} style={{ marginTop: 2 }}>{talk.title}</Txt>
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

function on_(config: { cards?: { show?: Record<string, boolean> } } | null | undefined, k: string) { return (config?.cards?.show ?? {})[k] !== false; }
