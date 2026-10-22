// AirPlay (iPhone / iPad) : bouton natif de choix de l'appareil. La lecture est transmise par le système (AVPlayer) :
// pas de pont à gérer, la position et le son suivent seuls.
import React from 'react';
import { VideoAirPlayButton } from 'expo-video';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import type { CastBridgeProps } from '@/lib/cast';
import { CastTile } from './CastTile';

export function CastBridge(_props: CastBridgeProps) {
  const { t } = useSession();
  return (
    <CastTile label={t('cast.tileAirplay')}>
      <VideoAirPlayButton style={{ width: 28, height: 28 }} tint={colors.text} activeTint={colors.goldLight} />
    </CastTile>
  );
}
