// Citation du jour (verset ou hadith) : texte arabe puis français, avec la référence exacte, dans un grand cadre doré.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSession } from '@/lib/session';
import type { Citation } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Txt } from './ui';

export function CitationCard({ c }: { c: Citation }) {
  const { t } = useSession();
  const [more, setMore] = useState(false);
  if (!c) return null;
  const long = (c.textAr || '').length > 260; // long hadith : texte arabe replié par défaut
  return (
    <View accessibilityLabel={t('citTitle')} style={{ marginHorizontal: 16, padding: 20, borderRadius: radius.panel, borderWidth: 1, borderColor: 'rgba(240,190,80,0.7)', backgroundColor: colors.quoteBgA, gap: 12, alignItems: 'center' }}>
      <Txt weight="bold" size={12} color={colors.quoteGold} style={{ letterSpacing: 1 }}>✦ {t('citTitle')}</Txt>
      {c.textAr ? (
        <Txt size={20} color={colors.quoteArabic} style={{ textAlign: 'center', lineHeight: 36, writingDirection: 'rtl' }}>
          {long && !more ? `${c.textAr.slice(0, 260).trimEnd()}…` : c.textAr}
        </Txt>
      ) : null}
      <Txt size={16} style={{ textAlign: 'center', lineHeight: 24 }}>« {c.text} »</Txt>
      <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }}>{c.attribution}</Txt>
      {long ? (
        <Pressable accessibilityRole="button" onPress={() => setMore((v) => !v)} hitSlop={8}>
          <Txt weight="bold" size={13} color={colors.goldLight}>{more ? t('citLess') : t('citMore')}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
