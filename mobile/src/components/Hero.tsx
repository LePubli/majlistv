// Bannière du haut de l'accueil : conférences mises en avant (défilement automatique), bannière personnalisée, ou simple titre.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Linking, Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import type { Card, Home } from '@/lib/types';
import { colors, gradientFor } from '@/lib/theme';
import { minutesLabel, thumbOf } from '@/lib/media';
import { SITE_URL } from '@/lib/config';
import { Button, Txt } from './ui';
import { Badge } from './TalkCard';

function Shade() {
  return <LinearGradient colors={['rgba(11,9,6,0.15)', 'rgba(11,9,6,0.55)', colors.bg]} locations={[0, 0.55, 1]} style={{ position: 'absolute', inset: 0 }} />;
}

function TextHero() {
  const { t, user, config } = useSession();
  const trial = config?.trialDays ?? 0;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10, gap: 12 }}>
      <Txt weight="bold" size={12} color={colors.goldLight} style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('heroEyebrow')}</Txt>
      <Txt weight="extrabold" size={32} style={{ lineHeight: 38 }}>{t('heroTitle')}</Txt>
      <Txt size={15} color={colors.text2} style={{ lineHeight: 22 }}>{t('heroText')}</Txt>
      <View style={{ gap: 10, marginTop: 4 }}>
        {!user ? <Button label={trial > 0 ? t('heroCta') : t('register')} onPress={() => router.push({ pathname: '/login', params: { mode: 'register' } })} /> : null}
        <Button label={t('pricing')} variant="ghost" onPress={() => Linking.openURL(`${SITE_URL}/pricing`)} />
      </View>
      {!user && trial > 0 ? <Txt size={12} color={colors.muted}>{t('heroNote', { n: trial })}</Txt> : null}
    </View>
  );
}

function CustomHero({ hero }: { hero: Extract<Home['hero'], { mode: 'custom' }> }) {
  const { t, user, config } = useSession();
  const trial = config?.trialDays ?? 0;
  return (
    <View style={{ minHeight: 300, justifyContent: 'flex-end' }}>
      {hero.imageUrl ? <Image source={{ uri: hero.imageUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : null}
      <Shade />
      <View style={{ padding: 16, gap: 10 }}>
        <Txt weight="bold" size={12} color={colors.goldLight} style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('heroEyebrow')}</Txt>
        <Txt weight="extrabold" size={30} style={{ lineHeight: 36 }}>{hero.title}</Txt>
        {hero.subtitle ? <Txt size={15} color={colors.text2}>{hero.subtitle}</Txt> : null}
        {hero.ctaLabel && hero.ctaUrl ? (
          <Button label={hero.ctaLabel} onPress={() => (/^https:/.test(hero.ctaUrl!) ? Linking.openURL(hero.ctaUrl!) : Linking.openURL(`${SITE_URL}${hero.ctaUrl}`))} />
        ) : !user ? <Button label={trial > 0 ? t('heroCta') : t('register')} onPress={() => router.push({ pathname: '/login', params: { mode: 'register' } })} /> : null}
      </View>
    </View>
  );
}

function FeaturedHero({ items }: { items: Card[] }) {
  const { t } = useSession();
  const { width } = useWindowDimensions();
  const ref = useRef<FlatList<Card>>(null);
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {}); }, []);
  // Défilement toutes les 8 s, sauf « réduire les animations » ; repart du début après le dernier.
  useEffect(() => {
    if (reduced || items.length < 2) return undefined;
    const id = setTimeout(() => {
      const n = (i + 1) % items.length;
      ref.current?.scrollToIndex({ index: n, animated: true });
      setI(n);
    }, 8000);
    return () => clearTimeout(id);
  }, [i, reduced, items.length]);
  const h = Math.round(Math.min(Math.max(width * 1.05, 380), 520));
  return (
    <View>
      <FlatList
        ref={ref}
        horizontal
        pagingEnabled
        data={items}
        keyExtractor={(x) => x.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
        renderItem={({ item: x }) => {
          const uri = thumbOf(x);
          const mins = minutesLabel(x.durationSeconds, t);
          return (
            <View style={{ width, height: h, justifyContent: 'flex-end' }}>
              <LinearGradient colors={gradientFor(x.id)} style={{ position: 'absolute', inset: 0 }} />
              {uri ? <Image source={{ uri }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={200} /> : null}
              <Shade />
              <View style={{ padding: 16, paddingBottom: 34, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ paddingHorizontal: 8, borderRadius: 999, backgroundColor: x.access === 'premium' ? colors.gold : 'rgba(0,0,0,0.6)' }}>
                    <Txt weight="bold" size={11} color={x.access === 'premium' ? colors.onGold : colors.text}>{t(x.access)}</Txt>
                  </View>
                  {x.category ? <Txt weight="bold" size={12} color={colors.goldLight}>{x.category}</Txt> : null}
                </View>
                <Txt weight="extrabold" size={26} style={{ lineHeight: 32 }} numberOfLines={3}>{x.title}</Txt>
                <Txt size={13} color={colors.text2}>{[x.speaker, mins].filter(Boolean).join(' · ')}</Txt>
                {x.summary ? <Txt size={14} color={colors.text2} numberOfLines={2}>{x.summary}</Txt> : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <Button label={`▶ ${t('watchNow')}`} onPress={() => router.push({ pathname: '/talk/[id]', params: { id: x.id } })} style={{ flex: 1 }} />
                  <Button label={t('moreInfo')} variant="ghost" onPress={() => router.push({ pathname: '/talk/[id]', params: { id: x.id } })} style={{ flex: 1 }} />
                </View>
              </View>
            </View>
          );
        }}
      />
      {items.length > 1 ? (
        <View accessibilityRole="tablist" style={{ position: 'absolute', bottom: 12, start: 0, end: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {items.map((x, k) => (
            <Pressable key={x.id} accessibilityRole="tab" accessibilityLabel={t('heroGoTo', { n: k + 1 })} accessibilityState={{ selected: k === i }} hitSlop={8}
              onPress={() => { ref.current?.scrollToIndex({ index: k, animated: true }); setI(k); }}
              style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? colors.gold : 'rgba(255,255,255,0.4)' }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Hero({ hero }: { hero?: Home['hero'] }) {
  if (hero?.mode === 'featured' && hero.items?.length) return <FeaturedHero items={hero.items} />;
  if (hero?.mode === 'custom') return <CustomHero hero={hero} />;
  return <TextHero />;
}
