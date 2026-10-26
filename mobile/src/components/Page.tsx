// Gabarit des écrans ouverts par-dessus les onglets : retour, titre, contenu défilant avec rafraîchissement.
import React from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { ErrorBox, Loading, ScreenHeader, screenStyle } from './ui';

export function Page({ title, loading, error, onRetry, onRefresh, children, padded = true }: {
  title: string; loading?: boolean; error?: boolean; onRetry?: () => void; onRefresh?: () => void; children?: React.ReactNode; padded?: boolean;
}) {
  const { dirStyle } = useSession();
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={title} />
      {loading ? <Loading /> : error ? <ErrorBox onRetry={onRetry} /> : (
        <ScrollView contentContainerStyle={{ padding: padded ? 16 : 0, gap: 16, paddingBottom: 48 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.gold} /> : undefined}>
          {children}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
