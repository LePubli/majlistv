// Étape M5 — « Mon bilan » (Tazkiyat an-nafs, comme le site) : qualités à cultiver, défauts à corriger, point de la semaine.
// Aucun total, score, pourcentage ni série : seulement l'état de chaque objectif, semaine après semaine. Notes chiffrées.
// Suivi de « Mon évolution » : par thème et par mois, ce qui a été appris et mis en pratique. Offre Apprentissage.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import {
  SC_STATES, addDays, dayName, goalsFull, monthLabel, replaceGoal, shortDate,
  type EvolutionResponse, type Goal, type ScState, type ScTheme, type SelfCheckResponse,
} from '@/lib/learnHub';
import type { Key } from '@/lib/i18n';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Chip, Panel, Txt } from '../ui';

const stateColor = (s?: ScState) => (s === 'achieved' ? colors.ok : s === 'progress' ? colors.gold : s === 'not_yet' ? colors.borderStrong : colors.panel2);
const inputStyle = () => ({ minHeight: 48, padding: 12, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, color: colors.text, fontFamily: fonts.medium, fontSize: 15 });

export function SelfCheck() {
  const { api, t, locale } = useSession();
  const [d, setD] = useState<SelfCheckResponse | null>(null);
  const [themes, setThemes] = useState<ScTheme[]>([]);
  const [adding, setAdding] = useState<'quality' | 'defect' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api.get<SelfCheckResponse>('/me/selfcheck', showArchived ? { archived: '1' } : undefined);
      setD(r);
      if (r.themesEnabled) { const th = await api.get<{ themes: ScTheme[] }>('/me/selfcheck/themes').catch(() => ({ themes: [] })); setThemes(th.themes); } else setThemes([]);
    } catch { /* section masquée */ }
  }, [api, showArchived]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return null;

  const replace = (n: Goal) => setD((v) => (v ? { ...v, goals: replaceGoal(v.goals, n, showArchived) } : v));
  const drop = (id: string) => setD((v) => (v ? { ...v, goals: v.goals.filter((g) => g.id !== id) } : v));
  const prefs = async (body: Partial<SelfCheckResponse['prefs']>) => { setD((v) => (v ? { ...v, prefs: { ...v.prefs, ...body } } : v)); await api.put('/me/selfcheck/prefs', body).catch(() => {}); };
  const erase = () => Alert.alert(t('scTitle'), t('scEraseConfirm'), [
    { text: t('cancelBtn'), style: 'cancel' },
    { text: t('scErase'), style: 'destructive', onPress: () => { void api.del('/me/selfcheck').then(load).catch(() => {}); } },
  ]);
  const full = goalsFull(d);

  return (
    <View style={{ gap: 14 }}>
      <Panel style={{ gap: 12 }}>
        <Txt weight="extrabold" size={18} accessibilityRole="header">{t('scTitle')}</Txt>
        <Txt size={14} color={colors.text2}>{t('scIntro')}</Txt>
        <Txt size={12} color={colors.muted}>{t('scWeekHead', { a: shortDate(d.week, locale), b: shortDate(addDays(d.week, 6), locale) })}</Txt>
      </Panel>
      {([['quality', 'scQualities', 'scAddQuality', 'scEmptyQuality'], ['defect', 'scDefects', 'scAddDefect', 'scEmptyDefect']] as const).map(([nature, titleKey, addKey, emptyKey]) => {
        const goals = d.goals.filter((g) => g.nature === nature);
        return (
          <View key={nature} style={{ gap: 10 }}>
            <Txt weight="bold" size={16} accessibilityRole="header">{t(titleKey)}</Txt>
            {goals.length === 0 && adding !== nature ? <Txt size={14} color={colors.muted}>{t(emptyKey)}</Txt> : null}
            {goals.map((g) => <GoalCard key={g.id} g={g} d={d} onChange={replace} onRemove={drop} />)}
            {adding === nature
              ? <AddForm nature={nature} d={d} themes={themes} onCancel={() => setAdding(null)} onAdded={() => { setAdding(null); void load(); }} />
              : <Button label={`+ ${t(addKey)}`} variant="dark" disabled={full} onPress={() => setAdding(nature)} />}
          </View>
        );
      })}
      {full ? <Txt size={12} color={colors.muted}>{t('scFull', { n: d.limit })}</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt size={14} style={{ flex: 1 }}>{t('scShowArchived')}</Txt>
        <Switch accessibilityLabel={t('scShowArchived')} value={showArchived} onValueChange={setShowArchived} />
      </View>
      {d.emailEnabled ? (
        <Panel style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt size={14} style={{ flex: 1 }}>{t('scRemind')}</Txt>
            <Switch accessibilityLabel={t('scRemind')} value={d.prefs.email} onValueChange={(v) => { void prefs({ email: v }); }} />
          </View>
          {d.prefs.email ? (
            <>
              <Txt size={13} color={colors.muted}>{t('scRemindDay')} · {t('scRemindHour', { h: d.emailHour })}</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} label={dayName(n, locale)} active={d.prefs.weekday === n} onPress={() => { void prefs({ weekday: n }); }} />)}
              </ScrollView>
            </>
          ) : null}
        </Panel>
      ) : null}
      <Txt size={12} color={colors.muted}>{t('scPrivacy')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {/* L'export (fichier JSON / CSV) se télécharge depuis le site. */}
        <Txt size={13} weight="bold" color={colors.goldLight} onPress={() => { void Linking.openURL(`${SITE_URL}/learning?tab=bilan`); }}>{t('scExportJson')} ↗</Txt>
        <Txt size={13} weight="bold" color={colors.muted} onPress={erase}>{t('scErase')}</Txt>
      </View>
      <Evolution />
    </View>
  );
}

