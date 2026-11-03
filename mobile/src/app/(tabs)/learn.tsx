// Apprendre (étape M5 : comme la page du site, étape B6) — 4 onglets qui regroupent des sections :
//   Aujourd'hui (tableau de bord) · Coran et athkar · Conférences (parcours, quiz et révision, cartes) · Mes progrès (engagements, bilan, attestations).
// Une phrase d'explication en haut de chaque onglet jusqu'à « Compris » (mémorisé sur le téléphone). ?tab=rev|cards|bilan|… ouvre une section.
// Réservé à l'offre « Apprentissage » sauf Coran, « Aujourd'hui » et quiz à passer ; sans l'offre, un écran explique ce qu'elle apporte.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import { STATUSES, isBadgeId, isLearningRequired, sortCommitments } from '@/lib/learn';
import { SECTION_LABEL, cardsToday, groupOf, groupsFor, pickSection, type CardsResponse, type SectionId } from '@/lib/learnHub';
import type { Card, Commitment, LearningResponse, PracticeMine, PracticeStatus, QuizTodoCard, RevisionResponse } from '@/lib/types';
import type { Key } from '@/lib/i18n';
import { progressOf } from '@/lib/media';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, Eyebrow, Loading, Panel, Txt, screenStyle, Title } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';
import { TodayBlock } from '@/components/TodayBlock';
import { QuranPlan } from '@/components/QuranPlan';
import { MemoryCards } from '@/components/learn/MemoryCards';
import { SelfCheck } from '@/components/learn/SelfCheck';

