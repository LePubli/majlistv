// Notifications de l'application (étape 22b-4) — partie native.
//  1. Rappels de prière : programmés SUR le téléphone (7 jours à l'avance, reprogrammés à chaque ouverture) : ils sonnent application fermée,
//     sans serveur ni connexion.
//  2. Notifications du serveur (nouvelles conférences, sélection de la semaine, révision) : le téléphone donne son jeton Firebase à l'API
//     (PUT /me/push-token) ; le serveur écrit au téléphone quand il y a quelque chose à dire.
//  3. Toucher une notification ouvre la bonne page (voir notifRoute.ts).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type { Api } from './api';
import type { Locale } from './i18n';
import { translate } from './i18n';
import { planPrayers } from './prayerPlan';
import { fmtTime } from './prayer/prayerTimes';
import type { buildSchedule } from './prayer/prayerLogic';

type Prefs = Parameters<typeof buildSchedule>[1];
const PUSH_TOKEN_KEY = 'mejliss.pushToken';
export const CHANNEL_PRAYER = 'prayer';
export const CHANNEL_NEWS = 'news';

/** À appeler une fois au démarrage : comportement en premier plan et canaux Android. */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    // Les noms des canaux sont visibles dans les réglages du téléphone ; leur son et leur importance se règlent là-bas.
    await Notifications.setNotificationChannelAsync(CHANNEL_PRAYER, { name: 'Prière', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#E8A93A' }).catch(() => {});
    await Notifications.setNotificationChannelAsync(CHANNEL_NEWS, { name: 'Actualités', importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
  }
}

export type PermState = 'granted' | 'denied' | 'undetermined';

/** État de l'autorisation ; avec ask = true, la demande est faite si elle n'a pas encore été refusée. */
export async function notificationPermission(ask = false): Promise<PermState> {
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && ask && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch { return 'denied'; }
}

/** Android 12+ : l'autorisation « alarmes exactes » est-elle accordée ? (toujours vrai ailleurs) */
export async function exactAlarmsAllowed(): Promise<boolean> {
  try { return (await Notifications.getExactAlarmPermissionsAsync()).granted; } catch { return true; }
}
export async function askExactAlarms(): Promise<void> {
  try { await Notifications.requestExactAlarmPermissionsAsync(); } catch { /* écran indisponible : sans effet */ }
}

/**
 * (Re)programme les rappels de prière. Annule d'abord les anciens rappels de prière (jamais les autres notifications),
 * puis programme ceux des 7 prochains jours si `enabled` et si les notifications sont autorisées. Renvoie le nombre programmé.
 */
export async function syncPrayerNotifications(o: { enabled: boolean; prefs: Prefs; locale: Locale; nowMs?: number }): Promise<number> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(pending.filter((n) => (n.content.data as { kind?: string } | null)?.kind === 'prayer')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    if (!o.enabled || (await notificationPermission(false)) !== 'granted') return 0;
    const plan = planPrayers(o.nowMs ?? Date.now(), o.prefs);
    for (const p of plan) {
      const name = translate(o.locale, ('pry' + p.id[0].toUpperCase() + p.id.slice(1)) as never);
      await Notifications.scheduleNotificationAsync({
        identifier: `prayer:${p.key}`,
        content: { title: translate(o.locale, 'np.prayerTitle'), body: translate(o.locale, 'np.prayerBody', { name, time: fmtTime(p.at, o.prefs.loc.tz, o.locale) }), data: { kind: 'prayer', path: '/' }, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL_PRAYER },
      });
    }
    return plan.length;
  } catch { return 0; }
}

/** Donne le jeton Firebase de ce téléphone au serveur. Silencieux si Firebase n'est pas configuré dans cette version de l'application. */
export async function registerPush(api: Api, locale: Locale): Promise<'ok' | 'denied' | 'unavailable'> {
  if ((await notificationPermission(false)) !== 'granted') return 'denied';
  try {
    const dev = await Notifications.getDevicePushTokenAsync();
    const token = String(dev.data || '');
    if (!token) return 'unavailable';
    await api.put('/me/push-token', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', locale });
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token).catch(() => {});
    return 'ok';
  } catch { return 'unavailable'; } // pas de google-services.json dans cette version, ou serveur injoignable : on réessaiera à la prochaine ouverture
}

/** À la déconnexion : le serveur n'écrit plus à ce téléphone pour ce compte. */
export async function unregisterPush(api: Api): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (token) await api.del('/me/push-token', { token });
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch { /* hors connexion : le jeton sera repris par le prochain compte connecté, ou nettoyé par le serveur s'il devient périmé */ }
}
