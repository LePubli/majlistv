// Quiz hors connexion (22b-6 bis) : les questions, les bonnes réponses et les explications viennent du pack enregistré sur le téléphone.
// La correction est faite ici ; le résultat est mis en file et envoyé au serveur à la reconnexion (ou tout de suite si le réseau est là).
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSession } from '@/lib/session';
import { useDownloads } from '@/lib/downloadStore';
import { firstUnanswered, submitBody } from '@/lib/learn';
import { OfflinePack, gradeQuiz } from '@/lib/offlinePack';
import type { QuizResult } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, Loading, Panel, ScreenHeader, Txt, screenStyle } from '@/components/ui';

export default function OfflineQuizScreen() {
  usePreventScreenCapture('offline');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t, dirStyle } = useSession();
  const dl = useDownloads();
  const [pack, setPack] = useState<OfflinePack | null | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void dl.packOf(String(id)).then(setPack); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quiz = pack?.quiz ?? null;
  const qs = quiz?.questions ?? [];
  const q = qs[step];

  function restart() { setAnswers({}); setStep(0); setResult(null); setKept(false); }

  async function finish() {
    if (!quiz) return;
    setBusy(true);
    const local = gradeQuiz(quiz, answers);
    // Réseau disponible : envoi immédiat (le serveur enregistre la tentative, les badges et la révision espacée) ; sinon, mise en file.
    if (dl.online) {
      try { setResult(await api.post<QuizResult>(`/talks/${id}/quiz/submit`, submitBody(qs, answers))); setBusy(false); return; } catch { /* hors ligne en réalité */ }
    }
    await dl.queueAttempt(String(id), answers);
    setKept(true);
    setResult(local);
    setBusy(false);
  }

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('quiz.openQuiz')} />
      {pack === undefined ? <Loading />
        : !quiz || !q ? <ErrorBox message={t('dl.noQuiz')} />
        : result ? (
          <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
            <Panel style={{ alignItems: 'center', gap: 8, borderColor: result.passed ? colors.goldLine : colors.border }}>
              <Feather name={result.passed ? 'award' : 'rotate-ccw'} size={36} color={result.passed ? colors.goldLight : colors.muted} />
              <Txt weight="extrabold" size={34} color={result.passed ? colors.goldLight : colors.text}>{result.percent} %</Txt>
              <Txt weight="bold" size={17}>{result.passed ? t('quiz.passed') : t('quiz.failed')}</Txt>
              <Txt size={13} color={colors.muted}>{result.score}/{result.total} · {t('quiz.passNeeded', { p: result.passPercent })}</Txt>
              {kept ? <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{t('dl.quizSaved')}</Txt> : null}
            </Panel>
            {result.results.map((r, i) => (
              <Panel key={r.questionId} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name={r.correct ? 'check-circle' : 'x-circle'} size={18} color={r.correct ? colors.goldLight : colors.danger} />
                  <Txt weight="bold" size={14} color={r.correct ? colors.goldLight : colors.danger}>{i + 1}. {r.correct ? t('quiz.correct') : t('quiz.wrong')}</Txt>
                </View>
                {!r.correct && qs[i] ? <Txt size={14}>{qs[i].options[r.correctIndex]}</Txt> : null}
                {r.explanation ? <Txt size={14} color={colors.text2}>{r.explanation}</Txt> : null}
              </Panel>
            ))}
            <Button label={t('quiz.retry')} onPress={restart} />
            <Button variant="dark" label={t('quiz.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/downloads'))} />
          </ScrollView>
        ) : (
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
            {step < qs.length - 1 ? (
              <Button label={t('quiz.next')} disabled={answers[q.id] === undefined} onPress={() => setStep(step + 1)} />
            ) : (
              <Button label={t('quiz.finish')} loading={busy} disabled={firstUnanswered(qs, answers) !== -1} onPress={finish} />
            )}
            {step > 0 ? <Button variant="ghost" label={t('quiz.backStep')} onPress={() => setStep(step - 1)} /> : null}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}
