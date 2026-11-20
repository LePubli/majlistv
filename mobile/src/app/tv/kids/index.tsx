// Mejliss Kids sur la télé : « Qui regarde ? ». Le parent (compte connecté sur la télé) choisit un profil ; l'application se verrouille
// alors sur l'espace enfant (sortie : code parental). Les profils et le code parental se créent sur le téléphone ou le site.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { KC, avatarEmoji, bandKey } from '@/lib/kids';
import type { KidsState } from '@/lib/types';
import { useTv } from '@/lib/tvTheme';
import { Loading, Txt } from '@/components/ui';
import { TvButton } from '@/components/tv/TvButton';
import { Focusable } from '@/components/tv/Focusable';

export default function TvKidsHub() {
  const { t, user, api, feat, dirStyle } = useSession();
  const { u } = useTv();
  const { kid, enter } = useKid();
  const st = useAsync(async () => (user && feat('kids') ? await api.get<KidsState>('/me/kids') : null), [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (kid) return <Redirect href="/tv/kids/home" />;
  const note = (text: string, login = false) => (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: u(200), gap: u(28) }}>
      <Txt weight="extrabold" size={u(64)} color={KC.accent}>Mejliss Kids</Txt>
      <Txt size={u(30)} color={KC.text2} style={{ lineHeight: u(44), maxWidth: u(1100) }}>{text}</Txt>
      <View style={{ flexDirection: 'row', gap: u(18) }}>
        {login ? <TvButton first label={t('tv.login')} icon="log-in" onPress={() => router.replace('/tv/account')} accent={KC.accent} onAccent={KC.onAccent} /> : null}
        <TvButton first={!login} label={t('tv.backToTv')} icon="arrow-left" onPress={() => router.replace('/tv')} accent={KC.accent} onAccent={KC.onAccent} />
      </View>
    </View>
  );
  const s = st.data;
  let body: React.ReactNode;
  if (!feat('kids')) body = note(t('kdUnavailable'));
  else if (!user) body = note(t('kdNeedLogin'), true);
  else if (st.loading && !s) body = <Loading />;
  else if (st.error || !s) body = note(st.error instanceof ApiError && st.error.status === 404 ? t('kdUnavailable') : t('common.error'));
  else if (!s.allowed) body = note(t('tv.kidsNeedSub'));
  else if (!s.hasPin || s.profiles.length === 0) body = note(t('tv.kidsSetup'));
  else {
    const go = async (id: string) => {
      setBusy(true); setMsg('');
      try { await enter(id); router.replace('/tv/kids/home'); } catch (e) { setMsg(e instanceof ApiError ? e.message : t('common.error')); } finally { setBusy(false); }
    };
    const tones = [KC.accent, '#2BD4B4', '#8B7CFF', '#FF6B6B', '#45A3FF'];
    body = (
      <View style={{ flex: 1, alignItems: 'center', paddingTop: u(200), gap: u(70) }}>
        <Txt weight="extrabold" size={u(72)} color={KC.text}>{t('kdWho')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: u(70), paddingHorizontal: u(96) }}>
          {s.profiles.map((p, i) => (
            <Focusable key={p.id} first={i === 0} ring={false} scale={1.08} radius={u(130)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${t('kids.enter')} ${p.name}`} onPress={() => { void go(p.id); }}>
              {(on) => (
                <View style={{ alignItems: 'center', gap: u(20), width: u(240) }}>
                  <View style={{ width: u(220), height: u(220), borderRadius: u(110), alignItems: 'center', justifyContent: 'center', backgroundColor: tones[i % tones.length], borderWidth: u(8), borderColor: on ? '#FFFFFF' : 'transparent' }}>
                    <Txt size={u(110)} style={{ lineHeight: u(130) }}>{avatarEmoji(p.avatar)}</Txt>
                  </View>
                  <Txt weight="extrabold" size={u(36)} color={on ? KC.text : KC.text2} numberOfLines={1}>{p.name}</Txt>
                  <Txt size={u(22)} color={KC.muted} style={{ marginTop: -u(10) }}>{t(bandKey(p.band))}</Txt>
                </View>
              )}
            </Focusable>
          ))}
        </View>
        {msg ? <Txt size={u(24)} color={KC.danger}>{msg}</Txt> : null}
      </View>
    );
  }
  return (
    <View style={[{ flex: 1, backgroundColor: KC.bg }, dirStyle]}>
      <LinearGradient pointerEvents="none" colors={[KC.bgTop, KC.bg, KC.bgBottom]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      <View style={{ position: 'absolute', top: u(54), start: u(96), flexDirection: 'row', alignItems: 'center', gap: u(14) }}>
        <Image source={require('../../../../assets/brand/emblem-bleu.png')} style={{ width: u(46), height: u(50) }} contentFit="contain" />
        <Txt weight="extrabold" size={u(34)} color={KC.accent}>Mejliss Kids</Txt>
      </View>
      {body}
      {s && s.allowed && s.hasPin && s.profiles.length > 0 ? (
        <View style={{ position: 'absolute', bottom: u(54), start: u(96), end: u(96), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u(30) }}>
          <TvButton label={t('tv.backToTv')} icon="arrow-left" onPress={() => router.replace('/tv')} accent={KC.accent} onAccent={KC.onAccent} />
          <Txt size={u(20)} color={KC.muted} style={{ flex: 1, textAlign: 'right', lineHeight: u(28) }}>{t('tv.kidsManage')}</Txt>
        </View>
      ) : null}
    </View>
  );
}
