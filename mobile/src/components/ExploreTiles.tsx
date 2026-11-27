// Explorer (téléphone) : une grande tuile par grand thème (sans sous-thèmes), comme la page /explorer du site.
// Image choisie dans l'admin si elle existe, sinon un dégradé bleu nuit ; nom, nombre de vidéos ; un appui ouvre la liste du thème.
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { catFallback, catImageUrl } from '@/lib/catImage';
import { API_URL, SITE_URL } from '@/lib/config';
import type { CatTile } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';

export function ExploreTiles({ onPick }: { onPick: (id: number) => void }) {
  const { api, t, locale } = useSession();
  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 3 : 2;
  const gap = 12;
  const w = Math.floor((width - 32 - gap * (cols - 1)) / cols);
  const tiles = useAsync(async () => {
    const r = await api.get<{ categories: CatTile[] }>('/catalogue/categories', { lang: locale }).catch(() => ({ categories: [] as CatTile[] }));
    return r.categories.filter((c) => c.parentId == null);
  }, [locale]);
  if (tiles.loading) return <Loading />;
  const list = tiles.data ?? [];
  if (!list.length) return <Txt color={colors.muted}>{t('talks.empty')}</Txt>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {list.map((c) => {
        const uri = catImageUrl(c.image, API_URL, SITE_URL);
        return (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.name} onPress={() => onPick(c.id)}
            style={({ pressed }) => ({ width: w, height: Math.round(w * 1.05), borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', opacity: pressed ? 0.85 : 1 })}>
            <LinearGradient colors={catFallback(c.id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
            {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={200} /> : null}
            <LinearGradient colors={['rgba(5,7,13,0)', 'rgba(5,7,13,0.55)', 'rgba(5,7,13,0.95)']} locations={[0.2, 0.62, 1]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: 14, gap: 4 }}>
              <Txt weight="extrabold" size={17} numberOfLines={2}>{c.name}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Txt weight="bold" size={12} color={colors.goldLight}>{t('ex.count', { n: c.count })}</Txt>
                <Feather name="chevron-right" size={13} color={colors.goldLight} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
