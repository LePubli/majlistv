// Étape M5 — Onglet « Poser une question » de la fiche (comme le site, étape 41 ; offre Apprentissage).
// La réponse vient de l'IA, uniquement à partir de la transcription ; chaque réponse montre le passage cité avec « Revoir à mm:ss ».
// Historique des échanges (90 jours, supprimables), signalement d'une réponse à l'équipe, quota du jour.
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { useSession } from '@/lib/session';
import { SITE_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';
import { MAX_QUESTION, askErrorKey, clock, dropTurn, markReported, pushTurn, validQuestion, type AskTurn } from '@/lib/learnHub';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Txt } from '../ui';

type Info = { available: boolean; reason?: string; remaining?: number; dailyMax?: number; locked?: boolean };

export function AskPanel({ talkId, onSeek }: { talkId: string; onSeek: (ms: number) => void }) {
  const { api, t, isRTL } = useSession();
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setInfo(undefined); setTurns([]); setErr('');
    api.get<Info>(`/talks/${talkId}/ask`).then((r) => { if (alive) setInfo(r); }).catch((e) => {
      if (!alive) return;
      if (e instanceof ApiError && e.code === 'learning_required') setInfo({ available: false, locked: true });
      else setInfo({ available: false, reason: e instanceof ApiError ? e.code || 'ask_unavailable' : 'ask_unavailable' });
    });
    api.get<{ items: AskTurn[] }>(`/talks/${talkId}/ask/history`).then((r) => { if (alive) setTurns(r.items); }).catch(() => {});
    return () => { alive = false; };
  }, [api, talkId]);

  async function send() {
    if (busy || !validQuestion(q)) return;
    setBusy(true); setErr('');
    const question = q.trim();
    try {
      const r = await api.post<AskTurn & { remaining: number; dailyMax: number }>(`/talks/${talkId}/ask`, { question });
      setTurns((x) => pushTurn(x, { ...r, question }));
      setInfo((i) => ({ ...(i as Info), remaining: r.remaining, dailyMax: r.dailyMax }));
      setQ('');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setErr(t(askErrorKey(code, e instanceof ApiError ? e.status : undefined)));
      if (code === 'ask_quota') setInfo((i) => ({ ...(i as Info), remaining: 0 }));
    } finally { setBusy(false); }
  }
  async function remove(id: string) { try { await api.del(`/talks/${talkId}/ask/${id}`); setTurns((x) => dropTurn(x, id)); } catch { /* reste affiché */ } }

  if (info === undefined) return <Txt color={colors.muted} accessibilityLiveRegion="polite">{t('askLoading')}</Txt>;
  if (info.locked) {
    return (
      <View style={{ gap: 10 }}>
        <Txt weight="bold" size={16}>{t('askTitle')}</Txt>
        <Txt size={14} color={colors.text2}>{t('askNeedLearning')}</Txt>
        <Button label={t('askSeeOffer')} variant="dark" onPress={() => { void Linking.openURL(`${SITE_URL}/pricing`); }} />
      </View>
    );
  }
  if (!info.available) return <View style={{ gap: 8 }}><Txt weight="bold" size={16}>{t('askTitle')}</Txt><Txt size={14} color={colors.muted}>{t(askErrorKey(info.reason))}</Txt></View>;
  const out = (info.remaining ?? 0) <= 0;
  return (
    <View style={{ gap: 12 }}>
      <Txt weight="bold" size={16}>{t('askTitle')}</Txt>
      <Txt size={13} color={colors.muted}>{t('askIntro')}</Txt>
      {turns.map((x, i) => <Turn key={x.id || i} x={x} talkId={talkId} onSeek={onSeek} onRemove={remove} onReported={(id) => setTurns((l) => markReported(l, id))} />)}
      <TextInput value={q} onChangeText={setQ} multiline maxLength={MAX_QUESTION} editable={!busy && !out} placeholder={t('askPlaceholder')} placeholderTextColor={colors.muted}
        accessibilityLabel={t('askTitle')}
        style={{ minHeight: 70, padding: 12, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, color: colors.text, fontFamily: fonts.medium, fontSize: 15, textAlignVertical: 'top', textAlign: isRTL ? 'right' : 'left' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt size={12} color={colors.muted} style={{ flex: 1 }}>{out ? t('askQuota') : t('askRemaining', { n: info.remaining ?? 0, m: info.dailyMax ?? 0 })}</Txt>
        <Button label={busy ? t('askThinking') : t('askSend')} loading={busy} disabled={out || !validQuestion(q)} onPress={() => { void send(); }} />
      </View>
      {err ? <Txt size={13} color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
      <Txt size={12} color={colors.muted}>{t('askNote')}</Txt>
    </View>
  );
}

function Turn({ x, talkId, onSeek, onRemove, onReported }: { x: AskTurn; talkId: string; onSeek: (ms: number) => void; onRemove: (id: string) => void; onReported: (id: string) => void }) {
  const { api, t, isRTL } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const report = async () => { if (!x.id) return; try { await api.post(`/talks/${talkId}/ask/${x.id}/report`, { reason }); onReported(x.id); } catch { /* réessayer */ } };
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft }}>
      <Txt weight="bold" size={14} color={colors.goldLight}>{x.question}</Txt>
      <Txt size={14} color={x.status && x.status !== 'answered' ? colors.muted : colors.text}>{x.answer}</Txt>
      {x.sources?.length ? (
        <View style={{ gap: 6 }}>
          <Txt size={12} color={colors.muted}>{t('askSources')}</Txt>
          {x.sources.map((s, j) => (
            <View key={j} style={{ gap: 4, paddingStart: 10, borderStartWidth: 2, borderStartColor: colors.goldLine }}>
              <Txt size={13} color={colors.text2} style={{ fontStyle: 'italic' }}>« {s.text} »</Txt>
              <Pressable accessibilityRole="button" onPress={() => onSeek(s.startMs)} style={{ minHeight: 36, justifyContent: 'center' }}>
                <Txt size={13} weight="bold" color={colors.goldLight}>▶ {t('askReplay', { t: clock(s.startMs) })}</Txt>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {x.id ? (
        <View style={{ gap: 6 }}>
          {x.reported ? <Txt size={12} color={colors.muted}>{t('askReportDone')}</Txt> : open ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput value={reason} onChangeText={setReason} maxLength={300} placeholder={t('askReportAsk')} placeholderTextColor={colors.muted} accessibilityLabel={t('askReportAsk')}
                style={{ flex: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }} />
              <Button label={t('askReportSend')} variant="dark" onPress={() => { void report(); }} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {!x.reported && !open ? <Txt size={12} weight="bold" color={colors.muted} onPress={() => setOpen(true)}>⚑ {t('askReport')}</Txt> : null}
            <Txt size={12} weight="bold" color={colors.muted} onPress={() => onRemove(x.id as string)}>{t('askDelete')}</Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}
