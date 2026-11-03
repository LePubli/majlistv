// Espace parents de Mejliss Kids dans l'application : rapport de progression, gestion de chaque profil (temps, catalogue, petites actions,
// modification), changement du code parental. Écran du parent connecté ; si un enfant est dans l'espace, retour à son accueil.
import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { KC } from '@/lib/kids';
import type { KidsState } from '@/lib/types';
import { KButton, KScreen, KTxt } from '@/components/kids/KidUi';
import { ParentProfile, type Section } from '@/components/kids/parent/ParentProfile';
import { KidsPendingBanner } from '@/components/kids/KidsPendingBanner';
import { ParentReport } from '@/components/kids/parent/ParentReport';
import { ParentPin } from '@/components/kids/parent/ParentPin';

export default function KidsParent() {
  const { t, user, api, isRTL, ready } = useSession();
  const { kid } = useKid();
  // ?open=<profil>&sec=actions|ramadan : arrivée depuis « Valider » du bandeau des validations en attente.
  const params = useLocalSearchParams<{ open?: string; sec?: string }>();
  const sec: Section | null = params.sec === 'actions' || params.sec === 'ramadan' ? params.sec : null;
  const [pendingEmail, setPendingEmail] = useState<boolean | null>(null);
  const state = useAsync(async () => (user ? await api.get<KidsState>('/me/kids') : null), [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (kid) return <Redirect href="/kids/home" />;
  if (ready && !user) return <Redirect href="/kids" />;
  const s = state.data;
  return (
    <KScreen>
      <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/kids'))}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={KC.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: 18, padding: 20, paddingBottom: 56 }}>
        <KTxt weight="extrabold" size={26} accessibilityRole="header">{t('kdManage')}</KTxt>
        {state.loading && !s ? <KTxt color={KC.text2}>…</KTxt> : null}
        {state.error && !s ? <View style={{ gap: 12 }}><KTxt color={KC.text2}>{t('common.error')}</KTxt><KButton label={t('common.retry')} variant="soft" onPress={state.reload} /></View> : null}
        {s ? (
          <>
            <KTxt size={13} color={KC.muted}>{t('kdProfiles')} ({s.profiles.length}/{s.max})</KTxt>
            {s.profiles.length === 0 ? <KTxt color={KC.text2}>{t('kdNoProfile')}</KTxt> : null}
            <KidsPendingBanner />
            {s.profiles.map((p) => <ParentProfile key={`${p.id}:${p.name}:${p.avatar}:${p.band}`} profile={p} onChanged={state.reload} initial={params.open === p.id ? sec : null} />)}
            {/* E-mail quotidien « un enfant attend votre validation » (étape B5). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
              <KTxt size={14} style={{ flex: 1 }}>{t('kpEmail')}</KTxt>
              <Switch accessibilityLabel={t('kpEmail')} value={pendingEmail ?? s.pendingEmail !== false}
                onValueChange={(v) => { setPendingEmail(v); void api.put('/me/kids/pending-prefs', { email: v }).catch(() => setPendingEmail(!v)); }} />
            </View>
            {s.profiles.length > 0 ? <ParentReport /> : null}
            {s.hasPin ? <ParentPin /> : null}
          </>
        ) : null}
      </ScrollView>
    </KScreen>
  );
}