type Series = LearningResponse['series'][number] & { attestation?: { code: string; issuedAt: string } | null };
type Learning = Omit<LearningResponse, 'series'> & { series: Series[] };
type RevisionFull = RevisionResponse & { emailEnabled?: boolean; dailyEmail?: boolean };

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
  const { api, user, t, feat } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const groups = useMemo(() => groupsFor(feat), [feat]);
  const [section, setSection] = useState<SectionId>(() => pickSection(groups, params.tab));
  useEffect(() => { if (params.tab) setSection(pickSection(groups, params.tab)); }, [params.tab, groups]);

  const rev = useAsync(() => api.get<RevisionFull>('/me/revision'), [user?.id]);
  const todo = useAsync(() => api.get<QuizTodoCard[]>('/me/quiz/todo'), [user?.id]);
  const learning = useAsync(() => api.get<Learning>('/me/learning'), [user?.id]);
  const practice = useAsync(() => api.get<PracticeMine>('/me/practice'), [user?.id]);
  const cont = useAsync(() => api.get<Card[]>('/me/continue').catch(() => [] as Card[]), [user?.id]);
  const cards = useAsync(async () => (feat('memorycards') ? await api.get<CardsResponse>('/me/cards').catch(() => null) : null), [user?.id, feat('memorycards')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [refreshing, setRefreshing] = useState(false);

  const reloadAll = useCallback(async () => {
    await Promise.all([rev.reload(), todo.reload(), learning.reload(), practice.reload(), cont.reload(), cards.reload()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void reloadAll(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = [rev.error, learning.error, practice.error].some(isLearningRequired);
  const revN = rev.data ? rev.data.items.length + (rev.data.remaining || 0) : 0;
  const cardsN = cards.data ? cardsToday(cards.data.counts) : 0;
  const badgeOf = (s: SectionId) => (s === 'rev' ? revN : s === 'cards' ? cardsN : 0);

  if (locked) return <LockedLearn todo={todo.data ?? []} />;
  const group = groupOf(groups, section);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.gold} onRefresh={async () => { setRefreshing(true); await reloadAll(); setRefreshing(false); }} />}
    >
      <View style={{ gap: 4 }}>
        <Title>{t('learn.title')}</Title>
        <Txt size={14} color={colors.muted}>{t('lgSub')}</Txt>
      </View>

      {/* Les 4 onglets (pastille : révisions + cartes du jour sur « Conférences »). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist" accessibilityLabel={t('tbLabel')}>
        {groups.map((g) => {
          const n = g.subs.reduce((a, s) => a + badgeOf(s), 0);
          const on = g.id === group.id;
          return (
            <Pressable key={g.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${t(g.label)}${n ? ` (${n})` : ''}`} onPress={() => setSection(g.subs[0])}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? colors.gold : colors.panel, borderWidth: on ? 0 : 1, borderColor: colors.border }}>
              <Txt weight={on ? 'extrabold' : 'semibold'} size={14} color={on ? colors.onGold : colors.text2}>{t(g.label)}</Txt>
              {n > 0 ? <Pill n={n} on={on} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <GroupIntro id={group.id} text={t(group.intro)} />

      {group.subs.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="tablist">
          {group.subs.map((s) => <Chip key={s} label={`${t(SECTION_LABEL[s])}${badgeOf(s) ? ` · ${badgeOf(s)}` : ''}`} active={section === s} onPress={() => setSection(s)} />)}
        </View>
      ) : null}

      {section === 'dash' ? <Dashboard learning={learning.data} cont={cont.data ?? []} revN={revN} cardsN={cardsN} practice={practice.data} go={setSection} /> : null}
      {section === 'quran' ? <QuranSection /> : null}
      {section === 'athkar' ? <LinkPanel icon="sun" title={t('atTab')} text={`${t('atCats')} : ${t('atCat_morning')}, ${t('atCat_evening')}…`} onPress={() => router.push('/athkar')} /> : null}
      {section === 'path' ? <SeriesBlock mode="path" data={learning.data} reload={learning.reload} /> : null}
      {section === 'rev' ? <Revision rev={rev.data} todo={todo.data ?? []} reload={rev.reload} /> : null}
      {section === 'cards' ? <MemoryCards onCount={() => { void cards.reload(); }} /> : null}
      {section === 'commit' ? <Commitments practice={practice.data} reload={practice.reload} /> : null}
      {section === 'bilan' ? <SelfCheck /> : null}
      {section === 'att' ? <SeriesBlock mode="att" data={learning.data} reload={learning.reload} /> : null}
      {learning.loading && !learning.data ? <View style={{ height: 80 }}><Loading /></View> : null}
    </ScrollView>
  );
}

function Pill({ n, on }: { n: number; on?: boolean }) {
  return (
    <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.onGold : colors.gold }}>
      <Txt weight="bold" size={11} color={on ? colors.goldLight : colors.onGold} style={{ writingDirection: 'ltr' }}>{n > 99 ? '99+' : n}</Txt>
    </View>
  );
}

/** Phrase d'explication de l'onglet, jusqu'à « Compris » (mémorisé sur le téléphone). */
function GroupIntro({ id, text }: { id: string; text: string }) {
  const { t } = useSession();
  const key = `mejliss.lgIntro.${id}`;
  const [seen, setSeen] = useState(true);
  useEffect(() => { SecureStore.getItemAsync(key).then((v) => setSeen(v === '1')).catch(() => setSeen(false)); }, [key]);
  if (seen) return null;
  return (
    <View accessibilityRole="summary" style={{ gap: 6, padding: 12, borderRadius: radius.card, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine }}>
      <Txt size={14} color={colors.text2}>{text}</Txt>
      <Pressable accessibilityRole="button" onPress={() => { setSeen(true); void SecureStore.setItemAsync(key, '1').catch(() => {}); }} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
        <Txt weight="bold" size={13} color={colors.goldLight}>{t('lgGotIt')}</Txt>
      </Pressable>
    </View>
  );
}

function LinkPanel({ icon, title, text, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string; onPress: () => void }) {
  const { isRTL } = useSession();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: colors.goldLine }}>
        <Feather name={icon} size={22} color={colors.goldLight} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="bold" size={16}>{title}</Txt>
          <Txt size={13} color={colors.muted} numberOfLines={2}>{text}</Txt>
        </View>
        <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.muted} />
      </Panel>
    </Pressable>
  );
}

// ------------------------------------------------------------------ Aujourd'hui
function Dashboard({ learning, cont, revN, cardsN, practice, go }: {
  learning: Learning | null; cont: Card[]; revN: number; cardsN: number; practice: PracticeMine | null; go: (s: SectionId) => void;
}) {
  const { t, feat } = useSession();
  const first = cont[0];
  const steps: [Key, string][] = [
    ['lrStepW', t('lrStepWv', { n: cont.length })],
    ['lrStepQ', t('lrStepQv', { n: learning?.quizzesPassed ?? 0 })],
    ...(feat('revision') ? [['lrStepR', t('lrStepRv', { n: revN })] as [Key, string]] : []),
    ...(feat('practice') ? [['lrStepP', t('lrStepPv', { n: practice ? practice.counts.todo + practice.counts.doing : 0 })] as [Key, string]] : []),
  ];
  return (
    <View style={{ gap: 16 }}>
      <TodayBlock style={{ marginHorizontal: 0 }} />
      <View accessibilityLabel={t('lgSteps')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {steps.map(([k, v], i) => (
          <View key={k} style={{ flexGrow: 1, flexBasis: '45%', padding: 12, gap: 2, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft }}>
            <Txt size={12} color={colors.muted}>{i + 1} · {t(k)}</Txt>
            <Txt weight="bold" size={15}>{v}</Txt>
          </View>
        ))}
      </View>
      {first ? (
        <View style={{ gap: 6 }}>
          <Eyebrow>{t('lgResume')}</Eyebrow>
          <TalkCard talk={first} progress={progressOf(first)} />
        </View>
      ) : (
        <Panel style={{ gap: 8 }}>
          <Txt weight="bold" size={16}>{t('lgStartTitle')}</Txt>
          <Txt size={14} color={colors.text2}>{t('lgStartSub')}</Txt>
          <Button label={t('lgStart')} onPress={() => router.navigate('/talks')} />
        </Panel>
      )}
      {feat('revision') ? (
        <Panel style={{ gap: 8 }}>
          <Txt weight="bold" size={16}>{t('lgTodayRev')}</Txt>
          {revN > 0 ? <><Txt size={14}><Txt weight="bold" size={14}>{t('lgRevN', { n: revN })}</Txt> {t('lgRevText')}</Txt><Button label={t('lgRevStart')} variant="dark" onPress={() => go('rev')} /></>
            : <Txt size={14} color={colors.muted}>{t('lgRevNone')}</Txt>}
          {feat('memorycards') && cardsN > 0 ? <><Txt weight="bold" size={14}>{t('lgCardsN', { n: cardsN })}</Txt><Button label={t('lgCardsGo')} variant="dark" onPress={() => go('cards')} /></> : null}
        </Panel>
      ) : null}
      {learning ? <ScorePanel learning={learning} /> : null}
    </View>
  );
}

function ScorePanel({ learning }: { learning: Learning }) {
  const { t, locale } = useSession();
  const earned = learning.badges.filter((b) => b.earned).length;
  return (
    <Panel>
      <Eyebrow>{t('lgProgress')}</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Txt weight="extrabold" size={40} color={colors.goldLight}>{learning.score}</Txt>
        <Txt size={13} color={colors.muted}>/100 · {t('learn.quizzes', { n: learning.quizzesPassed })} · {earned} / {learning.badges.length} {t('lrBadgesWon')}</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {learning.badges.map((b) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 999, borderWidth: 1,
            borderColor: b.earned ? colors.goldLine : colors.border, backgroundColor: b.earned ? colors.goldTint : 'transparent', opacity: b.earned ? 1 : 0.5 }}>
            <Feather name={b.earned ? 'award' : 'lock'} size={14} color={b.earned ? colors.goldLight : colors.muted} />
            <Txt size={12} weight="bold" color={b.earned ? colors.goldLight : colors.muted}>{isBadgeId(b.id) ? t(`badge.${b.id}` as Key) : b.id}</Txt>
          </View>
        ))}
      </View>
      {learning.recent.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Eyebrow>{t('lrRecent')}</Eyebrow>
          {learning.recent.map((r, i) => (
            <Pressable key={i} accessibilityRole="link" onPress={() => router.push({ pathname: '/talk/[id]', params: { id: r.talkId } })} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>{r.title}</Txt>
              <Txt size={13} weight="bold" color={r.passed ? colors.ok : colors.muted}>{r.percent} %</Txt>
              <Txt size={12} color={colors.muted}>{new Date(r.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

// ------------------------------------------------------------------ Coran et athkar
function QuranSection() {
  const { t, feat } = useSession();
  return (
    <View style={{ gap: 12 }}>
      {feat('quranplan') ? <QuranPlan /> : null}
      <LinkPanel icon="book" title={t('qrTitle')} text={t('qrIntro')} onPress={() => router.push('/quran')} />
    </View>
  );
}

// ------------------------------------------------------------------ Conférences : quiz et révision
function Revision({ rev, todo, reload }: { rev: RevisionFull | null; todo: QuizTodoCard[]; reload: () => void }) {
  const { api, t } = useSession();
  const [email, setEmail] = useState<boolean | null>(null);
  return (
    <View style={{ gap: 14 }}>
      {rev ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t('learn.due')}</Eyebrow>
          {rev.items.length === 0 ? <Txt color={colors.muted}>{rev.upcoming.week > 0 ? `✓ ${t('revNone', { n: rev.upcoming.week })}` : t('revNoneYet')}</Txt> : rev.items.map((c) => (
            <View key={c.id} style={{ gap: 6 }}>
              <TalkCard talk={c} />
              <Button label={t('revGo')} variant="dark" onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: c.id } })} />
            </View>
          ))}
          {rev.remaining > 0 ? <Txt size={13} color={colors.muted}>{t('revMore', { n: rev.remaining })}</Txt> : null}
          {rev.upcoming.mastered > 0 ? <Txt size={13} color={colors.muted}>{t('revMasteredN', { n: rev.upcoming.mastered })}</Txt> : null}
          {rev.reminder ? (
            <Panel>
              <Eyebrow>{t('learn.reminder')}</Eyebrow>
              {rev.reminder.textAr ? <Txt style={{ fontFamily: 'Amiri_400Regular', fontSize: 22, lineHeight: 42, textAlign: 'right', writingDirection: 'rtl' }}>{rev.reminder.textAr}</Txt> : null}
              <Txt color={colors.text2} style={{ lineHeight: 23 }}>{rev.reminder.text}</Txt>
              {rev.reminder.talkId ? (
                <Txt size={13} weight="bold" color={colors.goldLight}
                  onPress={() => router.push({ pathname: '/talk/[id]', params: rev.reminder?.startMs != null ? { id: rev.reminder.talkId as string, at: String(rev.reminder.startMs) } : { id: rev.reminder?.talkId as string } })}>
                  ▶ {rev.reminder.talkTitle}
                </Txt>
              ) : null}
            </Panel>
          ) : null}
          {rev.emailEnabled ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt size={14} style={{ flex: 1 }}>{t('revEmail')}</Txt>
              <Switch accessibilityLabel={t('revEmail')} value={email ?? !!rev.dailyEmail}
                onValueChange={(v) => { setEmail(v); void api.put('/me/learning/prefs', { dailyEmail: v }).then(reload).catch(() => setEmail(!v)); }} />
            </View>
          ) : null}
        </View>
      ) : null}
      {todo.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t('learn.quizTodo')}</Eyebrow>
          {todo.map((c) => (
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
    </View>
  );
}

// ------------------------------------------------------------------ Parcours et attestations
function SeriesBlock({ mode, data, reload }: { mode: 'path' | 'att'; data: Learning | null; reload: () => void }) {
  const { api, t, feat } = useSession();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  if (!data) return null;
  async function attest(s: Series) {
    setBusy(s.id); setMsg('');
    try {
      const r = await api.post<{ code: string; url: string }>('/me/learning/attestations', { seriesId: s.id });
      reload();
      void Linking.openURL(r.url || `${SITE_URL}/attestation/${r.code}`);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : t('errGeneric')); } finally { setBusy(''); }
  }
  const retire = (s: Series) => Alert.alert(t('tbAtt'), t('lrAttDelConfirm'), [
    { text: t('cancelBtn'), style: 'cancel' },
    { text: t('lrAttDel'), style: 'destructive', onPress: () => { void api.del(`/me/learning/attestations/${s.attestation?.code}`).then(reload).catch(() => setMsg(t('errGeneric'))); } },
  ]);
  return (
    <View style={{ gap: 12 }}>
      <Txt weight="extrabold" size={18} accessibilityRole="header">{mode === 'att' ? t('tbAtt') : t('lrSeries')}</Txt>
      {msg ? <Txt color={colors.danger} accessibilityRole="alert">{msg}</Txt> : null}
      {data.series.length === 0 ? (
        <Panel style={{ gap: 8 }}>
          <Txt color={colors.muted}>{t('lrNoSeries')}</Txt>
          {feat('series') ? <Button label={t('esSeeSeries')} variant="dark" onPress={() => router.push('/series')} /> : null}
        </Panel>
      ) : data.series.map((s) => (
        <Panel key={s.id} style={{ gap: 8 }}>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/series/[id]', params: { id: s.id } })}>
            <Txt weight="bold" size={16}>{s.title}</Txt>
          </Pressable>
          <Txt size={12} color={colors.muted}>{t('lrQuizOf', { a: s.passed, b: s.total })}</Txt>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: s.total, now: s.passed }} style={{ height: 6, borderRadius: 3, backgroundColor: colors.panel2, overflow: 'hidden' }}>
            <View style={{ width: `${s.total ? (s.passed / s.total) * 100 : 0}%`, height: '100%', backgroundColor: s.complete ? colors.ok : colors.gold }} />
          </View>
          {mode === 'att' ? (
            s.attestation ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <Button label={t('lrAttView')} variant="dark" onPress={() => { void Linking.openURL(`${SITE_URL}/attestation/${s.attestation?.code}`); }} />
                <Txt size={13} weight="bold" color={colors.muted} onPress={() => retire(s)}>{t('lrAttDel')}</Txt>
              </View>
            ) : s.complete ? <Button label={t('lrAttGet')} loading={busy === s.id} onPress={() => { void attest(s); }} />
              : <Txt size={13} color={colors.muted}>{t('lrAttLeft', { n: s.total - s.passed })}</Txt>
          ) : null}
        </Panel>
      ))}
      {mode === 'att' ? <Txt size={12} color={colors.muted}>{t('lrAttNote')}</Txt> : null}
    </View>
  );
}

