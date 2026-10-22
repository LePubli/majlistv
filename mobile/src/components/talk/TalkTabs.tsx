// Onglets de la fiche : Résumé, Chapitres, Transcription (cliquable), Mes notes (marque-pages), À propos.
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { formatClock, formatDuration } from '@/lib/format';
import { currentChapter } from '@/lib/playback';
import { levelLabel } from '@/lib/media';
import type { Insights, Note, Talk, TranscriptData } from '@/lib/types';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Txt } from '../ui';

export type TabKey = 'summary' | 'chapters' | 'transcript' | 'notes' | 'about';

export function TalkTabs({ talk, insights, positionMs, onSeek, getPositionMs }: {
  talk: Talk; insights: Insights | null; positionMs: number; onSeek: (ms: number) => void; getPositionMs: () => number;
}) {
  const { t, locale, user } = useSession();
  const [tab, setTab] = useState<TabKey>('summary');
  const tabs: { k: TabKey; label: string }[] = [
    { k: 'summary', label: t('summary') }, { k: 'chapters', label: t('chapters') }, { k: 'transcript', label: t('transcript') },
    { k: 'notes', label: t('ntTab') }, { k: 'about', label: t('tabAbout') },
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
      {tab === 'summary' ? <Summary talk={talk} insights={insights} /> : null}
      {tab === 'chapters' ? <Chapters insights={insights} positionMs={positionMs} onSeek={onSeek} /> : null}
      {tab === 'transcript' ? <Transcript talk={talk} lang={locale} positionMs={positionMs} onSeek={onSeek} /> : null}
      {tab === 'notes' ? <Notes talk={talk} loggedIn={!!user} getPositionMs={getPositionMs} onSeek={onSeek} /> : null}
      {tab === 'about' ? <About talk={talk} /> : null}
    </View>
  );
}

const box = { padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 } as const;

