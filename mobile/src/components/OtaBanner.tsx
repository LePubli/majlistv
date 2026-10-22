// Mise à jour du CONTENU de l'application (22b-5, partie 2) : l'application reçoit en arrière-plan, depuis notre serveur, les corrections
// de textes, d'écrans et de code qui ne touchent pas au code natif. Une fois téléchargée, elle s'applique au prochain démarrage ;
// ce bandeau permet de redémarrer tout de suite. Inactif en développement et dans l'APK sans mises à jour intégrées.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function OtaBanner() {
  const { t, dirStyle } = useSession();
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  if (!Updates.isEnabled || !isUpdatePending) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, zIndex: 60 }}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={t('au.otaRestart')} onPress={() => { Updates.reloadAsync().catch(() => {}); }}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine }, dirStyle]}
      >
        <Feather name="refresh-cw" size={20} color={colors.gold} />
        <Txt weight="bold" size={14} style={{ flex: 1 }}>{t('au.otaReady')}</Txt>
        <Txt weight="extrabold" size={14} color={colors.goldLight}>{t('au.otaRestart')}</Txt>
      </Pressable>
    </View>
  );
}
