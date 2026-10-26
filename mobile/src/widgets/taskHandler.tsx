// Widgets Android (étape 25) : tâche de fond appelée par Android quand un widget doit être dessiné (ajout, mise à jour périodique ≈ 30 min,
// redimensionnement). Un appui sur un widget ouvre l'application directement (lien « mejlisstv://… »), sans passer par ici.
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { buildWidget, fallbackWidget } from './render';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  try {
    props.renderWidget(await buildWidget(props.widgetInfo.widgetName));
  } catch (e) {
    // Jamais de widget vide : message court + trace pour le diagnostic (adb logcat | grep MejlissWidget).
    console.error('MejlissWidget', props.widgetInfo.widgetName, e);
    try { props.renderWidget(fallbackWidget()); } catch { /* rien de plus à tenter */ }
  }
}
