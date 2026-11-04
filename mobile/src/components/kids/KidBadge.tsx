// Badge enfant dessiné. Décoratif : le nom du badge est toujours écrit à côté. Code inconnu : ancienne icône emoji.
import React from 'react';
import { Image } from 'react-native';
import { BADGE_IMAGES } from '@/lib/kidBadges';
import { badgeIcon } from '@/lib/kids';
import { KTxt } from '@/components/kids/KidUi';

export function KidBadge({ code, size = 56 }: { code: string; size?: number }) {
  const src = BADGE_IMAGES[code];
  if (!src) return <KTxt size={Math.round(size * 0.6)}>{badgeIcon(code)}</KTxt>;
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}
