// Étape M1 — Bloc « Aujourd'hui » (comme sur le site, étape B1) : la courte liste de ce que le membre peut faire aujourd'hui
// (juz du jour, adhkar du moment, action de Ramadan, cartes et révisions). Chaque ligne mène à l'action ; les lignes faites
// passent en bas, cochées. Rien ne s'affiche pour un visiteur ni quand il n'y a aucune ligne. Données : GET /me/today.
import React, { useCallback } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { SITE_URL } from '@/lib/config';
import { todayCount, todayKey, todayLabel, todayTarget, withQuizLine, type TodayItem, type TodayResponse } from '@/lib/today';
import { colors, radius } from '@/lib/theme';
import { Txt } from './ui';

// `home` (étape N7, comme le site N3) : version de l'accueil — titre « À faire aujourd'hui », ligne des quiz à passer,
// lien vers Apprendre.
export function TodayBlock({ style, home = false }: { style?: object; home?: boolean }) {
  const { api, user, t, locale, feat, isRTL } = useSession();
  const d = useAsync(async () => (user ? await api.get<TodayResponse>('/me/today', { lang: locale }).catch(() => null) : null), [user?.id, locale]);
  const quiz = useAsync(async () => (user && home && feat('quiz') ? (await api.get<unknown[]>('/me/quiz/todo').catch(() => [])).length : 0), [user?.id, home]); // eslint-disable-line react-hooks/exhaustive-deps
  // Au retour sur l'écran (après une lecture, un dhikr…), la liste se met à jour.
  useFocusEffect(useCallback(() => { if (user) { void d.reload(); if (home) void quiz.reload(); } }, [user?.id, home])); // eslint-disable-line react-hooks/exhaustive-deps

  const data = home ? withQuizLine(d.data, quiz.data ?? 0) : d.data;
  const items = (data?.items ?? []).filter((it) => todayLabel(it, t));
  if (!user || !items.length) return null;
  const left = items.filter((x) => !x.done).length;

  return (
    <View accessibilityLabel={t('tdAria')} style={[{
      marginHorizontal: 16, padding: 16, gap: 10, borderRadius: radius.panel, backgroundColor: colors.panel,
      borderWidth: 1, borderColor: colors.goldLine,
    }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Txt weight="extrabold" size={19} accessibilityRole="header">{home ? t('tdHomeTitle') : t('tdTitle')}</Txt>
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: left ? colors.goldTint : 'transparent', borderWidth: 1, borderColor: left ? colors.goldLine : colors.ok }}>
          <Txt weight="bold" size={12} color={left ? colors.goldLight : colors.ok}>{left ? t('tdLeft', { n: left }) : t('tdAllDone')}</Txt>
        </View>
      </View>
      {items.map((it) => <TodayRow key={todayKey(it)} it={it} />)}
      {home && feat('learning') ? (
        <Pressable accessibilityRole="link" onPress={() => router.navigate('/learn')} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
          <Txt weight="bold" size={14} color={colors.goldLight}>{t('tdOpenLearn')}</Txt>
          <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={16} color={colors.goldLight} />
        </Pressable>
      ) : null}
    </View>
  );
}

function TodayRow({ it }: { it: TodayItem }) {
  const { t, isRTL } = useSession();
  const target = todayTarget(it.href, it.moment);
  const web = 'web' in target;
  const count = todayCount(it);
  const open = () => {
    if ('app' in target) router.navigate(target.app as never);
    else void Linking.openURL(SITE_URL + target.web).catch(() => { /* aucun navigateur */ });
  };
  return (
    <Pressable
      accessibilityRole={web ? 'link' : 'button'}
      accessibilityLabel={`${todayLabel(it, t)}${count ? ' ' + count : ''}, ${it.done ? t('tdDone') : t('tdTodo')}${web ? ' — ' + t('today.web') : ''}`}
      onPress={open}
      style={({ pressed }) => ({
        minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft,
        opacity: pressed ? 0.85 : it.done ? 0.7 : 1,
      })}
    >
      <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: it.done ? colors.ok : colors.gold, backgroundColor: it.done ? colors.ok : 'transparent' }}>
        {it.done ? <Feather name="check" size={15} color={colors.onGold} /> : null}
      </View>
      <Txt weight="medium" size={15} color={it.done ? colors.muted : colors.text} style={{ flex: 1, textDecorationLine: it.done ? 'line-through' : 'none' }} numberOfLines={2}>
        {todayLabel(it, t)}
      </Txt>
      {count ? <Txt weight="bold" size={13} color={colors.goldLight} style={{ writingDirection: 'ltr' }}>{count}</Txt> : null}
      {web ? <Feather name="external-link" size={15} color={colors.muted} /> : <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.muted} />}
    </Pressable>
  );
}
