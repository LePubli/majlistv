// Animation du logo au lancement (étape 26, piste « Cinéma »). Se joue une fois par lancement, jamais pour un enfant (Kids garde son univers),
// sans son, un appui la passe. Mouvements réduits : logo fixe puis fondu. Ensuite : publicité éventuelle, puis l'application.
// Le logo est affiché à la taille et à la place de l'écran de démarrage d'Android (même fond) : aucun saut au moment du relais.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { PLAN, PUSH_SCALE, REDUCED_PLAN, SKIP_FADE_MS, SPLASH_SIZE, MAX_MS, ZOOM_SCALE } from '@/lib/intro';
import { endIntro, introOver } from '@/lib/launch';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';

const BG = '#0B0906';
const EMBLEM = require('../../assets/splash-icon.png');
const OUTLINE = require('../../assets/brand/intro-outline.png');
const GLOW = require('../../assets/brand/intro-glow.png');
const WORDMARK = require('../../assets/brand/wordmark.png');

let played = false; // une seule fois par lancement de l'application

const tm = (v: Animated.Value, to: number, at: number, dur: number, easing = Easing.out(Easing.cubic)) =>
  Animated.timing(v, { toValue: to, delay: at, duration: dur, easing, useNativeDriver: true });

export function LogoIntro() {
  const { t, dirStyle } = useSession();
  const { kid } = useKid();
  const [show, setShow] = useState(() => !played && !introOver());
  const [reduced, setReduced] = useState<boolean | null>(null);
  const v = useMemo(() => ({
    cover: new Animated.Value(1), push: new Animated.Value(0), fill: new Animated.Value(0), glow: new Animated.Value(0), outline: new Animated.Value(1),
    name: new Animated.Value(0), tag: new Animated.Value(0), text: new Animated.Value(1), zoom: new Animated.Value(0), root: new Animated.Value(1),
  }), []);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    anim.current?.stop();
    played = true;
    setShow(false);
    endIntro();
  }, []);

  // Enfant actif, ou déjà jouée : on n'affiche rien et la suite du lancement n'attend pas.
  useEffect(() => { if (kid || played) { played = true; setShow(false); endIntro(); } }, [kid]);
  // Préférence « réduire les animations » du téléphone.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (alive) setReduced(!!r); }).catch(() => { if (alive) setReduced(false); });
    return () => { alive = false; };
  }, []);
  // Garde-fou.
  useEffect(() => { if (!show) return undefined; const id = setTimeout(finish, MAX_MS); return () => clearTimeout(id); }, [show, finish]);

  // Déroulé.
  useEffect(() => {
    if (!show || reduced === null || finished.current) return undefined;
    const P = PLAN;
    if (reduced) {
      v.fill.setValue(1); v.outline.setValue(0); v.name.setValue(1); v.tag.setValue(1); v.cover.setValue(0); v.glow.setValue(0.5);
      anim.current = Animated.sequence([Animated.delay(REDUCED_PLAN.hold), tm(v.root, 0, 0, REDUCED_PLAN.fade, Easing.linear)]);
    } else {
      anim.current = Animated.parallel([
        tm(v.cover, 0, P.trace.at, P.trace.dur, Easing.inOut(Easing.cubic)),
        tm(v.push, 1, P.push.at, P.push.dur, Easing.out(Easing.quad)),
        tm(v.fill, 1, P.fill.at, P.fill.dur),
        // Halo : monte puis se calme (en séquence : deux animations simultanées sur une même valeur s'annuleraient).
        Animated.sequence([tm(v.glow, 1, P.glowIn.at, P.glowIn.dur), tm(v.glow, 0.25, 0, P.glowOut.dur, Easing.inOut(Easing.quad))]),
        tm(v.outline, 0, P.outlineOut.at, P.outlineOut.dur, Easing.linear),
        tm(v.name, 1, P.name.at, P.name.dur),
        tm(v.tag, 1, P.tagline.at, P.tagline.dur),
        tm(v.text, 0, P.textOut.at, P.textOut.dur, Easing.linear),
        tm(v.zoom, 1, P.zoom.at, P.zoom.dur, Easing.in(Easing.cubic)),
        tm(v.root, 0, P.fade.at, P.fade.dur, Easing.linear),
      ]);
    }
    anim.current.start(({ finished: ok }) => { if (ok) finish(); });
    return () => anim.current?.stop();
  }, [show, reduced, v, finish]);

  // Appui ou bouton retour : on passe, par un fondu court.
  const skip = useCallback(() => {
    if (finished.current) return;
    anim.current?.stop();
    Animated.timing(v.root, { toValue: 0, duration: SKIP_FADE_MS, easing: Easing.linear, useNativeDriver: true }).start(() => finish());
  }, [v, finish]);
  useEffect(() => {
    if (!show) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { skip(); return true; });
    return () => sub.remove();
  }, [show, skip]);

  if (!show) return null;
  const scale = Animated.multiply(
    v.push.interpolate({ inputRange: [0, 1], outputRange: [1, PUSH_SCALE] }),
    v.zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM_SCALE] }),
  );
  const half = SPLASH_SIZE / 2;
  const cover = { position: 'absolute' as const, top: 0, width: half + 1, height: SPLASH_SIZE, backgroundColor: BG, transformOrigin: 'top' as const, transform: [{ scaleY: v.cover }] };
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 2000, elevation: 2000, backgroundColor: BG, opacity: v.root }]} accessibilityLabel="Mejliss TV" accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel={t('intro.skip')} onPress={skip} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, dirStyle]}>
        <View style={{ transform: [{ translateY: -30 }], alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          {/* Logo : contour, rideaux, halo, remplissage — tous dans le même carré que l'écran de démarrage. */}
          <Animated.View style={{ width: SPLASH_SIZE, height: SPLASH_SIZE, transform: [{ scale }] }}>
            <Animated.Image source={OUTLINE} style={{ position: 'absolute', width: SPLASH_SIZE, height: SPLASH_SIZE, opacity: v.outline }} />
            <Animated.View style={[cover, { left: 0 }]} />
            <Animated.View style={[cover, { right: 0 }]} />
            <Animated.Image source={GLOW} style={{ position: 'absolute', left: -70, top: -70, width: SPLASH_SIZE + 140, height: SPLASH_SIZE + 140, opacity: v.glow }} />
            <Animated.Image source={EMBLEM} style={{ position: 'absolute', width: SPLASH_SIZE, height: SPLASH_SIZE, opacity: v.fill }} />
          </Animated.View>
          {/* Nom et slogan */}
          <Animated.View style={{ position: 'absolute', top: SPLASH_SIZE / 2 + 108, alignItems: 'center', opacity: v.text }}>
            <Animated.View style={{ opacity: v.name, transform: [{ translateY: v.name.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
              <Image source={WORDMARK} style={{ width: 170, height: 35 }} contentFit="contain" accessibilityIgnoresInvertColors />
            </Animated.View>
            <Animated.View style={{ opacity: v.tag, marginTop: 14, transform: [{ translateY: v.tag.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
              <Txt size={14} weight="medium" color={colors.goldLight} style={{ letterSpacing: 0.6, textAlign: 'center' }}>{t('intro.tagline')}</Txt>
            </Animated.View>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
