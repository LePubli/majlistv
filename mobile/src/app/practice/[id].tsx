// « Et maintenant, que faire ? » : propositions d'action d'une conférence et engagement personnel (offre Apprentissage).
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { DUE_KINDS, canCommit, commitBody, isLearningRequired } from '@/lib/learn';
import type { Commitment, DueKind, PracticeTalk } from '@/lib/types';
import type { Key } from '@/lib/i18n';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, ErrorBox, Eyebrow, Field, Loading, Panel, ScreenHeader, Txt, screenStyle } from '@/components/ui';

export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, t, dirStyle } = useSession();
  const data = useAsync(() => api.get<PracticeTalk>(`/talks/${id}/practice`), [id, user?.id]);
  const [pick, setPick] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const [niyya, setNiyya] = useState('');
  const [due, setDue] = useState<DueKind | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const notFound = data.error instanceof ApiError && data.error.status === 404;
  const d = data.data;
  const consentGiven = !!d?.consent;

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await api.post<Commitment>(`/talks/${id}/practice/commitments`, commitBody({ suggestionId: pick, text: own, niyya, due, consent, consentGiven }));
      setPick(null); setOwn(''); setNiyya(''); setDue(null);
      setMsg({ ok: true, text: t('practice.saved') });
      await data.reload();
    } catch (e) {
      setMsg({ ok: false, text: isLearningRequired(e) ? t('practice.tierLocked') : e instanceof ApiError && e.status !== 0 ? e.message : t('common.error') });
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('practice.open')} />
      {data.loading && !d ? <Loading /> : notFound ? <ErrorBox message={t('practice.none')} /> : !d ? <ErrorBox onRetry={data.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Eyebrow>{t('practice.pick')}</Eyebrow>
          {d.suggestions.map((s) => {
            const on = pick === s.id;
            return (
              <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setPick(on ? null : s.id); if (!on) setOwn(''); }}
                style={({ pressed }) => ({ padding: 14, borderRadius: radius.card, borderWidth: 1.5, gap: 4, opacity: pressed ? 0.85 : 1,
                  borderColor: on ? colors.gold : colors.border, backgroundColor: on ? colors.goldTint : colors.panel })}>
                <Txt weight="semibold">{s.text}</Txt>
                {s.reference ? <Txt size={12} color={colors.muted}>{s.reference}</Txt> : null}
              </Pressable>
            );
          })}

          {!user ? (
            <Panel style={{ gap: 12 }}>
              <Txt color={colors.text2}>{t('learn.guest')}</Txt>
              <Button label={t('account.signin')} onPress={() => router.push('/login')} />
            </Panel>
          ) : !d.tier ? (
            <Panel style={{ borderColor: colors.goldLine, backgroundColor: colors.goldTint, gap: 12 }}>
              <Txt weight="bold" color={colors.goldLight}>{t('practice.tierLocked')}</Txt>
              <Button label={t('learn.openSite')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account`)} />
            </Panel>
          ) : (
            <>
              <Eyebrow>{t('practice.own')}</Eyebrow>
              <Field label={t('practice.ownHint')} value={own} onChangeText={(v) => { setOwn(v); if (v) setPick(null); }} maxLength={300} multiline />
              <Field label={t('practice.niyya')} value={niyya} onChangeText={setNiyya} maxLength={500} multiline />
              <Eyebrow>{t('practice.due')}</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label={t('due.none')} active={due === null} onPress={() => setDue(null)} />
                {DUE_KINDS.map((k) => <Chip key={k} label={t(`due.${k}` as Key)} active={due === k} onPress={() => setDue(k)} />)}
              </View>
              {!consentGiven ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel={t('practice.consent')} />
                  <Txt size={13} color={colors.text2} style={{ flex: 1 }}>{t('practice.consent')}</Txt>
                </View>
              ) : null}
              {msg ? <Txt color={msg.ok ? colors.goldLight : colors.danger} accessibilityRole="alert" weight="bold">{msg.text}</Txt> : null}
              <Button label={t('practice.commit')} onPress={submit} loading={busy} disabled={!canCommit({ suggestionId: pick, text: own, consent, consentGiven })} />
              {d.mine.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <Eyebrow>{t('practice.mine')}</Eyebrow>
                  {d.mine.map((c) => (
                    <Panel key={c.id} style={{ gap: 4 }}>
                      <Txt weight="semibold">{c.text}</Txt>
                      <Txt size={12} color={colors.muted}>{t(`status.${c.status}` as Key)}{c.dueOn ? ` · ${c.dueOn}` : ''}</Txt>
                    </Panel>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
