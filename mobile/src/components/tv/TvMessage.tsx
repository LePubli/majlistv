// Écran de message de la télé (refonte TV-R) : vidéo pas prête, lecture impossible, rien en écoute… avec un bouton « Retour ».
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { TvButton } from './TvButton';

type Props = {
  text: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  bg?: string;
  accent?: string;
  onAccent?: string;
  onBack?: () => void;
  children?: React.ReactNode;
};

export function TvMessage({ text, icon = 'alert-circle', bg = tvc.bg, accent, onAccent, onBack, children }: Props) {
  const { t, dirStyle } = useSession();
  const { u } = useTv();
  const back = onBack ?? (() => { if (router.canGoBack()) router.back(); else router.replace('/tv'); });
  return (
    <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: u(30), padding: u(96), backgroundColor: bg }, dirStyle]}>
      <View style={{ width: u(96), height: u(96), borderRadius: u(28), alignItems: 'center', justifyContent: 'center', backgroundColor: tvc.glassSoft }}>
        <Feather name={icon} size={u(46)} color={accent ?? tvc.accentLight} />
      </View>
      <Txt weight="bold" size={u(34)} style={{ textAlign: 'center', maxWidth: u(1100), lineHeight: u(48) }}>{text}</Txt>
      <View style={{ flexDirection: 'row', gap: u(18) }}>
        {children}
        <TvButton first={!children} label={t('tv.back')} icon="arrow-left" onPress={back} accent={accent} onAccent={onAccent} />
      </View>
    </View>
  );
}
