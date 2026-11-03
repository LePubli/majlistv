// Étape M4 — Bandeau « n validation(s) en attente » (comme le site, étape B5) : en haut de l'espace parent de Mejliss Kids.
// « Valider » ouvre la gestion du profil directement sur la bonne section (petites actions ou Ramadan).
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKidsPending } from '@/lib/kidsPending';
import { KC, avatarEmoji } from '@/lib/kids';
import { KButton, KTxt } from './KidUi';

export function KidsPendingBanner() {
  const { t } = useSession();
  const d = useKidsPending();
  if (!d || d.total <= 0) return null;
  return (
    <View accessibilityRole="summary" style={{ gap: 10, padding: 16, borderRadius: 24, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.accent }}>
      <KTxt weight="extrabold" size={18} accessibilityRole="header">{t('kpTitle', { n: d.total })}</KTxt>
      {d.profiles.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <KTxt size={26} style={{ lineHeight: 34 }}>{avatarEmoji(p.avatar)}</KTxt>
          <KTxt style={{ flex: 1 }}><KTxt weight="bold">{p.name}</KTxt> · {t('kpCount', { n: p.total })}</KTxt>
          <KButton label={t('kpGo')} onPress={() => router.push({ pathname: '/kids/parent', params: { open: p.id, sec: p.actions > 0 ? 'actions' : 'ramadan' } })} style={{ minHeight: 44, paddingHorizontal: 16 }} />
        </View>
      ))}
    </View>
  );
}
