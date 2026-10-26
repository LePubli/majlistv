// Widgets Android (étape 25) : tâche de fond appelée par Android quand un widget doit être dessiné (ajout, mise à jour périodique ≈ 30 min,
// redimensionnement). Un appui sur un widget ouvre l'application directement (lien « mejlisstv://… »), sans passer par ici.
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { buildWidget } from './render';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  try {
    props.renderWidget(await buildWidget(props.widgetInfo.widgetName));
  } catch { /* le widget garde son dernier dessin plutôt que d'afficher une erreur */ }
}
