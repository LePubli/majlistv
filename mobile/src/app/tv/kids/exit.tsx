// Sortie de l'espace Kids sur la télé : code parental (5 erreurs = blocage de 10 minutes côté serveur).
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { ApiError } from '@/lib/api';
import { KC, exitMessage, validPin } from '@/lib/kids';
import { Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';
import { TvPinPad } from '@/components/tv/TvPinPad';

export default function TvKidsExit() {
  const { t } = useSession();
  const { exit } = useKid();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const submit = async () => {
    if (!validPin(code)) return;
    setBusy(true); setMsg('');
    try { await exit(code); router.replace('/tv'); } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setLocked(err?.code === 'locked');
      setMsg(exitMessage(err ? { status: err.status, code: err.code, data: err.data, message: err.message } : { status: 0 }, t));
      setCode('');
    } finally { setBusy(false); }
  };
  const btn = { paddingVertical: 12, paddingHorizontal: 26, backgroundColor: KC.surface } as const;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 56, padding: 32, backgroundColor: KC.bg }}>
      <View style={{ maxWidth: 380, gap: 14 }}>
        <Txt size={48} style={{ lineHeight: 58 }}>🔒</Txt>
        <Txt weight="extrabold" size={26} color={KC.text}>{t('kdExitTitle')}</Txt>
        <Txt size={16} color={KC.text2}>{t('kdExitHelp')}</Txt>
        {msg ? <Txt color={KC.danger} accessibilityLiveRegion="polite">{msg}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          <Focusable accessibilityRole="button" radius={999} disabled={!validPin(code) || locked || busy} onPress={() => { void submit(); }}
            style={[btn, { backgroundColor: validPin(code) && !locked ? KC.accent : KC.surface }]}>
            <Txt weight="extrabold" size={17} color={validPin(code) && !locked ? KC.onAccent : KC.muted}>{t('kdOk')}</Txt>
          </Focusable>
          <Focusable accessibilityRole="button" radius={999} onPress={() => router.back()} style={btn}>
            <Txt weight="bold" size={17} color={KC.text}>{t('kdCancel')}</Txt>
          </Focusable>
        </View>
      </View>
      <TvPinPad value={code} onChange={setCode} disabled={busy || locked} />
    </View>
  );
}
