// Compte : connexion, langue, état de l'abonnement. L'abonnement se prend et se gère uniquement sur le site.
import React from 'react';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
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

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 18 }}>
        <Title>{t('account.title')}</Title>

        {user ? (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
            <Txt weight="extrabold" size={18}>{user.name}</Txt>
            <Txt size={14} color={colors.muted}>{user.email}</Txt>
          </View>
        ) : (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 14 }}>
            <Txt color={colors.text2}>{t('account.guest')}</Txt>
            <Button label={t('account.signin')} onPress={() => router.push('/login')} />
          </View>
        )}

        {user ? (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('account.subscription')}</Txt>
            <Txt weight="bold" size={16} color={subscribed ? colors.goldLight : colors.text2}>
              {subscribed ? t('account.active') : t('account.inactive')}
            </Txt>
            <Button label={t('account.manage')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account`)} />
          </View>
        ) : null}

        {/* Étape M6 : parrainage et cartes cadeaux (l'achat se fait sur le site). */}
        {user && feat('referral') ? <ReferralBox /> : null}
        {user && feat('gifts') ? <GiftsBox /> : null}
        {/* Étape C-3 : achats et locations à l'unité (payés sur le site). */}
        {user && feat('sales') ? <PurchasesSection /> : null}

        {prayer.on || notif.data?.available.push ? (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('np.title')}</Txt>
            {notif.data?.available.push ? (
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
            {prayer.on ? <Button label={t('np.prayerSettings')} variant="dark" onPress={() => router.push('/prayer')} /> : null}
          </View>
        ) : null}

        <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
          <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('account.language')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(LOCALES) as Locale[]).map((l) => (
              <Chip key={l} label={LOCALES[l]} active={l === locale} onPress={() => setLocale(l)} />
            ))}
          </View>
        </View>

        {/* Thème : seulement si l'administrateur laisse chaque visiteur choisir (Admin → Paramètres) ; sinon c'est le sien. */}
        {skinChoice ? (
          <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
            <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('skin.title')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t('skin.site')} active={!skinPick} onPress={() => setSkinPick(null)} />
              <Chip label={t('skin.classique')} active={skinPick === 'classique'} onPress={() => setSkinPick('classique')} />
              <Chip label={t('skin.nuit')} active={skinPick === 'nuit'} onPress={() => setSkinPick('nuit')} />
            </View>
          </View>
        ) : null}

        <UpdateStatus />

        {user ? <Button label={t('account.data')} variant="dark" onPress={() => Linking.openURL(`${SITE_URL}/account?tab=data`)} /> : null}
        {user ? <Button label={t('account.logout')} variant="dark" onPress={() => { void logout(); }} /> : null}
        <Txt size={12} color={colors.muted} style={{ textAlign: 'center' }}>{t('account.version', { v: Constants.expoConfig?.version ?? '' })}</Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
