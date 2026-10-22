// Sortie de l'espace enfant : le code parental est exigé (5 erreurs = blocage de 10 minutes côté serveur).
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { ApiError } from '@/lib/api';
import { KC, exitMessage, validPin } from '@/lib/kids';
import { KButton, KScreen, KTxt, PinPad } from '@/components/kids/KidUi';

export default function KidsExit() {
  const { t } = useSession();
  const { exit } = useKid();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  async function submit() {
    if (!validPin(code)) return;
    setBusy(true); setMsg('');
    try {
      await exit(code);
      router.replace('/');
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setLocked(err?.code === 'locked');
      setMsg(exitMessage(err ? { status: err.status, code: err.code, data: err.data, message: err.message } : { status: 0 }, t));
      setCode('');
    } finally { setBusy(false); }
  }

  return (
    <KScreen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 }}>
        <KTxt size={44} style={{ lineHeight: 54 }}>🔒</KTxt>
        <KTxt weight="extrabold" size={24} accessibilityRole="header">{t('kdExitTitle')}</KTxt>
        <KTxt color={KC.text2} style={{ textAlign: 'center' }}>{t('kdExitHelp')}</KTxt>
        <PinPad value={code} onChange={setCode} disabled={busy || locked} />
        {msg ? <KTxt color={KC.danger} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{msg}</KTxt> : null}
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <KButton label={t('kdOk')} disabled={!validPin(code) || locked} loading={busy} onPress={submit} />
          <KButton label={t('kdCancel')} variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    </KScreen>
  );
}
