// Point d'entrée de l'application. Les widgets Android (étape 25) s'exécutent dans une tâche de fond sans écran :
// leur gestionnaire doit être enregistré ici, avant le démarrage de l'application.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/taskHandler';

registerWidgetTaskHandler(widgetTaskHandler);
