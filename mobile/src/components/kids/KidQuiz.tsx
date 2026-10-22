// Quiz de l'espace enfant : une question à la fois, grands boutons, aucun chronomètre. Résultat en étoiles (1 à 3), jamais « raté ».
// Les bonnes réponses ne sont connues qu'après l'envoi (le serveur les renvoie avec une courte explication).
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { ApiError } from '@/lib/api';
import { KC, badgeIcon, clampStars, isTimeUp, quizAnswers, reviewDate, starsMessageKey } from '@/lib/kids';
import type { KidQuizQuestion, KidQuizResult } from '@/lib/types';
import { KButton, KTxt, starsText } from '@/components/kids/KidUi';
import { KidActionsList } from '@/components/kids/KidActionsList';

type Props = { talkId: string; onClose: () => void; onDone?: (r: KidQuizResult) => void };

export function KidQuiz({ talkId, onClose, onDone }: Props) {
  const { t, locale } = useSession();
  const { kidApi, kid } = useKid();
  const [qs, setQs] = useState<KidQuizQuestion[] | null | undefined>(undefined); // undefined : chargement, null : indisponible
  const [timeUp, setTimeUp] = useState(false);
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<(number | undefined)[]>([]);
  const [res, setRes] = useState<KidQuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setQs(undefined); setStep(0); setPicks([]); setRes(null); setFailed(false); setTimeUp(false);
    try { setQs((await kidApi.get<{ questions: KidQuizQuestion[] }>(`/kids/talks/${talkId}/quiz`)).questions); }
    catch (e) { if (isTimeUp(e as { code?: string })) setTimeUp(true); setQs(null); }
  }, [kidApi, talkId]);
  useEffect(() => { void load(); }, [load, kid?.profile.id]);

  const frame = (body: React.ReactNode) => <View style={{ flex: 1, backgroundColor: KC.bg }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}>{body}</ScrollView></View>;
  if (qs === undefined) return frame(<KTxt color={KC.text2}>…</KTxt>);
  if (qs === null) {
    return frame(<>
      <KTxt weight="extrabold" size={20} style={{ textAlign: 'center' }}>{timeUp ? t('kdTimeUpTitle') : t('kdQuizNone')}</KTxt>
      <KButton label={t('kdBack').replace('← ', '')} variant="soft" onPress={onClose} />
    </>);
  }

  const q = qs[step];
  const last = step === qs.length - 1;
  const submit = async () => {
    const answers = quizAnswers(qs, picks);
    if (!answers) return;
    setBusy(true); setFailed(false);
    try {
      const r = await kidApi.post<KidQuizResult>(`/kids/talks/${talkId}/quiz/submit`, { answers });
      setRes(r); onDone?.(r);
    } catch (e) {
      if (e instanceof ApiError && isTimeUp(e)) { setTimeUp(true); setQs(null); } else setFailed(true);
    } finally { setBusy(false); }
  };

  if (res) {
    const stars = clampStars(res.stars);
    return frame(<>
      <KTxt weight="extrabold" size={26} style={{ textAlign: 'center' }} accessibilityRole="header">{t(starsMessageKey(stars))}</KTxt>
      <KTxt size={44} style={{ textAlign: 'center', lineHeight: 56 }} accessibilityLabel={`${stars} / 3`}>{starsText(stars)}</KTxt>
      <KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdScore', { n: res.score, t: res.total })}</KTxt>
      {res.newBadges.length > 0 ? (
        <View style={{ padding: 16, borderRadius: 20, backgroundColor: KC.surface2, borderWidth: 2, borderColor: KC.accent, gap: 6 }} accessibilityRole="alert">
          <KTxt weight="extrabold" size={16} color={KC.accent}>{t('kdNewBadge')}</KTxt>
          {res.newBadges.map((b) => <KTxt key={b} weight="bold">{badgeIcon(b)} {t(`kdB_${b}` as never)}</KTxt>)}
        </View>
      ) : null}
      <KidActionsList limit={3} onlyOpen hideEmpty title={t('kaAfterQuiz')} />
      {res.nextReview ? <KTxt size={13} color={KC.text2}>{t('kdNextReview', { date: reviewDate(res.nextReview, locale) })}</KTxt> : null}
      <View style={{ gap: 10 }}>
        {res.results.map((r, i) => (
          <View key={r.questionId} style={{ padding: 14, borderRadius: 18, backgroundColor: KC.surface, borderWidth: 2, borderColor: r.correct ? KC.ok : KC.line, gap: 4 }}>
            <KTxt weight="extrabold">{qs[i]?.question}</KTxt>
            <KTxt color={r.correct ? KC.ok : KC.accent}>{r.correct ? `✓ ${t('kdRight')}` : `${t('kdWrongWas')} ${qs[i]?.options[r.correctIndex] ?? ''}`}</KTxt>
            {r.explanation ? <KTxt size={13} color={KC.text2}>{r.explanation}</KTxt> : null}
          </View>
        ))}
      </View>
      <View style={{ gap: 10 }}>
        <KButton label={t('kdReplay')} onPress={() => void load()} />
        <KButton label={t('kdBack').replace('← ', '')} variant="soft" onPress={onClose} />
      </View>
    </>);
  }

  return frame(<>
    <KTxt size={13} color={KC.text2}>{t('kdQuestionOf', { i: step + 1, n: qs.length })}</KTxt>
    <KTxt weight="extrabold" size={22} accessibilityRole="header">{q.question}</KTxt>
    <View style={{ gap: 12 }} accessibilityRole="radiogroup">
      {q.options.map((o, i) => {
        const on = picks[step] === i;
        return (
          <Pressable key={i} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { const n = [...picks]; n[step] = i; setPicks(n); }}
            style={{ minHeight: 60, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, backgroundColor: on ? KC.accent : KC.surface, borderWidth: 2, borderColor: on ? KC.accent : KC.line }}>
            <KTxt weight="extrabold" size={17} color={on ? KC.onAccent : KC.text}>{o}</KTxt>
          </Pressable>
        );
      })}
    </View>
    {failed ? <KTxt color={KC.accent} accessibilityRole="alert">{t('common.error')}</KTxt> : null}
    <View style={{ gap: 10 }}>
      <KButton label={last ? t('kdSee') : t('kdQNext')} disabled={picks[step] == null} loading={busy} onPress={() => { if (last) void submit(); else setStep(step + 1); }} />
      <KButton label={t('kdBack').replace('← ', '')} variant="soft" onPress={onClose} />
    </View>
  </>);
}