function GoalCard({ g, d, onChange, onRemove }: { g: Goal; d: SelfCheckResponse; onChange: (g: Goal) => void; onRemove: (id: string) => void }) {
  const { api, t, locale } = useSession();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(g.current?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async <R,>(fn: () => Promise<R>): Promise<R | null> => {
    setBusy(true); setErr('');
    try { return await fn(); } catch (e) { setErr(e instanceof ApiError ? e.message : t('errGeneric')); return null; } finally { setBusy(false); }
  };
  const check = async (status: ScState, withNote?: string) => {
    const r = await run(() => api.put<{ status: ScState; note: string }>(`/me/selfcheck/goals/${g.id}/checkin`, { status, ...(withNote !== undefined ? { note: withNote } : {}) }));
    if (r) onChange({ ...g, current: { status: r.status, note: r.note }, marks: { ...g.marks, [d.week]: r.status } });
    return Boolean(r);
  };
  const patch = async (body: object) => { const r = await run(() => api.patch<Goal>(`/me/selfcheck/goals/${g.id}`, body)); if (r) onChange(r); };
  const remove = () => Alert.alert(t('scTitle'), t('scRemoveConfirm'), [
    { text: t('cancelBtn'), style: 'cancel' },
    { text: t('pzRemove'), style: 'destructive', onPress: () => { void run(() => api.del(`/me/selfcheck/goals/${g.id}`)).then((r) => { if (r !== null) onRemove(g.id); }); } },
  ]);
  const linked = d.commitments.find((c) => c.id === g.commitmentId);
  return (
    <Panel style={{ gap: 10, opacity: g.archived ? 0.7 : 1 }}>
      <Txt weight="bold" size={15}>{g.title}</Txt>
      {!g.archived ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={t('scThisWeek')}>
          {SC_STATES.map((s) => <Chip key={s} label={t(`scSt_${s}` as Key)} active={g.current?.status === s} onPress={() => { if (!busy && g.current?.status !== s) void check(s); }} />)}
        </View>
      ) : null}
      {/* Frise des 8 dernières semaines (texte pour les lecteurs d'écran). */}
      <View accessibilityLabel={t('scFrise')} style={{ flexDirection: 'row', gap: 4 }}>
        {d.weeks.map((w) => {
          const s = g.marks[w];
          return <View key={w} accessibilityLabel={`${t('scWeekOf', { d: shortDate(w, locale) })} : ${s ? t(`scSt_${s}` as Key) : t('scNoCheck')}`}
            style={{ flex: 1, height: 12, borderRadius: 3, backgroundColor: stateColor(s), borderWidth: 1, borderColor: colors.borderSoft }} />;
        })}
      </View>
      {linked ? <Txt size={12} color={colors.muted}>{t('scLinked')} : {linked.text}</Txt> : null}
      {open ? (
        <View style={{ gap: 8 }}>
          <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} placeholder={t('scNotePh')} placeholderTextColor={colors.muted} accessibilityLabel={t('pzNote')}
            style={[inputStyle(), { minHeight: 80, textAlignVertical: 'top' }]} />
          {!g.current ? <Txt size={12} color={colors.muted}>{t('scNoteFirst')}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={t('save')} disabled={busy || !g.current} onPress={async () => { if (g.current && await check(g.current.status, note)) setOpen(false); }} style={{ flex: 1 }} />
            <Button label={t('cancelBtn')} variant="dark" onPress={() => { setNote(g.current?.note || ''); setOpen(false); }} style={{ flex: 1 }} />
          </View>
        </View>
      ) : g.current?.note ? <Txt size={14} color={colors.text2}>{g.current.note}</Txt> : null}
      {!g.archived && d.commitments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel={t('scLink')}>
          <Chip label={t('scLink')} active={!g.commitmentId} onPress={() => { void patch({ commitmentId: null }); }} />
          {d.commitments.map((c) => <Chip key={c.id} label={c.text.slice(0, 40)} active={g.commitmentId === c.id} onPress={() => { void patch({ commitmentId: c.id }); }} />)}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {!g.archived && !open ? <Tool label={g.current?.note ? t('pzNoteEdit') : t('pzNoteAdd')} onPress={() => { setNote(g.current?.note || ''); setOpen(true); }} /> : null}
        <Tool label={g.archived ? t('scUnarchive') : t('scArchive')} onPress={() => { void patch({ archived: !g.archived }); }} />
        <Tool label={t('pzRemove')} onPress={remove} />
      </View>
      {err ? <Txt size={13} color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
    </Panel>
  );
}

function Tool({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 40, justifyContent: 'center' }}><Txt size={13} weight="bold" color={colors.goldLight}>{label}</Txt></Pressable>;
}

function AddForm({ nature, d, themes, onAdded, onCancel }: { nature: 'quality' | 'defect'; d: SelfCheckResponse; themes: ScTheme[]; onAdded: () => void; onCancel: () => void }) {
  const { api, t } = useSession();
  const [theme, setTheme] = useState('');
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = themes.filter((x) => x.kind === nature);
  const chosen = list.find((x) => x.id === theme);
  async function submit() {
    setBusy(true); setErr('');
    try {
      await api.post('/me/selfcheck/goals', { nature, ...(title.trim() && !theme ? { title: title.trim() } : {}), ...(theme ? { themeId: theme } : {}), ...(d.consent ? {} : { consent }) });
      onAdded();
    } catch (e) { setErr(e instanceof ApiError && e.code === 'consent_required' ? t('pzNeedConsent') : e instanceof ApiError ? e.message : t('errGeneric')); } finally { setBusy(false); }
  }
  return (
    <Panel style={{ gap: 10, borderColor: colors.goldLine }}>
      {list.length > 0 ? (
        <>
          <Txt size={13} color={colors.muted}>{t('scPickTheme')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label={t('scOwnWords')} active={!theme} onPress={() => setTheme('')} />
            {list.map((x) => <Chip key={x.id} label={`${x.title}${x.ar ? ` — ${x.ar}` : ''}`} active={theme === x.id} onPress={() => setTheme(x.id)} />)}
          </View>
          {chosen?.desc ? <Txt size={13} color={colors.text2}>{chosen.desc}</Txt> : null}
        </>
      ) : null}
      {!theme ? (
        <TextInput value={title} onChangeText={setTitle} maxLength={200} placeholder={t(nature === 'quality' ? 'scPhQuality' : 'scPhDefect')} placeholderTextColor={colors.muted}
          accessibilityLabel={t('scGoalText')} style={inputStyle()} />
      ) : null}
      {!d.consent ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Switch accessibilityLabel={t('pzConsent')} value={consent} onValueChange={setConsent} />
          <Txt size={13} color={colors.text2} style={{ flex: 1 }}>{t('pzConsent')}</Txt>
        </View>
      ) : null}
      {err ? <Txt size={13} color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={busy ? t('saving') : t('scAdd')} disabled={busy || (!theme && title.trim().length < 3) || (!d.consent && !consent)} onPress={() => { void submit(); }} style={{ flex: 1 }} />
        <Button label={t('cancelBtn')} variant="dark" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </Panel>
  );
}

/** « Mon évolution » : par thème et par mois, des faits (jamais de score ni de comparaison). */
export function Evolution() {
  const { api, t, locale } = useSession();
  const [d, setD] = useState<EvolutionResponse | null>(null);
  const load = useCallback((m?: string) => { api.get<EvolutionResponse>('/me/evolution', m ? { month: m } : undefined).then(setD).catch(() => {}); }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  return (
    <Panel style={{ gap: 10 }}>
      <Txt weight="extrabold" size={18} accessibilityRole="header">{t('evTitle')}</Txt>
      <Txt size={14} color={colors.text2}>{t('evIntro')}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel={t('evMonth')}>
        {d.months.map((m) => <Chip key={m} label={monthLabel(m, locale)} active={d.month === m} onPress={() => load(m)} />)}
      </ScrollView>
      {d.themes.length === 0 ? <Txt size={14} color={colors.muted}>{t('evEmpty')}</Txt> : d.themes.map((x) => (
        <View key={x.id} style={{ gap: 4, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft }}>
          <Txt weight="bold">{x.title}</Txt>
          <Txt size={12} weight="bold" color={colors.goldLight}>{t('evLearned')}</Txt>
          <Txt size={13} color={colors.text2}>{t('evWatched', { n: x.watched })} · {t('evQuizzes', { n: x.quizzes })}</Txt>
          <Txt size={12} weight="bold" color={colors.goldLight}>{t('evPracticed')}</Txt>
          <Txt size={13} color={colors.text2}>{t('evMade', { n: x.made })} · {t('evDone', { n: x.done })}</Txt>
          {x.goals > 0 ? <Txt size={13} color={colors.text2}>{t('evGoal', { n: x.goals })}{x.achieved + x.progress + x.notYet > 0 ? ` — ${t('evChecks', { a: x.achieved, b: x.progress, c: x.notYet })}` : ''}</Txt> : null}
        </View>
      ))}
      <Txt size={12} color={colors.muted}>{t('evPrivacy')}</Txt>
    </Panel>
  );
}
