// Mon planning (Apprentissage) — mêmes données et mêmes règles que web/components/PlanningClient.js (étapes 1 à 3).
// Vues jour / semaine / mois, séances du membre (ajout, déplacement, case à cocher, suppression), échéances avec aperçu,
// jours de repos, lien avec l'objectif de la semaine, rappels. Pas de sélecteur de date natif (aucune dépendance native) :
// les dates se choisissent avec des boutons −/+ (jour, semaine).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { addDays, canPlan, groupByDay, mondayOf, sectionOfKind, stepCursor, todoCount, windowOf, type PlanView } from '@/lib/plan';
import type { DeadlinePreview, PlanAuto, PlanItem, PlanPrefs, PlanResponse } from '@/lib/types';
import type { Key } from '@/lib/i18n';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, Eyebrow, Field, Loading, Panel, Txt } from '@/components/ui';

type SectionGo = (s: 'cards' | 'quran' | 'athkar' | 'commit' | 'bilan') => void;
type TalkHit = { id: string; title: string; speaker?: string | null };
const parisToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const KIND_KEY: Record<string, Key> = { video: 'pnVideo', quiz: 'pnQuiz', custom: 'pnNote', cards: 'pnKindCards', quran: 'pnKindQuran', athkar: 'pnKindAthkar', action: 'pnKindAction', bilan: 'pnKindBilan' };
const NAME_KEY: Record<string, Key> = { cards: 'pnCards', quran: 'qrNav', athkar: 'atTab', action: 'tbCommit', bilan: 'msBilan', revision: 'pnAuto' };

