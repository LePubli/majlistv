// Mejliss Kids sur la télé : « Qui regarde ? ». Le parent (compte connecté sur la télé) choisit un profil ; l'application se verrouille
// alors sur l'espace enfant (sortie : code parental). Les profils et le code parental se créent sur le téléphone ou le site.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { KC, avatarEmoji, bandKey } from '@/lib/kids';
import type { KidsState } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { Focusable } from '@/components/tv/Focusable';

export default function TvKidsHub() {
  const { t, user, api, feat } = useSession();
  const { kid, enter } = useKid();
  const st = useAsync(async () => (user && feat('kids') ? await api.get<KidsState>('/me/kids') : null), [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (kid) return <Redirect href="/tv/kids/home" />;
  const note = (text: string, login = false) => (
    <View style={{ padding: 40, gap: 18, maxWidth: 720 }}>
      <Txt weight="extrabold" size={26}>Mejliss Kids</Txt>
      <Txt size={18} color={colors.text2} style={{ lineHeight: 26 }}>{text}</Txt>
      {login ? (
        <Focusable first accessibilityRole="button" radius={999} onPress={() => router.replace('/tv/account')} style={{ alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 24, backgroundColor: colors.gold }}>
          <Txt weight="extrabold" size={18} color="#111">{t('tv.login')}</Txt>
        </Focusable>
      ) : null}
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
    body = (
      <ScrollView contentContainerStyle={{ padding: 40, gap: 24 }}>
        <Txt weight="extrabold" size={28}>{t('kdWho')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
          {s.profiles.map((p, i) => (
            <Focusable key={p.id} first={i === 0} radius={28} disabled={busy} accessibilityRole="button" accessibilityLabel={`${t('kids.enter')} ${p.name}`} onPress={() => { void go(p.id); }}
              style={{ width: 190, alignItems: 'center', gap: 8, paddingVertical: 22, backgroundColor: KC.surface }}>
              <Txt size={64} style={{ lineHeight: 78 }}>{avatarEmoji(p.avatar)}</Txt>
              <Txt weight="extrabold" size={19} color={KC.text} numberOfLines={1}>{p.name}</Txt>
              <Txt size={13} color={KC.muted}>{t(bandKey(p.band))}</Txt>
            </Focusable>
          ))}
        </View>
        {msg ? <Txt color={KC.danger}>{msg}</Txt> : null}
        <Txt size={14} color={colors.text2}>{t('tv.kidsManage')}</Txt>
      </ScrollView>
    );
  }
  return <TvShell>{body}</TvShell>;
}
