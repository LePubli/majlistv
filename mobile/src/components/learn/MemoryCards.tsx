// Étape M5 — Cartes mémoire (comme le site, étape 38) : séance recto / verso tirée des questions de quiz validées.
// Accueil (compteurs) → séance (question, « Voir la réponse », « Je savais » / « À revoir ») → bilan. Les cartes ratées
// reviennent une fois en fin de séance ; le calendrier (1, 3, 7, 21 jours) est tenu par le serveur. Offre Apprentissage.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { cardsToday, replayAt, requeue, type CardsResponse, type MemoryCard } from '@/lib/learnHub';
import { colors, radius } from '@/lib/theme';
import { Button, Panel, Txt } from '../ui';

export function MemoryCards({ onCount }: { onCount?: (n: number) => void }) {
  const { api, t } = useSession();
  const [data, setData] = useState<CardsResponse | null>(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'home' | 'play' | 'done'>('home');
  const [queue, setQueue] = useState<MemoryCard[]>([]);
  const [total, setTotal] = useState(0);
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [flipped, setFlipped] = useState(false);
  const [res, setRes] = useState({ known: 0, again: 0, mastered: 0 });
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState(false);

  // Référence : le parent peut passer une nouvelle fonction à chaque affichage sans relancer le chargement (pas de boucle).
  const countRef = useRef(onCount);
  countRef.current = onCount;
  const load = useCallback(async (isFree = false) => {
    try {
      const d = await api.get<CardsResponse>('/me/cards', isFree ? { free: '1' } : undefined);
      setErr(''); setData(d);
      if (!isFree) countRef.current?.(cardsToday(d.counts));
      return d;
    } catch { setErr(t('mcErr')); return null; }
  }, [api, t]);
  useEffect(() => { void load(); }, [load]);

  async function start(isFree: boolean) {
    const d = await load(isFree);
    if (!d || !d.session.cards.length) return;
    setFree(isFree); setQueue(d.session.cards); setTotal(d.session.cards.length); setRetried(new Set());
    setFlipped(false); setRes({ known: 0, again: 0, mastered: 0 }); setMode('play');
  }
  async function answer(known: boolean) {
    if (busy) return;
    const card = queue[0];
    setBusy(true);
    try {
      const r = await api.post<{ mastered?: boolean }>(`/me/cards/${card.id}/answer`, { known });
      setErr('');
      setRes((x) => ({ known: x.known + (known ? 1 : 0), again: x.again + (known ? 0 : 1), mastered: x.mastered + (r.mastered && known ? 1 : 0) }));
      const n = requeue(queue, card, known, retried);
      setRetried(n.retried); setQueue(n.queue); setFlipped(false);
      if (!n.queue.length) { setMode('done'); void load(); }
    } catch { setErr(t('mcErr')); } finally { setBusy(false); }
  }

  if (!data) return err ? <Txt color={colors.danger} accessibilityRole="alert">{err}</Txt> : <Txt color={colors.muted}>…</Txt>;
  const c = data.counts;

  if (mode === 'play' && queue[0]) {
    const card = queue[0];
    const all = total + retried.size;
    const step = Math.min(all, res.known + res.again + 1);
    const rtl = card.lang === 'ar';
    const at = replayAt(card);
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={13} color={colors.muted} accessibilityLiveRegion="polite">{t('mcProgress', { i: step, n: all })}</Txt>
          <Pressable accessibilityRole="button" onPress={() => { setMode('home'); void load(); }} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Txt weight="bold" size={13} color={colors.goldLight}>{t('mcQuit')}</Txt>
          </Pressable>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: all, now: step - 1 }} style={{ height: 6, borderRadius: 3, backgroundColor: colors.panel2, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(((step - 1) / Math.max(1, all)) * 100)}%`, height: '100%', backgroundColor: colors.gold }} />
        </View>
        <Panel style={{ gap: 12, minHeight: 220, borderColor: colors.goldLine }}>
          <Txt size={12} color={colors.muted}>{card.isNew ? `${t('mcNewBadge')} · ` : ''}{t('mcFromTalk', { t: card.talkTitle })}</Txt>
          <Txt weight="extrabold" size={20} style={{ writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }}>{card.front}</Txt>
          {flipped ? (
            <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
              <Txt weight="bold" size={12} color={colors.goldLight}>{t('mcAnswer')}</Txt>
              <Txt size={16} style={{ writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }}>{card.answer}</Txt>
              {card.explanation ? <><Txt weight="bold" size={12} color={colors.goldLight}>{t('mcWhy')}</Txt><Txt size={14} color={colors.text2}>{card.explanation}</Txt></> : null}
              {card.quote ? <><Txt weight="bold" size={12} color={colors.goldLight}>{t('mcPassage')}</Txt><Txt size={14} color={colors.text2} style={{ fontStyle: 'italic' }}>« {card.quote} »</Txt></> : null}
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/talk/[id]', params: at ? { id: card.talkId, at: String(at * 1000) } : { id: card.talkId } })} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Txt weight="bold" size={14} color={colors.goldLight}>▶ {t('mcReplay')}</Txt>
              </Pressable>
            </View>
          ) : null}
        </Panel>
        {err ? <Txt color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
        {!flipped ? <Button label={t('mcFlip')} onPress={() => setFlipped(true)} /> : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('mcAgain')} variant="dark" disabled={busy} onPress={() => { void answer(false); }} style={{ flex: 1 }} />
            <Button label={t('mcKnown')} disabled={busy} onPress={() => { void answer(true); }} style={{ flex: 1 }} />
          </View>
        )}
        {free ? <Txt size={12} color={colors.muted}>{t('mcFreeNote')}</Txt> : null}
      </View>
    );
  }

  if (mode === 'done') {
    return (
      <Panel style={{ gap: 12 }}>
        <Txt weight="extrabold" size={18} accessibilityRole="header">{t('mcDoneTitle')}</Txt>
        <Txt accessibilityRole="summary">{t('mcDoneText', { k: res.known, a: res.again })}{res.mastered > 0 ? ` ${t('mcDoneMastered', { n: res.mastered })}` : ''}</Txt>
        {res.again > 0 ? <Txt size={13} color={colors.muted}>{t('mcDoneAgain')}</Txt> : null}
        <Button label={t('mcBack')} onPress={() => { setMode('home'); void load(); }} />
      </Panel>
    );
  }

  const todayN = data.session.cards.length;
  const stat = (n: number, label: string) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', padding: 12, gap: 2, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft }}>
      <Txt weight="extrabold" size={22} color={colors.goldLight}>{n}</Txt>
      <Txt size={12} color={colors.text2}>{label}</Txt>
    </View>
  );
  return (
    <Panel style={{ gap: 12 }}>
      <Txt weight="extrabold" size={18} accessibilityRole="header">{t('mcTitle')}</Txt>
      <Txt size={14} color={colors.text2}>{t('mcIntro')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {stat(c.due, t('mcDue'))}{stat(c.newAvailable, t('mcNew'))}{stat(c.learning, t('mcLearning'))}{stat(c.mastered, t('mcMastered'))}
      </View>
      {err ? <Txt color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
      {c.total === 0 ? (
        <View style={{ gap: 8 }}>
          <Txt color={colors.muted}>{t('mcNone')}</Txt>
          <Button label={t('esFindTalk')} variant="dark" onPress={() => router.navigate('/talks')} />
        </View>
      ) : todayN === 0 ? <Txt color={colors.ok}>✓ {t('mcNoneToday')}</Txt> : <Button label={t('mcStart', { n: todayN })} onPress={() => { void start(false); }} />}
      {data.session.remaining > 0 ? <Txt size={13} color={colors.muted}>{t('mcMore', { n: data.session.remaining })}</Txt> : null}
      {c.learning + c.mastered > 0 ? (
        <View style={{ gap: 4 }}>
          <Button label={t('mcFree')} variant="dark" onPress={() => { void start(true); }} />
          <Txt size={12} color={colors.muted}>{t('mcFreeHint')}</Txt>
        </View>
      ) : null}
    </Panel>
  );
}