// ------------------------------------------------------------------ Mes engagements
function Commitments({ practice, reload }: { practice: PracticeMine | null; reload: () => void }) {
  const { api, t } = useSession();
  async function setStatus(c: Commitment, status: PracticeStatus) {
    if (c.status === status) return;
    try { await api.patch(`/me/practice/${c.id}`, { status }); reload(); } catch { /* l'état affiché reste celui du serveur */ }
  }
  if (!practice) return null;
  return (
    <View style={{ gap: 12 }}>
      <Eyebrow>{t('learn.commitments')}</Eyebrow>
      {practice.items.length === 0 ? (
        <Panel style={{ gap: 10 }}>
          <Txt color={colors.text2}>{t('lrNoCommit')}</Txt>
          <Button label={t('esFindTalk')} variant="dark" onPress={() => router.navigate('/talks')} />
        </Panel>
      ) : sortCommitments(practice.items).map((c) => (
        <Panel key={c.id} style={{ gap: 8, borderColor: c.overdue ? colors.danger : colors.border }}>
          <Txt weight="bold">{c.text}</Txt>
          {c.talkTitle ? <Txt size={12} color={colors.muted} numberOfLines={1}>{c.talkTitle}</Txt> : null}
          {c.dueOn ? <Txt size={12} color={c.overdue ? colors.danger : colors.muted}>{t('practice.due')} : {c.dueOn}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.map((s) => <Chip key={s} label={t(`status.${s}` as Key)} active={c.status === s} onPress={() => { void setStatus(c, s); }} />)}
          </View>
        </Panel>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ Sans l'offre Apprentissage
function LockedLearn({ todo }: { todo: QuizTodoCard[] }) {
  const { t, feat } = useSession();
  const tiles: [Key, Key][] = [['lrStepQ', 'lzH1'], ['lrStepR', 'lzH2s'], ['lrStepP', 'lzH3'], ['msBilan', 'lzH4']];
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
      <Panel style={{ gap: 8, borderColor: colors.gold }}>
        <Txt weight="bold" size={12} color={colors.goldLight} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('lzKicker')}</Txt>
        <Txt weight="extrabold" size={22} accessibilityRole="header">{t('lzTitle')}</Txt>
        <Txt size={14} color={colors.text2}>{t('lzText')}</Txt>
      </Panel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map(([n, h], i) => (
          <View key={n} accessibilityLabel={`${t(n)} — ${t('lzLocked')}`} style={{ flexGrow: 1, flexBasis: '45%', padding: 12, gap: 4, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Feather name="lock" size={14} color={colors.goldLight} /><Txt size={12} color={colors.muted}>{i + 2}</Txt></View>
            <Txt weight="bold" size={14}>{t(n)}</Txt>
            <Txt size={12} color={colors.muted}>{t(h)}</Txt>
          </View>
        ))}
      </View>
      <Panel style={{ gap: 10 }}>
        <Txt weight="bold" size={16}>{t('lzH2')}</Txt>
        <Txt size={14} color={colors.text2}>{t('lzP')}</Txt>
        {/* Rien ne se vend dans l'application : l'offre se prend sur le site. */}
        <Button label={t('lzCta')} onPress={() => { void Linking.openURL(`${SITE_URL}/pricing`); }} />
      </Panel>
      {feat('quran') ? <LinkPanel icon="book" title={t('qrTitle')} text={feat('quranplan') ? t('khTitle') : t('qrIntro')} onPress={() => router.push('/quran')} /> : null}
      <TodayBlock style={{ marginHorizontal: 0 }} />
      {todo.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t('learn.quizTodo')}</Eyebrow>
          {todo.map((c) => (
            <View key={c.id} style={{ gap: 6 }}>
              <TalkCard talk={c} />
              <Button label={t('quiz.openQuiz')} variant="dark" onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: c.id } })} />
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