export function Planning({ go }: { go: SectionGo }) {
  const { t, locale, api, isRTL } = useSession();
  const today0 = useMemo(parisToday, []);
  const [view, setView] = useState<PlanView>('day');
  const [cursor, setCursor] = useState(today0);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<string | null>(null); // jour du formulaire d'ajout
  const [dlForm, setDlForm] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const win = useMemo(() => windowOf(view, cursor), [view, cursor]);
  const plan = useAsync(() => api.get<PlanResponse>('/me/learning/plan', { from: win.from, to: win.to }), [win.from, win.to]);
  const data = plan.data;
  const today = data?.today ?? today0;
  const loc = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
  const side = { textAlign: isRTL ? 'right' : 'left' } as const;
  const row = { flexDirection: isRTL ? 'row-reverse' : 'row' } as const;

  const byDay = useMemo(() => groupByDay(data?.auto ?? [], data?.items ?? []), [data]);
  const rest = useMemo(() => new Set(data?.rest ?? []), [data]);
  const active = useMemo(() => new Set(data?.active ?? []), [data]);
  const dls = data?.deadlines ?? [];
  const bucket = (d: string) => byDay.get(d) ?? { auto: [], mine: [] };

  const act = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr((e as { message?: string })?.message || t('pnErr')); }
    await plan.reload();
  };
  const toggle = (i: PlanItem) => act(() => api.patch(`/me/learning/plan/${i.id}`, { done: !i.done }));
  const del = (i: PlanItem) => act(() => api.del(`/me/learning/plan/${i.id}`));
  const move = (i: PlanItem, day: string) => { setMoving(null); return act(() => api.patch(`/me/learning/plan/${i.id}`, { day })); };
  const setRest = (day: string, on: boolean) => act(() => api.put('/me/learning/plan/rest', { day, rest: on }));
  const delDl = (id: string) => act(() => api.del(`/me/learning/deadlines/${id}`));

  const title = view === 'day' ? fmt(cursor, { weekday: 'long', day: 'numeric', month: 'long' })
    : view === 'week' ? `${fmt(win.from, { day: 'numeric', month: 'short' })} – ${fmt(win.to, { day: 'numeric', month: 'short' })}`
      : fmt(cursor, { month: 'long', year: 'numeric' });

  const autoLabel = (a: PlanAuto): string => (a.type === 'cards' ? (a.count === 1 ? t('pnCard1') : t('pnCardsN', { n: a.count ?? 0 }))
    : a.type === 'quran' ? t('pnJuz', { n: a.juz ?? 0 }) : a.type === 'athkar' ? t('pnAthkarDay', { n: a.goal ?? 0 })
      : a.type === 'bilan' ? t('pnBilanDo') : a.title ?? '');
  const openAuto = (a: PlanAuto) => {
    if (a.type === 'revision' && a.talkId) router.push({ pathname: '/talk/[id]', params: { id: a.talkId, quiz: '1' } });
    else { const s = sectionOfKind(a.type); if (s) go(s); }
  };
  const mineText = (i: PlanItem): string => (i.kind === 'custom' ? i.note ?? '' : i.kind === 'video' || i.kind === 'quiz' ? i.title ?? '' : (i.note || t(KIND_KEY[i.kind])));
  const openMine = (i: PlanItem) => {
    if ((i.kind === 'video' || i.kind === 'quiz') && i.talkId) router.push({ pathname: '/talk/[id]', params: i.kind === 'quiz' ? { id: i.talkId, quiz: '1' } : { id: i.talkId } });
    else { const s = sectionOfKind(i.kind); if (s) go(s); }
  };

  const link = (txt: string, onPress: () => void, color: string = colors.goldLight) => (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}><Txt size={13} weight="bold" color={color}>{txt}</Txt></Pressable>
  );

  const AutoRow = ({ a }: { a: PlanAuto }) => (
    <Pressable accessibilityRole="link" onPress={() => openAuto(a)} style={[{ minHeight: 48, paddingVertical: 8, gap: 8, alignItems: 'center', opacity: a.done ? 0.55 : 1 }, row]}>
      <Txt size={11} weight="bold" color={colors.muted} style={{ minWidth: 70 }}>{t(NAME_KEY[a.type])}{a.done ? ' ✓' : ''}</Txt>
      <View style={{ flex: 1 }}>
        <Txt size={14} style={side}>{a.type === 'revision' ? a.title ?? '' : autoLabel(a)}</Txt>
        {a.type === 'revision' ? <Txt size={12} color={colors.muted} style={side}>{t('pnStage', { n: (a.stage ?? 0) + 1 })}</Txt> : null}
      </View>
    </Pressable>
  );
  const MineRow = ({ i }: { i: PlanItem }) => (
    <View style={{ paddingVertical: 6, gap: 6, opacity: i.done ? 0.6 : 1 }}>
      <View style={[{ gap: 10, alignItems: 'center' }, row]}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: i.done }} accessibilityLabel={i.done ? t('pnUncheck') : t('pnCheck')} onPress={() => void toggle(i)}
          style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: i.done ? colors.gold : 'transparent' }}>
          {i.done ? <Txt size={16} weight="extrabold" color={colors.onGold}>✓</Txt> : null}
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => openMine(i)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Txt size={11} weight="bold" color={colors.muted} style={side}>{i.deadlineId ? '⚑ ' : ''}{t('pnMine')} · {t(KIND_KEY[i.kind])}</Txt>
          <Txt size={14} style={[side, i.done ? { textDecorationLine: 'line-through' } : null]}>{mineText(i)}</Txt>
        </Pressable>
      </View>
      <View style={[{ gap: 18 }, row]}>
        {moving === i.id ? (
          <View style={[{ gap: 8, alignItems: 'center' }, row]}>
            {link('−1', () => void move(i, addDays(i.day, -1) < today ? today : addDays(i.day, -1)))}
            <Txt size={13} color={colors.muted}>{fmt(i.day, { weekday: 'short', day: 'numeric', month: 'short' })}</Txt>
            {link('+1', () => void move(i, addDays(i.day, 1)))}
            {link('+7', () => void move(i, addDays(i.day, 7)))}
            {link(t('pnCancel'), () => setMoving(null), colors.muted)}
          </View>
        ) : link(t('pnMove'), () => setMoving(i.id))}
        {link(t('pnDelete'), () => void del(i), colors.muted)}
      </View>
    </View>
  );

  const DayBlock = ({ d }: { d: string }) => {
    const b = bucket(d);
    const flags = dls.filter((x) => x.dueOn === d);
    const empty = !b.auto.length && !b.mine.length && !flags.length;
    return (
      <View style={{ gap: 4 }}>
        {flags.map((x) => <Txt key={x.id} size={13} weight="bold" color={colors.goldLight} style={side}>⚑ {t('pnDlFlag')} · {x.title}</Txt>)}
        {rest.has(d) ? <Txt size={13} color={colors.muted} style={side}>{t('pnRest')}</Txt> : null}
        {active.has(d) ? <Txt size={13} color={colors.goldLight} style={side}>✓ {t('pnDoneDay')}</Txt> : null}
        {b.auto.map((a, k) => <AutoRow key={`a${k}`} a={a} />)}
        {b.mine.map((i) => <MineRow key={i.id} i={i} />)}
        {empty && !rest.has(d) ? <Txt size={13} color={colors.muted} style={side}>{t('pnEmpty')}</Txt> : null}
      </View>
    );
  };
  const dayActions = (d: string) => canPlan(d, today) && (
    <View style={[{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }, row]}>
      {link(`+ ${t('pnAddHere')}`, () => setForm(d))}
      {!bucket(d).mine.length ? link(rest.has(d) ? t('pnRestUnset') : t('pnRestSet'), () => void setRest(d, !rest.has(d)), colors.muted) : null}
    </View>
  );

  let body: React.ReactNode;
  if (!data) body = plan.error ? <Txt color={colors.muted}>{t('pnErr')}</Txt> : <Loading />;
  else if (view === 'day') {
    const n = todoCount(byDay.get(cursor));
    body = (
      <Panel>
        <View style={[{ justifyContent: 'space-between' }, row]} accessibilityLabel={t('pnWeek')}>
          {Array.from({ length: 7 }, (_, k) => addDays(mondayOf(cursor), k)).map((d) => (
            <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: d === cursor }} onPress={() => setCursor(d)}
              style={{ width: 42, alignItems: 'center', paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: d === cursor ? colors.gold : colors.border, backgroundColor: d === cursor ? colors.gold : 'transparent' }}>
              <Txt size={11} color={d === cursor ? colors.onGold : colors.muted}>{fmt(d, { weekday: 'narrow' })}</Txt>
              <Txt size={15} weight="bold" color={d === cursor ? colors.onGold : d === today ? colors.goldLight : colors.text}>{fmt(d, { day: 'numeric' })}</Txt>
              <Txt size={10} color={d === cursor ? colors.onGold : colors.goldLight}>{active.has(d) ? '✓' : ' '}</Txt>
            </Pressable>
          ))}
        </View>
        {n > 0 ? <Txt size={13} color={colors.muted} style={side}>{t('pnTodoN', { n })}</Txt> : null}
        <DayBlock d={cursor} />
        {dayActions(cursor)}
        {cursor === today ? <Txt size={12} color={colors.muted} style={side}>{t('pnLate')}</Txt> : null}
      </Panel>
    );
  } else if (view === 'week') {
    body = (
      <View style={{ gap: 10 }}>
        {Array.from({ length: 7 }, (_, k) => addDays(win.from, k)).map((d) => (
          <Panel key={d} style={d === today ? { borderColor: colors.gold } : rest.has(d) ? { opacity: 0.8 } : undefined}>
            <Pressable accessibilityRole="button" onPress={() => { setCursor(d); setView('day'); }} style={[{ gap: 8, alignItems: 'center', minHeight: 36 }, row]}>
              <Txt weight="bold" size={15}>{fmt(d, { weekday: 'long', day: 'numeric', month: 'short' })}</Txt>
              {active.has(d) ? <Txt size={14} color={colors.goldLight}>✓</Txt> : null}
            </Pressable>
            <DayBlock d={d} />
            {dayActions(d)}
          </Panel>
        ))}
      </View>
    );
  } else {
    const cur = cursor.slice(0, 7);
    const cells = Array.from({ length: 42 }, (_, k) => addDays(win.from, k));
    body = (
      <Panel>
        <View style={[{ flexWrap: 'wrap' }, row]} accessibilityRole="grid">
          {Array.from({ length: 7 }, (_, k) => <View key={k} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 4 }}><Txt size={11} color={colors.muted}>{fmt(addDays(win.from, k), { weekday: 'narrow' })}</Txt></View>)}
          {cells.map((d) => {
            const b = bucket(d); const n = b.auto.length + b.mine.length; const flag = dls.some((x) => x.dueOn === d);
            return (
              <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${fmt(d, { dateStyle: 'full' } as Intl.DateTimeFormatOptions)}${n ? ` — ${n}` : ''}`}
                onPress={() => { setCursor(d); setView('day'); }} style={{ width: `${100 / 7}%`, height: 54, alignItems: 'center', justifyContent: 'center', opacity: d.slice(0, 7) !== cur ? 0.4 : 1 }}>
                <View style={{ width: 40, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: d === today ? 2 : 0, borderColor: colors.gold, backgroundColor: rest.has(d) ? colors.panel2 : 'transparent' }}>
                  <Txt size={14} weight={d === today ? 'bold' : 'regular'}>{fmt(d, { day: 'numeric' })}</Txt>
                  <Txt size={10} color={colors.goldLight}>{flag ? '⚑' : active.has(d) ? '✓' : n > 0 ? `● ${n}` : ' '}</Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Panel>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[{ gap: 8, flexWrap: 'wrap' }, row]}>
        {(['day', 'week', 'month'] as const).map((v) => <Chip key={v} label={t(({ day: 'pnDay', week: 'pnWeek', month: 'pnMonth' } as const)[v])} active={view === v} onPress={() => setView(v)} />)}
      </View>
      <View style={[{ gap: 8, alignItems: 'center' }, row]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('pnPrev')} onPress={() => setCursor(stepCursor(view, cursor, -1))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Txt size={22}>{isRTL ? '›' : '‹'}</Txt></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setCursor(today)} style={{ minHeight: 44, justifyContent: 'center' }}><Txt size={13} weight="bold" color={colors.goldLight}>{t('pnToday')}</Txt></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('pnNext')} onPress={() => setCursor(stepCursor(view, cursor, 1))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Txt size={22}>{isRTL ? '‹' : '›'}</Txt></Pressable>
        <Txt weight="bold" size={15} style={{ flex: 1, textAlign: 'center' }}>{title}</Txt>
      </View>
      <View style={[{ gap: 8 }, row]}>
        <Button label={`+ ${t('pnAdd')}`} onPress={() => setForm(canPlan(cursor, today) ? cursor : today)} style={{ flex: 1 }} />
        <Button label={t('pnDl')} variant="dark" onPress={() => setDlForm(true)} style={{ flex: 1 }} />
      </View>
      {dls.map((x) => (
        <Panel key={x.id}>
          <View style={[{ gap: 10, alignItems: 'center' }, row]}>
            <View style={{ flex: 1 }}>
              <Txt weight="bold" style={side}>⚑ {x.title}</Txt>
              <Txt size={12} color={colors.muted} style={side}>{fmt(x.dueOn, { day: 'numeric', month: 'long', year: 'numeric' })} · {t('pnDlLeft', { n: x.daysLeft })} · {t('pnDlProgress', { a: x.done, b: x.total })}</Txt>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.panel2, overflow: 'hidden' }}><View style={{ height: 6, width: `${x.total ? Math.round((x.done / x.total) * 100) : 0}%`, backgroundColor: colors.gold }} /></View>
          <View style={[{ gap: 18 }, row]}>
            {link(t('pnMonth'), () => { setCursor(x.dueOn); setView('month'); })}
            {link(t('pnDlDelete'), () => void delDl(x.id), colors.muted)}
          </View>
        </Panel>
      ))}
      {data ? (
        <Txt size={13} color={colors.muted} style={side}>
          {t('pnGoal', { a: data.week.done, b: data.goal })}
          {data.outlook ? (data.outlook.reachable ? t('pnGoalOk') : t('pnGoalMiss', { n: data.outlook.missing })) : ''}
        </Txt>
      ) : null}
      {err ? <Txt color="#ff8a80" accessibilityRole="alert" style={side}>{err}</Txt> : null}
      {body}
      <Txt size={12} color={colors.muted} style={side}>{t('pnLegAuto')} · {t('pnLegMine')} · {t('pnLegDone')}</Txt>
      <Reminders />
      {form ? <AddForm day={form} today={today} onClose={() => setForm(null)} onSaved={() => { setForm(null); void plan.reload(); }} /> : null}
      {dlForm ? <DeadlineForm today={today} onClose={() => setDlForm(false)} onSaved={() => { setDlForm(false); void plan.reload(); }} /> : null}
    </View>
  );
}

/** Fenêtre modale commune aux deux formulaires. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { isRTL } = useSession();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: colors.border }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Txt weight="extrabold" size={18} style={{ textAlign: isRTL ? 'right' : 'left' }}>{title}</Txt>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Sélecteur de jour par boutons (−7, −1, +1, +7) : pas de calendrier natif. */
function DayStepper({ value, min, onChange, label }: { value: string; min: string; onChange: (d: string) => void; label: string }) {
  const { locale, isRTL } = useSession();
  const set = (n: number) => { const d = addDays(value, n); onChange(d < min ? min : d); };
  const text = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
  const b = (txt: string, n: number) => <Pressable key={txt} accessibilityRole="button" accessibilityLabel={txt} onPress={() => set(n)} style={{ minWidth: 44, height: 44, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Txt weight="bold" size={13}>{txt}</Txt></Pressable>;
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, alignItems: 'center' }}>
        {b('−7', -7)}{b('−1', -1)}<Txt style={{ flex: 1, textAlign: 'center' }} size={13} weight="bold">{text}</Txt>{b('+1', 1)}{b('+7', 7)}
      </View>
    </View>
  );
}

/** Recherche de vidéos (après une courte pause de frappe). */
function TalkSearch({ onPick, exclude = [] }: { onPick: (x: TalkHit) => void; exclude?: string[] }) {
  const { t, api } = useSession();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<TalkHit[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    let alive = true;
    const h = setTimeout(() => { api.get<TalkHit[]>('/talks', { q: q.trim(), limit: 8 }).then((r) => { if (alive) setRes(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setRes([]); }); }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q, api]);
  const list = (res ?? []).filter((x) => !exclude.includes(x.id));
  return (
    <View style={{ gap: 6 }}>
      <Field label={t('pnSearch')} value={q} onChangeText={setQ} autoCapitalize="none" />
      {res && list.length === 0 ? <Txt size={13} color={colors.muted}>{t('pnNoResult')}</Txt> : null}
      {list.map((x) => (
        <Pressable key={x.id} accessibilityRole="button" onPress={() => { onPick(x); setQ(''); setRes(null); }} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Txt weight="bold" size={14}>{x.title}</Txt>{x.speaker ? <Txt size={12} color={colors.muted}>{x.speaker}</Txt> : null}
        </Pressable>
      ))}
    </View>
  );
}

const ADD_KINDS: [PlanItem['kind'], Key][] = [['video', 'pnKindVideo'], ['quiz', 'pnKindQuiz'], ['cards', 'pnKindCards'], ['quran', 'pnKindQuran'], ['athkar', 'pnKindAthkar'], ['action', 'pnKindAction'], ['bilan', 'pnKindBilan'], ['custom', 'pnKindCustom']];

function AddForm({ day, today, onClose, onSaved }: { day: string; today: string; onClose: () => void; onSaved: () => void }) {
  const { t, api, isRTL } = useSession();
  const [d, setD] = useState(day);
  const [kind, setKind] = useState<PlanItem['kind']>('video');
  const [talk, setTalk] = useState<TalkHit | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const withTalk = kind === 'video' || kind === 'quiz';
  const ready = withTalk ? !!talk : kind === 'custom' ? note.trim().length > 0 : true;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    try {
      await api.post('/me/learning/plan', withTalk ? { day: d, kind, talkId: talk?.id } : { day: d, kind, note: note.trim() });
      onSaved();
    } catch (e) { setErr((e as { message?: string })?.message || t('pnErr')); }
    setBusy(false);
  };
  return (
    <Sheet title={t('pnFormTitle')} onClose={onClose}>
      <DayStepper value={d} min={today} onChange={setD} label={t('pnFormDay')} />
      <Eyebrow>{t('pnFormKind')}</Eyebrow>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
        {ADD_KINDS.map(([k, key]) => <Chip key={k} label={t(key)} active={kind === k} onPress={() => { setKind(k); setTalk(null); setNote(''); }} />)}
      </View>
      {withTalk ? (talk ? (
        <View style={{ gap: 6 }}><Txt weight="bold">{talk.title}</Txt><Pressable accessibilityRole="button" onPress={() => setTalk(null)} style={{ minHeight: 40, justifyContent: 'center' }}><Txt size={13} color={colors.goldLight}>{t('pnCancel')}</Txt></Pressable></View>
      ) : <TalkSearch onPick={setTalk} />) : (
        <Field label={kind === 'custom' ? t('pnNote') : t('pnNoteOpt')} value={note} onChangeText={setNote} maxLength={120} placeholder={t('pnCustomPh')} />
      )}
      {err ? <Txt color="#ff8a80" accessibilityRole="alert">{err}</Txt> : null}
      <Button label={t('pnSave')} onPress={() => void save()} disabled={!ready} loading={busy} />
      <Button label={t('pnCancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

function DeadlineForm({ today, onClose, onSaved }: { today: string; onClose: () => void; onSaved: () => void }) {
  const { t, api, isRTL } = useSession();
  const tomorrow = addDays(today, 1);
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState(addDays(today, 30));
  const [series, setSeries] = useState<{ id: string; title: string }[]>([]);
  const [seriesId, setSeriesId] = useState('');
  const [talks, setTalks] = useState<TalkHit[]>([]);
  const [pace, setPace] = useState<'light' | 'normal' | 'intense'>('normal');
  const [prev, setPrev] = useState<DeadlinePreview | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<{ id: string; title: string }[]>('/series', { limit: 100 }).then((r) => setSeries(Array.isArray(r) ? r : [])).catch(() => setSeries([])); }, [api]);
  const hasTalks = !!seriesId || talks.length > 0;
  const body = useCallback((extra: object) => ({ title: title.trim() || '-', dueOn, pace, ...(seriesId ? { seriesId } : {}), talkIds: talks.map((x) => x.id), ...extra }), [title, dueOn, pace, seriesId, talks]);
  // Aperçu (rien n'est créé) dès que le choix est complet.
  useEffect(() => {
    if (!hasTalks || dueOn < tomorrow) { setPrev(null); return undefined; }
    let alive = true;
    const h = setTimeout(() => {
      api.post<DeadlinePreview>('/me/learning/deadlines', body({ dryRun: true }))
        .then((r) => { if (alive) { setPrev(r); setErr(''); } })
        .catch((e) => { if (alive) { setPrev(null); setErr((e as { message?: string })?.message || t('pnErr')); } });
    }, 300);
    return () => { alive = false; clearTimeout(h); };
  }, [seriesId, talks, pace, dueOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (busy || !title.trim() || !hasTalks) return;
    setBusy(true); setErr('');
    try { await api.post('/me/learning/deadlines', body({})); onSaved(); } catch (e) { setErr((e as { message?: string })?.message || t('pnErr')); }
    setBusy(false);
  };
  const wrap = { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 } as const;
  return (
    <Sheet title={t('pnDl')} onClose={onClose}>
      <Field label={t('pnDlName')} value={title} onChangeText={setTitle} maxLength={80} />
      <DayStepper value={dueOn} min={tomorrow} onChange={setDueOn} label={t('pnDlDate')} />
      <Eyebrow>{t('pnDlSeries')}</Eyebrow>
      <View style={wrap}>
        <Chip label={t('pnDlNone')} active={!seriesId} onPress={() => setSeriesId('')} />
        {series.map((x) => <Chip key={x.id} label={x.title} active={seriesId === x.id} onPress={() => setSeriesId(x.id)} />)}
      </View>
      <Eyebrow>{t('pnDlTalks')}</Eyebrow>
      <TalkSearch onPick={(x) => setTalks((l) => [...l, x])} exclude={talks.map((x) => x.id)} />
      {talks.length > 0 ? <View style={wrap}>{talks.map((x) => <Chip key={x.id} label={`${x.title} ✕`} active onPress={() => setTalks((l) => l.filter((y) => y.id !== x.id))} />)}</View> : null}
      <Eyebrow>{t('pnDlPace')}</Eyebrow>
      <View style={wrap}>
        {([['light', 'pnPaceLight'], ['normal', 'pnPaceNormal'], ['intense', 'pnPaceIntense']] as const).map(([k, key]) => <Chip key={k} label={t(key)} active={pace === k} onPress={() => setPace(k)} />)}
      </View>
      {prev ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
          <Txt size={13} color={colors.muted}>{t('pnDlPreview', { n: prev.count, d: prev.days })}</Txt>
          {prev.busy ? <Txt size={13} weight="bold" color={colors.goldLight}>{t('pnDlBusy', { n: prev.perDayMax })}</Txt> : null}
        </View>
      ) : null}
      {err ? <Txt color="#ff8a80" accessibilityRole="alert">{err}</Txt> : null}
      <Button label={t('pnDlCreate')} onPress={() => void save()} disabled={!title.trim() || !hasTalks} loading={busy} />
      <Button label={t('pnCancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Rappels : canaux (notification, e-mail) et types (matin, veille d'échéance, série à sauver). Rien n'est envoyé sans canal choisi. */
function Reminders() {
  const { t, api, isRTL } = useSession();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<PlanPrefs | null>(null);
  useEffect(() => { api.get<PlanPrefs>('/me/learning/plan/prefs').then(setP).catch(() => setP(null)); }, [api]);
  if (!p) return null;
  const save = async (patch: Partial<PlanPrefs>) => {
    setP({ ...p, ...patch });
    try { setP(await api.put<PlanPrefs>('/me/learning/plan/prefs', patch)); } catch { /* l'affichage reste celui choisi ; rechargé à la prochaine ouverture */ }
  };
  const sw = (key: 'push' | 'email' | 'morning' | 'deadline' | 'streak', label: string) => (
    <View key={key} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <Txt style={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }} size={14}>{label}</Txt>
      <Switch accessibilityLabel={label} value={!!p[key]} onValueChange={(v) => void save({ [key]: v })} trackColor={{ true: colors.gold, false: colors.border }} />
    </View>
  );
  return (
    <Panel>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Txt weight="bold" style={{ textAlign: isRTL ? 'right' : 'left' }}>{open ? '▾' : '▸'} {t('pnRem')}</Txt>
      </Pressable>
      {open ? (
        <View style={{ gap: 4 }}>
          <Txt size={13} color={colors.muted} style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('pnRemSub')}</Txt>
          {sw('push', t('pnRemPush'))}
          {p.push ? <Txt size={12} color={colors.muted} style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('pnRemPushHint')}</Txt> : null}
          {sw('email', t('pnRemEmail'))}
          {sw('morning', t('pnRemMorning'))}
          {p.morning ? (
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={t('pnRemHour')}>
              {[5, 6, 7, 8, 9, 10, 11, 12].map((h) => <Chip key={h} label={`${h} h`} active={p.morningHour === h} onPress={() => void save({ morningHour: h })} />)}
            </View>
          ) : null}
          {sw('deadline', t('pnRemDeadline'))}
          {sw('streak', t('pnRemStreak'))}
          <Txt size={12} color={colors.muted} style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('pnRemNote')}</Txt>
        </View>
      ) : null}
    </Panel>
  );
}
