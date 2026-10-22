// Espace parent de Mejliss Kids : choix du profil (« Qui regarde ? »), création des profils, code parental.
// Écran du parent (jeton normal) ; « Entrer » ouvre l'espace enfant (jeton enfant de 12 h) et verrouille l'application dessus.
import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { AVATARS, BANDS, KC, avatarEmoji, bandKey, validPin } from '@/lib/kids';
import type { KidsState } from '@/lib/types';
import { Field } from '@/components/ui';
import { KButton, KChip, KScreen, KTxt, PinPad } from '@/components/kids/KidUi';

function Back() {
  const { t, isRTL } = useSession();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
      <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={KC.text} />
    </Pressable>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28 }}>{children}</View>;

export default function KidsHub() {
  const { t, user, api, feat, ready } = useSession();
  const { kid, enter } = useKid();
  const state = useAsync(async () => (user && feat('kids') ? await api.get<KidsState>('/me/kids') : null), [user?.id, feat('kids')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>('lion');
  const [band, setBand] = useState<string>('7-10');
  const [pin, setPin] = useState('');
  const [pin1, setPin1] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (kid) return <Redirect href="/kids/home" />;
  const frame = (body: React.ReactNode) => <KScreen><View style={{ paddingHorizontal: 18, paddingTop: 8 }}><Back /></View>{body}</KScreen>;
  if (!ready || (user && state.loading && !state.data && !state.error)) return frame(<Centered><KTxt>…</KTxt></Centered>);
  if (!feat('kids')) return frame(<Centered><KTxt weight="bold" style={{ textAlign: 'center' }}>{t('kdUnavailable')}</KTxt></Centered>);
  if (!user) {
    return frame(<Centered><KTxt weight="extrabold" size={22}>{t('kdTitle')}</KTxt><KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdNeedLogin')}</KTxt>
      <KButton label={t('login')} onPress={() => router.push('/login')} /></Centered>);
  }
  const s = state.data;
  if (state.error || !s) {
    const off = state.error instanceof ApiError && state.error.status === 404;
    return frame(<Centered><KTxt style={{ textAlign: 'center' }}>{off ? t('kdUnavailable') : t('common.error')}</KTxt>{off ? null : <KButton label={t('common.retry')} variant="soft" onPress={state.reload} />}</Centered>);
  }
  if (!s.allowed) {
    return frame(<Centered><KTxt weight="extrabold" size={22}>{t('kdTitle')}</KTxt><KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdNeedSub')}</KTxt>
      <KButton label={t('kids.subscribe')} onPress={() => { void Linking.openURL(`${SITE_URL}/pricing`); }} /></Centered>);
  }

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'duplicate') setMsg(t('kdDuplicate'));
    else if (e instanceof ApiError && e.code === 'limit') setMsg(t('kdLimitReached', { n: s.max, s: s.max > 1 ? 's' : '' }) + ' ' + t('kdLimitUpgrade'));
    else if (e instanceof ApiError && e.code === 'pin_required') setMsg(t('kdPinFirst'));
    else setMsg(e instanceof ApiError ? e.message : t('common.error'));
  };

  // 1) Pas encore de code parental : on le crée (saisi deux fois) avant tout.
  if (!s.hasPin) {
    const first = pin1 === null;
    const submit = async () => {
      setMsg('');
      if (first) { if (!validPin(pin)) return; setPin1(pin); setPin(''); return; }
      if (pin !== pin1) { setMsg(t('kids.pinMismatch')); setPin(''); setPin1(null); return; }
      setBusy(true);
      try { await api.put('/me/kids/pin', { code: pin }); setPin(''); setPin1(null); state.reload(); } catch (e) { fail(e); } finally { setBusy(false); }
    };
    return frame(
      <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 16, padding: 24 }}>
        <KTxt weight="extrabold" size={22}>{t('kdPinTitle')}</KTxt>
        <KTxt style={{ textAlign: 'center' }} color={KC.text2}>{t('kdPinFirst')}</KTxt>
        <KTxt weight="bold" color={KC.accent}>{first ? t('kdPinNew') : t('kids.pinConfirm')}</KTxt>
        <PinPad value={pin} onChange={setPin} disabled={busy} />
        {msg ? <KTxt color={KC.danger} style={{ textAlign: 'center' }}>{msg}</KTxt> : null}
        <KButton label={first ? t('kdOk') : t('kdPinSave')} disabled={!validPin(pin) || busy} loading={busy} onPress={submit} />
      </ScrollView>,
    );
  }

  const go = async (id: string) => {
    setBusy(true); setMsg('');
    try { await enter(id); router.replace('/kids/home'); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setMsg('');
    try { await api.post('/me/kids/profiles', { name: name.trim(), avatar, band }); setName(''); setAdding(false); state.reload(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const remove = (id: string, n: string) => Alert.alert(t('kdProfiles'), t('kdDeleteConfirm', { name: n }), [
    { text: t('kdCancel'), style: 'cancel' },
    { text: t('kids.delete'), style: 'destructive', onPress: () => { void api.del(`/me/kids/profiles/${id}`).then(state.reload).catch(fail); } },
  ]);

  return frame(
    <ScrollView contentContainerStyle={{ gap: 18, padding: 20, paddingBottom: 48 }}>
      <KTxt weight="extrabold" size={26} accessibilityRole="header">{t('kdWho')}</KTxt>
      {s.profiles.length === 0 && !adding ? <KTxt color={KC.text2}>{t('kdNoProfile')}</KTxt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {s.profiles.map((p) => (
          <View key={p.id} style={{ width: '47%' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('kids.enter')} ${p.name}`} disabled={busy} onPress={() => { void go(p.id); }}
              style={({ pressed }) => ({ alignItems: 'center', gap: 8, padding: 18, borderRadius: 24, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line, opacity: pressed ? 0.85 : 1 })}>
              <KTxt size={56} style={{ lineHeight: 68 }}>{avatarEmoji(p.avatar)}</KTxt>
              <KTxt weight="extrabold" size={18} numberOfLines={1}>{p.name}</KTxt>
              <KTxt size={12} color={KC.muted}>{t(bandKey(p.band))}</KTxt>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('kids.delete')} ${p.name}`} hitSlop={8} onPress={() => remove(p.id, p.name)} style={{ alignSelf: 'center', paddingVertical: 8 }}>
              <KTxt size={12} color={KC.muted}>{t('kids.delete')}</KTxt>
            </Pressable>
          </View>
        ))}
      </View>
      {msg ? <KTxt color={KC.danger}>{msg}</KTxt> : null}
      {!adding ? (
        s.profiles.length < s.max ? <KButton label={`+ ${t('kdAdd')}`} variant="soft" onPress={() => { setAdding(true); setMsg(''); }} /> : <KTxt size={13} color={KC.muted}>{t('kdLimitReached', { n: s.max, s: s.max > 1 ? 's' : '' })} {t('kdLimitUpgrade')}</KTxt>
      ) : (
        <View style={{ gap: 12, padding: 16, borderRadius: 24, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
          <Field label={t('kdName')} value={name} onChangeText={setName} maxLength={30} style={{ backgroundColor: KC.surface2, borderColor: KC.line, borderWidth: 2, borderRadius: 18 }} />
          <KTxt weight="bold" size={13} color={KC.text2}>{t('kdAvatar')}</KTxt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {AVATARS.map((a) => (
              <Pressable key={a} accessibilityRole="button" accessibilityState={{ selected: avatar === a }} accessibilityLabel={a} onPress={() => setAvatar(a)}
                style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: avatar === a ? KC.accent : KC.surface2, borderWidth: 2, borderColor: avatar === a ? KC.accent : KC.line }}>
                <KTxt size={26} style={{ lineHeight: 32 }}>{avatarEmoji(a)}</KTxt>
              </Pressable>
            ))}
          </View>
          <KTxt weight="bold" size={13} color={KC.text2}>{t('kdBand')}</KTxt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{BANDS.map((b) => <KChip key={b} label={t(bandKey(b))} active={band === b} onPress={() => setBand(b)} />)}</View>
          <KTxt size={12} color={KC.muted}>{t('kdBandsHelp')}</KTxt>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <KButton label={t('kdCreate')} disabled={!name.trim() || busy} loading={busy} onPress={create} />
            <KButton label={t('kdCancel')} variant="ghost" onPress={() => setAdding(false)} />
          </View>
        </View>
      )}
      <KTxt size={12} color={KC.muted}>{t('kdPinHelp')}</KTxt>
    </ScrollView>,
  );
}
