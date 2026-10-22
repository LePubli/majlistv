// Blocs de la fiche : « Apprendre avec cette conférence », verrouillage / aperçu, panneau de série, barre d'actions.
import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { formatClock } from '@/lib/format';
import type { SeriesCtx, Talk } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '../ui';

/** Étapes regarder → comprendre → retenir → pratiquer, avec les boutons qui existent pour cette conférence. */
export function LearnCard({ talk }: { talk: Talk }) {
  const { t, user, config } = useSession();
  const quiz = talk.quiz?.available;
  const practice = talk.practice?.available;
  if (!quiz && !practice) return null;
  const go = (path: '/quiz/[id]' | '/practice/[id]') => (user ? router.push({ pathname: path, params: { id: talk.id } }) : router.push({ pathname: '/login', params: { mode: 'register' } }));
  return (
    <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine, gap: 12 }}>
      <Txt weight="extrabold" size={17} color={colors.goldLight}>{t('wbLearn')}</Txt>
      {quiz ? <Step n={2} title={t('wbStep2')} sub={t('wbStep2Sub')} go={t('wbStep2Go')} onPress={() => go('/quiz/[id]')} /> : null}
      {quiz && config?.features?.revision !== false ? <Step n={3} title={t('wbStep3')} sub={t('wbStep3Sub')} /> : null}
      {practice ? <Step n={4} title={t('pzTitle')} sub={t('pzOfferText')} go={t('pzOfferBtn')} onPress={() => go('/practice/[id]')} /> : null}
    </View>
  );
}

function Step({ n, title, sub, go, onPress }: { n: number; title: string; sub: string; go?: string; onPress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' }}>
        <Txt weight="extrabold" size={13} color={colors.goldLight}>{n}</Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold" size={15}>{title}</Txt>
        <Txt size={13} color={colors.muted}>{sub}</Txt>
        {go && onPress ? (
          <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Txt weight="bold" size={14} color={colors.goldLight}>{go} ›</Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Carte affichée quand la conférence est verrouillée (aperçu seulement) : l'abonnement se prend sur le site. */
export function LockCard({ talk }: { talk: Talk }) {
  const { t, user, config } = useSession();
  const minutes = Math.max(1, Math.round((talk.previewSeconds || 120) / 60));
  return (
    <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine, gap: 10 }}>
      <Txt weight="extrabold" size={17} color={colors.goldLight}>{t('lkTitle')}</Txt>
      <Txt size={14} color={colors.text2}>{t('lkIntro')}</Txt>
      {[t('lkB1'), t('lkB2'), t('lkB3')].map((b, i) => <Txt key={i} size={14} color={colors.text2}>✓ {b}</Txt>)}
      <Txt size={13} color={colors.muted}>{t('previewMsg', { min: minutes })}</Txt>
      {!user ? <Button label={config?.trialDays ? t('lkTrial', { days: config.trialDays }) : t('register')} onPress={() => router.push({ pathname: '/login', params: { mode: 'register' } })} /> : null}
      {!user ? <Button label={t('lkHave')} variant="dark" onPress={() => router.push('/login')} /> : null}
      <Button label={t('lkPlans')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/pricing`)} />
    </View>
  );
}

/** Épisodes de la série de la conférence ; touche un épisode pour l'ouvrir. */
export function SeriesPanel({ ctx }: { ctx: SeriesCtx }) {
  const { t } = useSession();
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/series/[id]', params: { id: ctx.id } })}>
        <Txt weight="extrabold" size={17}>{ctx.title} <Txt size={13} color={colors.muted}>{ctx.number ? t('epOf', { n: ctx.number, total: ctx.total }) : ''}</Txt></Txt>
      </Pressable>
      {ctx.episodes.map((e) => (
        <Pressable key={e.id} accessibilityRole="button" accessibilityState={{ selected: !!e.current }}
          onPress={() => { if (!e.current) router.replace({ pathname: '/talk/[id]', params: { id: e.id } }); }}
          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.card, backgroundColor: e.current ? colors.goldTint : colors.panel, borderWidth: 1, borderColor: e.current ? colors.goldLine : colors.borderSoft }}>
          <Txt weight="bold" size={13} color={colors.goldLight} style={{ minWidth: 26 }}>{e.completed ? '✓' : e.number}</Txt>
          <Txt weight={e.current ? 'bold' : 'medium'} size={14} style={{ flex: 1 }}>{e.title}</Txt>
          {e.durationSeconds ? <Txt size={12} color={colors.muted}>{formatClock(e.durationSeconds)}</Txt> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function ActionTile({ icon, label, onPress, active, disabled }: {
  icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress?: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!active }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4,
        backgroundColor: active ? colors.goldTint : colors.panel, borderWidth: 1, borderColor: active ? colors.goldLine : colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Feather name={icon} size={20} color={active ? colors.goldLight : colors.text} />
      <Txt weight="bold" size={12} numberOfLines={1} color={active ? colors.goldLight : colors.text}>{label}</Txt>
    </Pressable>
  );
}
