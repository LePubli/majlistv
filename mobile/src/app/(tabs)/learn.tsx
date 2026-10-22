// Apprendre : à réviser aujourd'hui, quiz à passer, score et badges, engagements. Réservé à l'offre « Apprentissage »
// pour la révision, le score et les engagements ; la liste « quiz à passer » est ouverte à tout membre.
import React, { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { SITE_URL } from '@/lib/config';
import { STATUSES, isBadgeId, isLearningRequired, sortCommitments } from '@/lib/learn';
import type { Commitment, LearningResponse, PracticeMine, PracticeStatus, QuizTodoCard, RevisionResponse } from '@/lib/types';
import type { Key } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { Button, Chip, Eyebrow, Loading, Panel, Txt, screenStyle, Title } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';

export default function LearnScreen() {
  const { user, t, dirStyle } = useSession();
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      {!user ? (
        <View style={{ padding: 18, gap: 14 }}>
          <Title>{t('learn.title')}</Title>
          <Panel style={{ gap: 14 }}>
            <Txt color={colors.text2}>{t('learn.guest')}</Txt>
            <Button label={t('account.signin')} onPress={() => router.push('/login')} />
          </Panel>
        </View>
      ) : <LearnBody />}
    </SafeAreaView>
  );
}

function LearnBody() {
  const { api, user, t } = useSession();
  const rev = useAsync(() => api.get<RevisionResponse>('/me/revision'), [user?.id]);
  const todo = useAsync(() => api.get<QuizTodoCard[]>('/me/quiz/todo'), [user?.id]);
  const learning = useAsync(() => api.get<LearningResponse>('/me/learning'), [user?.id]);
  const practice = useAsync(() => api.get<PracticeMine>('/me/practice'), [user?.id]);
  const [refreshing, setRefreshing] = useState(false);

  const reloadAll = useCallback(async () => {
    await Promise.all([rev.reload(), todo.reload(), learning.reload(), practice.reload()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void reloadAll(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  // Une seule réponse « offre requise » suffit : ces trois blocs sont tous réservés à l'offre Apprentissage.
  const locked = [rev.error, learning.error, practice.error].some(isLearningRequired);
  const first = (rev.loading && !rev.data && !locked) || (todo.loading && !todo.data);

  async function setStatus(c: Commitment, status: PracticeStatus) {
    if (c.status === status) return;
    try {
      await api.patch(`/me/practice/${c.id}`, { status });
      await practice.reload();
    } catch { /* l'état affiché reste celui du serveur */ }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.gold} onRefresh={async () => { setRefreshing(true); await reloadAll(); setRefreshing(false); }} />}
    >
      <View style={{ gap: 4 }}>
        <Title>{t('learn.title')}</Title>
        <Txt size={14} color={colors.muted}>{t('learn.subtitle')}</Txt>
      </View>

      {first ? <View style={{ height: 120 }}><Loading /></View> : null}

      {locked ? (
        <Panel style={{ borderColor: colors.goldLine, backgroundColor: colors.goldTint, gap: 12 }}>
          <Txt weight="bold" color={colors.goldLight}>{t('learn.locked')}</Txt>
          <Button label={t('learn.openSite')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account`)} />
        </Panel>
      ) : null}

      {!locked && rev.data ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t('learn.due')}</Eyebrow>
          {rev.data.items.length === 0 ? <Txt color={colors.muted}>{t('learn.dueNone')}</Txt> : rev.data.items.map((c) => (
            <View key={c.id} style={{ gap: 6 }}>
              <TalkCard talk={c} />
              <Button label={t('quiz.openQuiz')} variant="dark" onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: c.id } })} />
            </View>
          ))}
          {rev.data.remaining > 0 ? <Txt size={13} color={colors.muted}>{t('learn.dueMore', { n: rev.data.remaining })}</Txt> : null}
          {rev.data.reminder ? (
            <Panel>
              <Eyebrow>{t('learn.reminder')}</Eyebrow>
              <Txt color={colors.text2} style={{ lineHeight: 23 }}>{rev.data.reminder.text}</Txt>
              {rev.data.reminder.talkTitle ? <Txt size={13} color={colors.muted}>{rev.data.reminder.talkTitle}</Txt> : null}
            </Panel>
          ) : null}
        </View>
      ) : null}

      {todo.data && todo.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t('learn.quizTodo')}</Eyebrow>
          {todo.data.map((c) => (
            <View key={c.id} style={{ gap: 6 }}>
              <TalkCard talk={c} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Button label={t('quiz.openQuiz')} variant="dark" onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: c.id } })} style={{ flex: 1 }} />
                {c.quizState === 'retry' ? <Txt size={12} weight="bold" color={colors.goldLight}>{t('learn.quizRetry')}</Txt> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!locked && learning.data ? (
        <Panel>
          <Eyebrow>{t('learn.score')}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Txt weight="extrabold" size={40} color={colors.goldLight}>{learning.data.score}</Txt>
            <Txt size={13} color={colors.muted}>{t('learn.quizzes', { n: learning.data.quizzesPassed })}</Txt>
          </View>
          <Eyebrow>{t('learn.badges')}</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {learning.data.badges.map((b) => (
              <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 999, borderWidth: 1,
                borderColor: b.earned ? colors.goldLine : colors.border, backgroundColor: b.earned ? colors.goldTint : 'transparent', opacity: b.earned ? 1 : 0.5 }}>
                <Feather name={b.earned ? 'award' : 'lock'} size={14} color={b.earned ? colors.goldLight : colors.muted} />
                <Txt size={12} weight="bold" color={b.earned ? colors.goldLight : colors.muted}>{isBadgeId(b.id) ? t(`badge.${b.id}` as Key) : b.id}</Txt>
              </View>
            ))}
          </View>
        </Panel>
      ) : null}

      {!locked && practice.data ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t('learn.commitments')}</Eyebrow>
          {practice.data.items.length === 0 ? <Txt color={colors.muted}>{t('learn.noCommit')}</Txt> : sortCommitments(practice.data.items).map((c) => (
            <Panel key={c.id} style={{ gap: 8, borderColor: c.overdue ? colors.danger : colors.border }}>
              <Txt weight="bold">{c.text}</Txt>
              {c.talkTitle ? <Txt size={12} color={colors.muted} numberOfLines={1}>{c.talkTitle}</Txt> : null}
              {c.dueOn ? <Txt size={12} color={c.overdue ? colors.danger : colors.muted}>{t('practice.due')} : {c.dueOn}</Txt> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {STATUSES.map((s) => <Chip key={s} label={t(`status.${s}` as Key)} active={c.status === s} onPress={() => setStatus(c, s)} />)}
              </View>
            </Panel>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
