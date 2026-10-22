// Onglets de la lecture hors connexion (22b-6 bis) : résumé, chapitres, transcription et quiz, lus dans le « pack » enregistré sur le téléphone.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useDownloads } from '@/lib/downloadStore';
import { formatClock } from '@/lib/format';
import { currentChapter } from '@/lib/playback';
import { OfflinePack, pickLang } from '@/lib/offlinePack';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from './ui';

type Tab = 'summary' | 'chapters' | 'transcript' | 'quiz';
const box = { padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 } as const;

export function OfflineTabs({ talkId, pack, fallbackSummary, positionMs, onSeek }: {
  talkId: string; pack: OfflinePack | null; fallbackSummary?: string; positionMs: number; onSeek: (ms: number) => void;
}) {
  const { t, locale } = useSession();
  const [tab, setTab] = useState<Tab>('summary');
  const [lang, setLang] = useState<string | null>(null);
  const tabs: { k: Tab; label: string }[] = [
    { k: 'summary', label: t('summary') }, { k: 'chapters', label: t('chapters') }, { k: 'transcript', label: t('transcript') }, { k: 'quiz', label: t('quiz.openQuiz') },
  ];
  return (
    <View style={{ gap: 14 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {tabs.map(({ k, label }) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)}
            style={{ flex: 1, minHeight: 46, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
            <Txt weight={tab === k ? 'bold' : 'medium'} size={13} numberOfLines={1} color={tab === k ? colors.goldLight : colors.muted}>{label}</Txt>
          </Pressable>
        ))}
      </View>
      {!pack && tab !== 'summary' ? <View style={box}><Txt color={colors.text2}>{t('dl.noPack')}</Txt></View> : null}
      {tab === 'summary' ? <Summary pack={pack} lang={lang ?? locale} fallback={fallbackSummary} /> : null}
      {pack && tab === 'chapters' ? <Chapters pack={pack} lang={lang ?? locale} positionMs={positionMs} onSeek={onSeek} /> : null}
      {pack && tab === 'transcript' ? <Transcript pack={pack} lang={lang} setLang={setLang} fallback={locale} positionMs={positionMs} onSeek={onSeek} /> : null}
      {pack && tab === 'quiz' ? <QuizEntry talkId={talkId} pack={pack} /> : null}
    </View>
  );
}

function Summary({ pack, lang, fallback }: { pack: OfflinePack | null; lang: string; fallback?: string }) {
  const { t } = useSession();
  const ins = pack ? pickLang(pack.insights, lang) : null;
  const text = ins?.summary || fallback;
  if (!text && !ins?.keyPoints.length) return <View style={box}><Txt color={colors.muted}>{pack ? t('talk.noSummary') : t('dl.noPack')}</Txt></View>;
  return (
    <View style={box}>
      {text ? <Txt color={colors.text2} style={{ lineHeight: 24 }}>{text}</Txt> : null}
      {ins?.keyPoints.length ? (
        <View style={{ gap: 6 }}>
          <Txt weight="extrabold" size={15}>{t('talk.keyPoints')}</Txt>
          {ins.keyPoints.map((k, i) => <Txt key={i} size={14} color={colors.text2}>• {k}</Txt>)}
        </View>
      ) : null}
    </View>
  );
}

function Chapters({ pack, lang, positionMs, onSeek }: { pack: OfflinePack; lang: string; positionMs: number; onSeek: (ms: number) => void }) {
  const { t } = useSession();
  // Les chapitres sont en français (résumés toujours en français) ; on prend la langue demandée si elle existe, sinon la première qui en a.
  const withChapters = pack.insights.filter((i) => i.chapters.length);
  const chapters = pickLang(withChapters, lang)?.chapters ?? [];
  if (!chapters.length) return <Txt color={colors.muted}>{t('talk.noChapters')}</Txt>;
  const active = currentChapter(chapters, positionMs);
  return (
    <View style={{ gap: 4 }}>
      {chapters.map((c, i) => (
        <Pressable key={i} accessibilityRole="button" onPress={() => onSeek(c.s)}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: i === active ? colors.goldTint : 'transparent' }}>
          <Txt weight="bold" size={13} color={colors.goldLight} style={{ minWidth: 52 }}>{formatClock(c.s / 1000)}</Txt>
          <Txt weight={i === active ? 'bold' : 'medium'} size={14} style={{ flex: 1 }}>{c.t}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

function Transcript({ pack, lang, setLang, fallback, positionMs, onSeek }: {
  pack: OfflinePack; lang: string | null; setLang: (l: string) => void; fallback: string; positionMs: number; onSeek: (ms: number) => void;
}) {
  const { t } = useSession();
  const cur = pickLang(pack.transcripts, lang ?? fallback);
  if (!cur) return <Txt color={colors.muted}>{t('noTalks')}</Txt>;
  const activeIdx = cur.segments.reduce((a, s, i) => (s.s <= positionMs ? i : a), -1);
  return (
    <View style={{ gap: 10 }}>
      {pack.transcripts.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {pack.transcripts.map((tr) => (
            <Pressable key={tr.lang} accessibilityRole="button" accessibilityState={{ selected: tr.lang === cur.lang }} onPress={() => setLang(tr.lang)}
              style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: tr.lang === cur.lang ? colors.gold : colors.panel, borderWidth: 1, borderColor: colors.border }}>
              <Txt weight="bold" size={12} color={tr.lang === cur.lang ? colors.onGold : colors.text2}>{tr.lang.toUpperCase()}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 2 }}>
        {cur.segments.map((s, i) => (
          <Pressable key={i} accessibilityRole="button" onPress={() => onSeek(s.s)}
            style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: i === activeIdx ? colors.goldTint : 'transparent' }}>
            <Txt weight="bold" size={12} color={colors.goldLight} style={{ minWidth: 44 }}>{formatClock(s.s / 1000)}</Txt>
            <Txt size={14} color={i === activeIdx ? colors.text : colors.text2} style={{ flex: 1 }}>{s.t}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function QuizEntry({ talkId, pack }: { talkId: string; pack: OfflinePack }) {
  const { t } = useSession();
  const dl = useDownloads();
  if (!pack.quiz) return <View style={box}><Txt color={colors.muted}>{t('dl.noQuiz')}</Txt></View>;
  return (
    <View style={box}>
      <Txt color={colors.text2}>{t('quiz.passNeeded', { p: pack.quiz.passPercent })} · {pack.quiz.questions.length}</Txt>
      <Button label={t('quiz.openQuiz')} onPress={() => router.push({ pathname: '/offline/quiz/[id]', params: { id: talkId } })} />
      {dl.pendingAttempts ? <Txt size={13} color={colors.muted}>{t('dl.quizPending', { n: dl.pendingAttempts })}</Txt> : null}
    </View>
  );
}
