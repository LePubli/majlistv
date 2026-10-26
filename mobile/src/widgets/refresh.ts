// Widgets Android (étape 25) : l'application demande aux widgets de se redessiner (retour au premier plan, changement de réglage de prière,
// connexion / déconnexion, changement de langue). Sans effet hors Android ou sans widget posé.
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { WIDGET_NAMES, buildWidget } from './render';

export async function refreshWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all(WIDGET_NAMES.map((widgetName) => requestWidgetUpdate({ widgetName, renderWidget: () => buildWidget(widgetName) }).catch(() => { /* module absent (Expo Go) ou aucun widget */ })));
}
