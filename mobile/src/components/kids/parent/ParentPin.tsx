// Changer le code parental : l'ancien code est exigé (le serveur bloque 10 min après 5 erreurs).
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { KC, pinChangeError } from '@/lib/kids';
import { Field } from '@/components/ui';
import { KButton, KTxt } from '@/components/kids/KidUi';

const fieldStyle = { backgroundColor: KC.surface2, borderColor: KC.line, borderWidth: 2, borderRadius: 18 };

export function ParentPin() {
  const { t, api } = useSession();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  const save = async () => {
    const bad = pinChangeError(cur, next, again);
    if (bad) { setMsg({ text: t(bad as never), ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.put('/me/kids/pin', { code: next, current: cur });
      setCur(''); setNext(''); setAgain(''); setMsg({ text: t('kdPinSaved'), ok: true });
    } catch (e) {
      setMsg({ text: e instanceof ApiError && e.code === 'bad_pin' ? t('kdPinBad') : e instanceof ApiError ? e.message : t('common.error'), ok: false });
    } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 22, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
      <KTxt weight="extrabold" size={18} accessibilityRole="header">🔒 {t('kdPinTitle')}</KTxt>
      <Field label={t('kdPinCur')} value={cur} onChangeText={(v) => setCur(digits(v))} keyboardType="number-pad" secureTextEntry maxLength={6} style={fieldStyle} />
      <Field label={t('kdPinNew')} value={next} onChangeText={(v) => setNext(digits(v))} keyboardType="number-pad" secureTextEntry maxLength={6} style={fieldStyle} />
      <Field label={t('kids.pinConfirm')} value={again} onChangeText={(v) => setAgain(digits(v))} keyboardType="number-pad" secureTextEntry maxLength={6} style={fieldStyle} />
      {msg ? <KTxt color={msg.ok ? KC.ok : KC.danger} accessibilityRole="alert">{msg.text}</KTxt> : null}
      <KButton label={t('kdPinSave')} disabled={!cur || !next || !again} loading={busy} onPress={() => void save()} />
    </View>
  );
}
