// Compte : connexion, langue, état de l'abonnement. L'abonnement se prend et se gère uniquement sur le site.
// Étape N7 (16/11), comme le site (N5) : 3 onglets pour un membre — Profil (langue, thème, mes données, lien vers les réglages
// de la prière, déconnexion) · Abonnement et achats (abonnement, achats, cartes cadeaux, parrainage) · Notifications.
import React, { useState } from 'react';
import { Linking, ScrollView, Switch, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { LOCALES, Locale } from '@/lib/i18n';
import { SITE_URL } from '@/lib/config';
import type { BillingStatus } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button, Chip, Txt, screenStyle, Title } from '@/components/ui';
import { usePrayer } from '@/lib/prayerStore';
import { UpdateStatus } from '@/components/UpdateStatus';
import { GiftsBox, ReferralBox } from '@/components/account/ReferralGifts';
import { PurchasesSection } from '@/components/SaleCard';
import { accTabOf, type AccTab } from '@/lib/mylist';

export default function AccountScreen() {
  const { user, api, t, locale, setLocale, logout, dirStyle, skinChoice, skinPick, setSkinPick, feat } = useSession();
  const prayer = usePrayer();
  // Notifications du serveur (nouvelles vidéos des intervenants suivis, sélection de la semaine, révision) : interrupteur du compte.
  const notif = useAsync(async () => (user ? await api.get<{ prefs: { push: boolean }; available: { push: boolean } }>('/me/notifications').catch(() => null) : null), [user?.id]);
  const [pushOn, setPushOn] = React.useState<boolean | null>(null);
  const pushValue = pushOn ?? notif.data?.prefs.push ?? true;
  const billing = useAsync(async () => (user ? await api.get<BillingStatus>('/billing/status').catch(() => null) : null), [user?.id]);
  // Abonnement pris sur le site (navigateur) : relu à chaque ouverture de cet écran et au retour dans l'application,
  // sinon le compte restait « sans abonnement » jusqu'au redémarrage de l'application.
  const reloadBilling = billing.reload;
  useFocusEffect(React.useCallback(() => { if (user) void reloadBilling(); }, [user, reloadBilling]));
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && user) void reloadBilling(); });
    return () => sub.remove();
  }, [user, reloadBilling]);
  const subscribed = Boolean(billing.data?.active || billing.data?.learning);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<AccTab>(() => accTabOf(params.tab));
  React.useEffect(() => { if (params.tab) setTab(accTabOf(params.tab)); }, [params.tab]);
  const notifOn = Boolean(notif.data?.available.push);
  const card = { padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border } as const;
  const show = (k: AccTab) => !user || tab === k; // visiteur : pas d'onglets, seulement le profil

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 18 }}>
        <Title>{t('account.title')}</Title>

        {user ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
            <Chip label={t('tbProfile')} active={tab === 'profile'} onPress={() => setTab('profile')} />
            <Chip label={t('acTabBilling')} active={tab === 'billing'} onPress={() => setTab('billing')} />
            <Chip label={t('msNotif')} active={tab === 'notifs'} onPress={() => setTab('notifs')} />
          </ScrollView>
        ) : null}

        {/* ---------- Profil ---------- */}
        {show('profile') ? (user ? (
          <View style={[card, { gap: 4 }]}>
            <Txt weight="extrabold" size={18}>{user.name}</Txt>
            <Txt size={14} color={colors.muted}>{user.email}</Txt>
          </View>
        ) : (
          <View style={[card, { gap: 14 }]}>
            <Txt color={colors.text2}>{t('account.guest')}</Txt>
            <Button label={t('account.signin')} onPress={() => router.push('/login')} />
          </View>
        )) : null}

        {show('profile') ? (
          <View style={[card, { gap: 12 }]}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('account.language')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(LOCALES) as Locale[]).map((l) => (
                <Chip key={l} label={LOCALES[l]} active={l === locale} onPress={() => setLocale(l)} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Thème : seulement si l'administrateur laisse chaque visiteur choisir (Admin → Paramètres) ; sinon c'est le sien. */}
        {show('profile') && skinChoice ? (
          <View style={[card, { gap: 12 }]}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('skin.title')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t('skin.site')} active={!skinPick} onPress={() => setSkinPick(null)} />
              <Chip label={t('skin.classique')} active={skinPick === 'classique'} onPress={() => setSkinPick('classique')} />
              <Chip label={t('skin.nuit')} active={skinPick === 'nuit'} onPress={() => setSkinPick('nuit')} />
            </View>
          </View>
        ) : null}

        {/* Les réglages de la prière sont dans Pratique → Prière (comme le site) ; un lien reste ici. */}
        {show('profile') && prayer.on ? <Button label={t('np.prayerSettings')} variant="dark" onPress={() => router.push('/prayer')} /> : null}

        {/* ---------- Abonnement et achats ---------- */}
        {user && tab === 'billing' ? (
          <View style={[card, { gap: 10 }]}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('account.subscription')}</Txt>
            <Txt weight="bold" size={16} color={subscribed ? colors.goldLight : colors.text2}>
              {subscribed ? t('account.active') : t('account.inactive')}
            </Txt>
            <Button label={t('account.manage')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account?tab=billing`)} />
          </View>
        ) : null}
        {/* Étape C-3 : achats et locations à l'unité (payés sur le site). Étape M6 : cartes cadeaux et parrainage. */}
        {user && tab === 'billing' && feat('sales') ? <PurchasesSection /> : null}
        {user && tab === 'billing' && feat('gifts') ? <GiftsBox /> : null}
        {user && tab === 'billing' && feat('referral') ? <ReferralBox /> : null}

        {/* ---------- Notifications ---------- */}
        {user && tab === 'notifs' ? (
          <View style={[card, { gap: 12 }]}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('np.title')}</Txt>
            {notifOn ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="bold">{t('np.push')}</Txt>
                  <Txt size={12} color={colors.muted}>{t('np.pushHelp')}</Txt>
                </View>
                <Switch value={pushValue} accessibilityLabel={t('np.push')} trackColor={{ false: colors.border, true: colors.goldLine }} thumbColor={pushValue ? colors.gold : colors.muted}
                  onValueChange={(v) => { setPushOn(v); api.put('/me/notifications', { push: v }).catch(() => setPushOn(!v)); }} />
              </View>
            ) : null}
            {prayer.on ? <Txt size={13} color={colors.text2}>{t('np.prayerHelp')}</Txt> : null}
            <Button label={t('nfTitle')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account?tab=notifs`)} />
          </View>
        ) : null}

        {show('profile') ? <UpdateStatus /> : null}

        {user && tab === 'profile' ? <Button label={t('account.data')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account?tab=profile&s=data`)} /> : null}
        {user && tab === 'profile' ? <Button label={t('account.logout')} variant="dark" onPress={() => { void logout(); }} /> : null}
        {/* Étape D : pages légales (sur le site, dans la langue de l'application). */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }} accessibilityRole="menu">
          {([['mentions-legales', 'legal.notice'], ['cgv', 'legal.terms'], ['confidentialite', 'legal.privacy']] as const).map(([slug, key]) => (
            <Pressable key={slug} accessibilityRole="link" onPress={() => { void Linking.openURL(`${SITE_URL}/legal/${slug}`); }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
              <Txt size={13} color={colors.text2} style={{ textDecorationLine: 'underline' }}>{t(key)}</Txt>
            </Pressable>
          ))}
        </View>
        <Txt size={12} color={colors.muted} style={{ textAlign: 'center' }}>{t('account.version', { v: Constants.expoConfig?.version ?? '' })}</Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
