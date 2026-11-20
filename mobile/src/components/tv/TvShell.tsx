// Cadre des écrans TV (refonte TV-R) : fine colonne d'icônes à gauche (à droite en arabe), toujours entière à l'écran.
// Flèche gauche de la télécommande : le menu s'ouvre en grand, avec les noms, par-dessus le contenu assombri ; il se referme dès
// que le focus revient au contenu. `overlay` : le contenu passe sous la colonne (image à la une en plein écran sur l'accueil).
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import { TV_RAIL_OPEN } from '@/lib/tv';
import { tvc, tvVeil, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

type Entry = { href: string; icon: React.ComponentProps<typeof Feather>['name']; label: string; on: boolean; color?: string };

export function TvShell({ children, overlay }: { children: React.ReactNode; overlay?: boolean }) {
  const { t, user, feat, dirStyle, isRTL } = useSession();
  const path = usePathname();
  const { u, rail } = useTv();
  const [open, setOpen] = useState(false);
  const focused = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onIn = () => { focused.current += 1; if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const onOut = () => {
    focused.current = Math.max(0, focused.current - 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (focused.current === 0) setOpen(false); }, 60);
  };

  const entries: Entry[] = [
    { href: '/tv/search', icon: 'search', label: t('tv.search'), on: true },
    { href: '/tv', icon: 'home', label: t('tv.home'), on: true },
    { href: '/tv/catalog', icon: 'grid', label: t('tv.catalog'), on: true },
    { href: '/tv/live', icon: 'radio', label: t('tv.live'), on: feat('livetv') },
    { href: '/tv/audyn', icon: 'headphones', label: 'Audyn', on: feat('audyn') },
    { href: '/tv/kids', icon: 'star', label: 'Kids', on: feat('kids'), color: tvc.kids },
  ];
  const isActive = (href: string) => (href === '/tv' ? path === '/tv' : path.startsWith(href));
  const accountActive = isActive('/tv/account');
  const railW = open ? u(TV_RAIL_OPEN) : rail;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const side = isRTL ? { right: 0 } : { left: 0 };

  return (
    <View style={[{ flex: 1, backgroundColor: tvc.bg }, dirStyle]}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, start: overlay ? 0 : rail, end: 0 }}>{children}</View>

      {open ? (
        <LinearGradient pointerEvents="none" colors={[tvVeil(0.98), tvVeil(0.92), tvVeil(0.55), tvVeil(0.35)]} locations={[0, 0.22, 0.45, 1]}
          start={{ x: isRTL ? 1 : 0, y: 0 }} end={{ x: isRTL ? 0 : 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      ) : null}

      <View accessibilityRole="menu" style={[{
        position: 'absolute', top: 0, bottom: 0, width: railW, paddingVertical: u(54), paddingHorizontal: open ? u(40) : 0,
        alignItems: open ? 'stretch' : 'center', gap: u(14), backgroundColor: open || overlay ? 'transparent' : tvc.rail,
      }, side]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: open ? 'flex-start' : 'center', gap: u(14), height: u(50), marginBottom: u(34), paddingHorizontal: open ? u(12) : 0 }}>
          <Image source={require('../../../assets/brand/emblem-bleu.png')} style={{ width: u(46), height: u(50) }} contentFit="contain" accessibilityLabel="Mejliss TV" />
          {open ? <Image source={require('../../../assets/brand/wordmark-bleu.png')} style={{ width: u(170), height: u(34) }} contentFit="contain" /> : null}
        </View>
        {entries.filter((e) => e.on).map((e) => {
          const active = isActive(e.href);
          return (
            <Focusable key={e.href} ring={false} scale={1} radius={u(18)} accessibilityRole="link" accessibilityLabel={e.label} accessibilityState={{ selected: active }}
              onFocus={onIn} onBlur={onOut} onPress={() => { if (!active) router.replace(e.href as never); }}>
              {(on) => (
                <View style={{
                  height: u(open ? 68 : 60), width: open ? undefined : u(60), borderRadius: u(18), flexDirection: 'row', alignItems: 'center',
                  justifyContent: open ? 'flex-start' : 'center', gap: u(22), paddingHorizontal: open ? u(22) : 0, backgroundColor: on ? tvc.text : 'transparent',
                }}>
                  {active && !open ? <View style={{ position: 'absolute', start: -u(14), top: u(18), width: u(5), height: u(24), borderRadius: u(3), backgroundColor: tvc.accentLight }} /> : null}
                  <Feather name={e.icon} size={u(28)} color={on ? tvc.onLight : e.color ?? (active ? tvc.text : tvc.muted)} />
                  {open ? <Txt weight="bold" size={u(28)} color={on ? tvc.onLight : active ? tvc.text : tvc.text2} numberOfLines={1}>{e.label}</Txt> : null}
                </View>
              )}
            </Focusable>
          );
        })}
        <View style={{ flex: 1 }} />
        <Focusable ring={false} scale={1} radius={u(18)} accessibilityRole="link" accessibilityLabel={user ? t('tv.account') : t('tv.login')} accessibilityState={{ selected: accountActive }}
          onFocus={onIn} onBlur={onOut} onPress={() => { if (!accountActive) router.replace('/tv/account'); }}>
          {(on) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: open ? 'flex-start' : 'center', gap: u(18), height: u(84), paddingHorizontal: open ? u(16) : 0, borderRadius: u(18), backgroundColor: on && open ? tvc.text : 'transparent' }}>
              <View style={{ width: u(52), height: u(52), borderRadius: u(26), alignItems: 'center', justifyContent: 'center', backgroundColor: user ? tvc.accent : tvc.glass, borderWidth: on || accountActive ? u(3) : 0, borderColor: on && !open ? tvc.text : tvc.accentLight }}>
                {user ? <Txt weight="extrabold" size={u(22)} color={tvc.text}>{initial}</Txt> : <Feather name="user" size={u(24)} color={tvc.text} />}
              </View>
              {open ? (
                <View style={{ flexShrink: 1 }}>
                  <Txt weight="bold" size={u(24)} color={on ? tvc.onLight : tvc.text} numberOfLines={1}>{user ? user.name || user.email : t('tv.login')}</Txt>
                  {user ? <Txt size={u(19)} color={on ? tvc.onLight : tvc.muted} numberOfLines={1}>{t('tv.account')}</Txt> : null}
                </View>
              ) : null}
            </View>
          )}
        </Focusable>
      </View>
    </View>
  );
}
