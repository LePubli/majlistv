// Étape M6 — Premiers pas d'un nouveau membre (comme le site, étape B2).
//  - <StartCards />  « Par quoi commencer ? » en haut de l'accueil, UNE seule fois (nouveau compte) : 3 cartes selon les fonctions
//                    activées, « Faire la visite guidée », « Plus tard ». Le choix est enregistré (PUT /me/onboarding).
//  - <TourModal />   visite guidée : une étape par rubrique (où la trouver dans l'application, bouton pour l'ouvrir).
//                    Relançable depuis le menu ☰ (« Visite guidée ») ou par /?tour=1. Fonction « onboarding » coupée : rien.
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { showStart, startCards, tourSteps } from '@/lib/onboarding';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from './ui';

export function StartCards({ onTour }: { onTour: () => void }) {
  const { t, user, feat, api, patchUser, isRTL } = useSession();
  const cards = useMemo(() => startCards(feat), [feat]);
  if (!showStart(user, feat)) return null;
  const done = () => { patchUser({ onboarded: true }); void api.put('/me/onboarding', { done: true }).catch(() => {}); };
  return (
    <View accessibilityLabel={t('obAria')} style={{ marginHorizontal: 16, padding: 16, gap: 12, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold }}>
      <Txt weight="extrabold" size={20} accessibilityRole="header">{t('obTitle')}</Txt>
      <Txt size={14} color={colors.text2}>{t('obIntro')}</Txt>
      {cards.map((c) => (
        <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={`${t(c.title)}. ${t(c.text)}`} onPress={() => { done(); router.push(c.route as never); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine }}>
            <Feather name={c.icon as never} size={18} color={colors.goldLight} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="bold" size={15}>{t(c.title)}</Txt>
            <Txt size={13} color={colors.muted}>{t(c.text)}</Txt>
            {c.badge ? <Txt size={11} weight="bold" color={colors.goldLight}>{t(c.badge)}</Txt> : null}
          </View>
          <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.muted} />
        </Pressable>
      ))}
      <Button label={t('obTourBtn')} onPress={() => { done(); onTour(); }} />
      <Pressable accessibilityRole="button" onPress={done} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
        <Txt weight="bold" size={14} color={colors.muted}>{t('obLater')}</Txt>
      </Pressable>
    </View>
  );
}

export function TourModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, feat, dirStyle } = useSession();
  const steps = useMemo(() => tourSteps(feat), [feat]);
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const close = () => { setI(0); onClose(); };
  if (!step) return null;
  const last = i >= steps.length - 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[{ flex: 1, justifyContent: 'flex-end', padding: 16, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.6)' }, dirStyle]}>
        <View accessibilityViewIsModal accessibilityLabel={t('tourAria')} style={{ gap: 12, padding: 18, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine }}>
              <Feather name={step.icon as never} size={22} color={colors.goldLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={12} color={colors.muted} style={{ writingDirection: 'ltr' }}>{t('tourOf', { i: i + 1, n: steps.length })}</Txt>
              <Txt weight="extrabold" size={19} accessibilityRole="header">{t(step.title)}</Txt>
            </View>
          </View>
          <Txt size={15} color={colors.text2}>{t(step.text)}</Txt>
          {/* Progression : un point par étape. */}
          <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
            {steps.map((s, k) => <View key={s.id} style={{ width: k === i ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? colors.gold : colors.borderStrong }} />)}
          </View>
          {step.route ? <Button label={t('rzOpen')} variant="dark" onPress={() => { close(); router.push(step.route as never); }} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {i > 0 ? <Button label={t('tourPrev')} variant="dark" onPress={() => setI(i - 1)} style={{ flex: 1 }} /> : null}
            <Button label={last ? t('tourEnd') : t('tourNext')} onPress={() => (last ? close() : setI(i + 1))} style={{ flex: 1 }} />
          </View>
          <Pressable accessibilityRole="button" onPress={close} style={{ alignSelf: 'center', minHeight: 40, justifyContent: 'center' }}>
            <Txt weight="bold" size={13} color={colors.muted}>{t('tourSkip')}</Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
