// Étape M4 — Bilan de Ramadan (comme le site, étape 45G) : à partir du 20e jour et jusqu'à 60 jours après la fin.
// Chiffres personnels, jamais comparés, et une note personnelle chiffrée « ce que je garde après Ramadan ».
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { bilanCards, type Bilan } from '@/lib/ramadan';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, Txt } from './ui';

export function RamadanBilan({ ended = false }: { ended?: boolean }) {
  const { api, user, t, feat, isRTL } = useSession();
  const [b, setB] = useState<Bilan | undefined>(undefined);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!user) { setB(null); return; }
    api.get<{ bilan: Bilan }>('/ramadan/bilan').then((r) => { setB(r.bilan); setNote(r.bilan?.note || ''); }).catch(() => setB(null));
  }, [api, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!b) return null;

  async function save() {
    setMsg(''); setErr(''); setBusy(true);
    try { await api.put('/ramadan/bilan/note', { text: note }); setMsg(t('rbSaved')); } catch (e) { setErr(e instanceof ApiError ? e.message : t('errGeneric')); } finally { setBusy(false); }
  }
  const cards = bilanCards(b, t, feat);
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold }}>
      {ended ? <Txt weight="bold" size={14} color={colors.goldLight} accessibilityRole="summary">{t('rbEnded', { y: b.hyear })}</Txt> : null}
      <Txt weight="extrabold" size={19} accessibilityRole="header">{t('rbTitle', { y: b.hyear })}</Txt>
      <Txt size={13} color={colors.muted}>{t('rbIntro')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {cards.map((c) => (
          <View key={c.label} accessibilityLabel={`${c.value} ${c.label}`} style={{ flexGrow: 1, flexBasis: '45%', padding: 12, gap: 4, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft }}>
            <Text style={{ fontSize: 20 }} importantForAccessibility="no">{c.icon}</Text>
            <Txt weight="extrabold" size={20} color={colors.goldLight} style={{ writingDirection: 'ltr', textAlign: isRTL ? 'right' : 'left' }}>{c.value}</Txt>
            <Txt size={12} color={colors.text2}>{c.label}</Txt>
          </View>
        ))}
      </View>
      {b.tarawih.mosque > 0 || b.tarawih.home > 0 ? <Txt size={13} color={colors.muted}>{t('rbPlaces', { m: b.tarawih.mosque, h: b.tarawih.home })}</Txt> : null}
      <Txt weight="bold" size={14}>{t('rbNote')}</Txt>
      <TextInput value={note} onChangeText={setNote} multiline maxLength={4000} placeholder={t('rbNoteHint')} placeholderTextColor={colors.muted} accessibilityLabel={t('rbNote')}
        style={{ minHeight: 100, padding: 12, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, color: colors.text, fontFamily: fonts.medium, fontSize: 15, textAlignVertical: 'top', textAlign: isRTL ? 'right' : 'left' }} />
      <Txt size={12} color={colors.muted}>{t('rbPrivate')}</Txt>
      {msg ? <Txt size={13} color={colors.ok} accessibilityRole="alert">✓ {msg}</Txt> : null}
      {err ? <Txt size={13} color={colors.danger} accessibilityRole="alert">{err}</Txt> : null}
      <Button label={t('rbSave')} loading={busy} onPress={() => { void save(); }} />
    </View>
  );
}
