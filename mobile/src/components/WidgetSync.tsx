// Widgets Android (étape 25) : tient les widgets à jour depuis l'application. Laisse aux widgets les réglages de prière (lieu, méthode…) et
// leur demande de se redessiner : au changement de réglage, de langue, de compte, et à chaque retour dans l'application.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { savePrayerSnap } from '@/widgets/store';
import { refreshWidgets } from '@/widgets/refresh';

export function WidgetSync() {
  const { user, locale, ready } = useSession();
  const prayer = usePrayer();

  useEffect(() => {
    if (!ready || !prayer.ready) return;
    void (async () => {
      await savePrayerSnap({ on: prayer.on, enabled: prayer.prefs.enabled, prefs: prayer.prefs, locale });
      await refreshWidgets();
    })();
  }, [ready, prayer.ready, prayer.on, prayer.prefs, locale, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void refreshWidgets(); });
    return () => sub.remove();
  }, []);
  return null;
}
