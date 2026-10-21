// Quiz d'une conférence : une question à la fois, correction détaillée à la fin, explications et badges gagnés.
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { firstUnanswered, isBadgeId, submitBody } from '@/lib/learn';
import type { QuizData, QuizResult } from '@/lib/types';
import type { Key } from '@/lib/i18n';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, Loading, Panel, ScreenHeader, Txt, screenStyle } from '@/components/ui';

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, t, dirStyle } = useSession();
  const quiz = useAsync(() => api.get<QuizData>(`/talks/${id}/quiz`), [id, user?.id]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const notFound = quiz.error instanceof ApiError && quiz.error.status === 404;
  const qs = quiz.data?.questions ?? [];
  const q = qs[step];

  function restart() { setAnswers({}); setStep(0); setResult(null); setFailed(false); }

  async function send() {
    setBusy(true);
    setFailed(false);
    try { setResult(await api.post<QuizResult>(`/talks/${id}/quiz/submit`, submitBody(qs, answers))); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('quiz.openQuiz')} />
      {quiz.loading && !quiz.data ? <Loading />
        : notFound ? <ErrorBox message={t('quiz.none')} />
        : !quiz.data || !q ? <ErrorBox onRetry={quiz.reload} />
        : result ? <ResultView result={result} onRetry={restart} talkId={String(id)} />
        : (
          <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
            <Txt weight="bold" size={13} color={colors.goldLight}>{t('quiz.question', { n: step + 1, total: qs.length })}</Txt>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
              <View style={{ width: `${((step + 1) / qs.length) * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.gold }} />
            </View>
            <Txt weight="extrabold" size={19} style={{ lineHeight: 27 }}>{q.question}</Txt>
            <View style={{ gap: 10 }}>
              {q.options.map((opt, i) => {
                const on = answers[q.id] === i;
                return (
                  <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setAnswers({ ...answers, [q.id]: i })}
                    style={({ pressed }) => ({
                      minHeight: 56, padding: 14, borderRadius: radius.card, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 12,
                      borderColor: on ? colors.gold : colors.border, backgroundColor: on ? colors.goldTint : colors.panel, opacity: pressed ? 0.85 : 1,
                    })}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.gold : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold }} /> : null}
                    </View>
                    <Txt style={{ flex: 1 }}>{opt}</Txt>
                  </Pressable>
                );
              })}
            </View>
            {!user ? <Txt size={13} color={colors.muted}>{t('quiz.unsaved')}</Txt> : null}
            {failed ? <Txt color={colors.danger} accessibilityRole="alert">{t('common.error')}</Txt> : null}
            {step < qs.length - 1 ? (
              <Button label={t('quiz.next')} disabled={answers[q.id] === undefined} onPress={() => setStep(step + 1)} />
            ) : (
              <Button label={t('quiz.finish')} loading={busy} disabled={firstUnanswered(qs, answers) !== -1} onPress={send} />
            )}
            {step > 0 ? <Button variant="ghost" label={t('quiz.backStep')} onPress={() => setStep(step - 1)} /> : null}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}

function ResultView({ result, onRetry, talkId }: { result: QuizResult; onRetry: () => void; talkId: string }) {
  const { t, user } = useSession();
  const ok = result.passed;
  const badges = (result.learning?.newBadges ?? []).filter(isBadgeId).map((b) => t(`badge.${b}` as Key));
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
      <Panel style={{ alignItems: 'center', gap: 8, borderColor: ok ? colors.goldLine : colors.border }}>
        <Feather name={ok ? 'award' : 'rotate-ccw'} size={36} color={ok ? colors.goldLight : colors.muted} />
        <Txt weight="extrabold" size={34} color={ok ? colors.goldLight : colors.text}>{result.percent} %</Txt>
        <Txt weight="bold" size={17}>{ok ? t('quiz.passed') : t('quiz.failed')}</Txt>
        <Txt size={13} color={colors.muted}>{result.score}/{result.total} · {t('quiz.passNeeded', { p: result.passPercent })}</Txt>
        {badges.length ? <Txt weight="bold" color={colors.goldLight} style={{ textAlign: 'center' }}>{t('quiz.newBadges', { names: badges.join(', ') })}</Txt> : null}
        {!result.saved ? <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('quiz.unsaved')}</Txt> : null}
      </Panel>
      {result.results.map((r, i) => (
        <Panel key={r.questionId} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name={r.correct ? 'check-circle' : 'x-circle'} size={18} color={r.correct ? colors.goldLight : colors.danger} />
            <Txt weight="bold" size={14} color={r.correct ? colors.goldLight : colors.danger}>{i + 1}. {r.correct ? t('quiz.correct') : t('quiz.wrong')}</Txt>
          </View>
          {r.explanation ? <Txt size={14} color={colors.text2}>{r.explanation}</Txt> : null}
        </Panel>
      ))}
      <Button label={t('quiz.retry')} onPress={onRetry} />
      {user && ok ? <Button variant="dark" label={t('practice.open')} onPress={() => router.replace({ pathname: '/practice/[id]', params: { id: talkId } })} /> : null}
      <Button variant="dark" label={t('quiz.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </ScrollView>
  );
}