function Summary({ talk, insights }: { talk: Talk; insights: Insights | null }) {
  const { t } = useSession();
  const text = insights?.summary || talk.description;
  return (
    <View style={box}>
      {text ? <Txt color={colors.text2} style={{ lineHeight: 24 }}>{text}</Txt> : <Txt color={colors.muted}>{talk.insightsPending ? t('insightsWaiting') : t('talk.noSummary')}</Txt>}
      {insights?.keyPoints?.length ? (
        <View style={{ gap: 6 }}>
          <Txt weight="extrabold" size={15}>{t('talk.keyPoints')}</Txt>
          {insights.keyPoints.map((k, i) => <Txt key={i} size={14} color={colors.text2}>• {k}</Txt>)}
        </View>
      ) : null}
      {talk.themes?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {talk.themes.map((th) => (
            <Pressable key={th.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/theme/[id]', params: { id: String(th.id) } })}
              style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine, justifyContent: 'center' }}>
              <Txt weight="bold" size={13} color={colors.goldLight}>{th.name}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Chapters({ insights, positionMs, onSeek }: { insights: Insights | null; positionMs: number; onSeek: (ms: number) => void }) {
  const { t } = useSession();
  const chapters = insights?.chapters ?? [];
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

function Transcript({ talk, lang, positionMs, onSeek }: { talk: Talk; lang: string; positionMs: number; onSeek: (ms: number) => void }) {
  const { api, t } = useSession();
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const tr = useAsync(
    async () => (talk.playbackToken ? await api.get<TranscriptData>(`/talks/${talk.id}/transcript`, { t: talk.playbackToken, lang: chosen ?? lang }).catch(() => null) : null),
    [talk.id, chosen, lang],
  );
  if (tr.loading && !tr.data) return <Txt color={colors.muted}>{t('common.loading')}</Txt>;
  if (!tr.data || !tr.data.segments.length) return <Txt color={colors.muted}>{talk.transcriptStatus === 'processing' ? t('transcribing') : t('noTalks')}</Txt>;
  const activeIdx = tr.data.segments.reduce((a, s, i) => (s.s <= positionMs ? i : a), -1);
  return (
    <View style={{ gap: 10 }}>
      {tr.data.languages.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tr.data.languages.map((l) => (
            <Pressable key={l} accessibilityRole="button" accessibilityState={{ selected: l === tr.data!.lang }} onPress={() => setChosen(l)}
              style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: l === tr.data!.lang ? colors.gold : colors.panel, borderWidth: 1, borderColor: colors.border }}>
              <Txt weight="bold" size={12} color={l === tr.data!.lang ? colors.onGold : colors.text2}>{l.toUpperCase()}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 2 }}>
        {tr.data.segments.map((s, i) => (
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

function Notes({ talk, loggedIn, getPositionMs, onSeek }: { talk: Talk; loggedIn: boolean; getPositionMs: () => number; onSeek: (ms: number) => void }) {
  const { api, t } = useSession();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const notes = useAsync(async () => (loggedIn ? await api.get<Note[]>(`/talks/${talk.id}/notes`).catch(() => []) : []), [talk.id, loggedIn]);
  if (!loggedIn) {
    return (
      <View style={box}>
        <Txt color={colors.text2}>{t('ntBookmarkHelp')}</Txt>
        <Button label={t('register')} onPress={() => router.push({ pathname: '/login', params: { mode: 'register' } })} />
      </View>
    );
  }
  async function add() {
    setBusy(true);
    try {
      await api.post(`/talks/${talk.id}/notes`, { positionMs: Math.round(getPositionMs()), body: draft.trim() });
      setDraft('');
      await notes.reload();
    } finally { setBusy(false); }
  }
  async function remove(id: string) { await api.del(`/me/notes/${id}`).catch(() => undefined); await notes.reload(); }
  return (
    <View style={{ gap: 12 }}>
      <View style={box}>
        <TextInput value={draft} onChangeText={setDraft} multiline maxLength={2000} placeholder={t('wbNotes')} placeholderTextColor={colors.muted}
          accessibilityLabel={t('wbNotes')} style={{ minHeight: 70, color: colors.text, fontFamily: fonts.medium, fontSize: 15, textAlignVertical: 'top' }} />
        <Button label={t('wbBookmark')} variant="dark" loading={busy} onPress={add} />
      </View>
      {(notes.data ?? []).map((n) => (
        <View key={n.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft }}>
          <Pressable accessibilityRole="button" onPress={() => onSeek(n.positionMs)} style={{ minWidth: 52, minHeight: 32, justifyContent: 'center' }}>
            <Txt weight="bold" size={13} color={colors.goldLight}>{formatClock(n.positionMs / 1000)}</Txt>
          </Pressable>
          <Txt size={14} color={colors.text2} style={{ flex: 1 }}>{n.body || t('ntBookmarked')}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={() => remove(n.id)} hitSlop={8}><Txt color={colors.danger} size={16}>✕</Txt></Pressable>
        </View>
      ))}
    </View>
  );
}

function About({ talk }: { talk: Talk }) {
  const { t } = useSession();
  const rows: [string, string][] = [
    [t('dSpeaker'), talk.speaker ?? ''], [t('dCategory'), talk.category ?? ''], [t('dDuration'), formatDuration(talk.durationSeconds)],
    [t('dLang'), (talk.language ?? '').toUpperCase()], [t('lvLabel'), levelLabel(talk.level, t)], [t('dSubs'), (talk.tracks ?? []).map((l) => l.toUpperCase()).join(', ')],
  ].filter((r): r is [string, string] => !!r[1]);
  return (
    <View style={box}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Txt size={14} color={colors.muted}>{k}</Txt>
          <Txt weight="bold" size={14} style={{ flexShrink: 1 }}>{v}</Txt>
        </View>
      ))}
      {talk.description ? <Txt size={14} color={colors.text2} style={{ lineHeight: 22, marginTop: 6 }}>{talk.description}</Txt> : null}
    </View>
  );
}
