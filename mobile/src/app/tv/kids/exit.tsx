// Sortie de l'espace Kids sur la télé : code parental (5 erreurs = blocage de 10 minutes côté serveur).
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { ApiError } from '@/lib/api';
import { KC, exitMessage, validPin } from '@/lib/kids';
import { Txt } from '@/components/ui';
import { Feather } from '@expo/vector-icons';
import { useTv } from '@/lib/tvTheme';
import { TvButton } from '@/components/tv/TvButton';
import { TvPinDots, TvPinPad } from '@/components/tv/TvPinPad';

export default function TvKidsExit() {
  const { t, dirStyle } = useSession();
  const { u } = useTv();
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
  const ok = validPin(code) && !locked && !busy;
  return (
    <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: u(200), backgroundColor: KC.bgBottom }, dirStyle]}>
      <View style={{ width: u(720), gap: u(28) }}>
        <View style={{ width: u(96), height: u(96), borderRadius: u(28), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,200,61,0.16)' }}>
          <Feather name="lock" size={u(48)} color={KC.accent} />
        </View>
        <Txt weight="extrabold" size={u(64)} color={KC.text} style={{ lineHeight: u(70) }}>{t('kdExitTitle')}</Txt>
        <Txt size={u(28)} color={KC.text2} style={{ lineHeight: u(42) }}>{t('kdExitHelp')}</Txt>
        <TvPinDots value={code} />
        {msg ? <Txt size={u(24)} color={KC.danger} accessibilityLiveRegion="polite">{msg}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: u(18), marginTop: u(8) }}>
          <TvButton label={t('kdOk')} icon="unlock" disabled={!ok} onPress={() => { void submit(); }} accent={KC.accent} onAccent={KC.onAccent} />
          <TvButton label={t('kdCancel')} onPress={() => router.back()} accent={KC.accent} onAccent={KC.onAccent} />
        </View>
      </View>
      <TvPinPad value={code} onChange={setCode} disabled={busy || locked} />
    </View>
  );
}
