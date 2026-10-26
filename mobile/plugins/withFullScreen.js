// Affichage complet (étape 27) : l'application occupe tout l'écran, y compris sous la barre de navigation Android.
// Sans cela, Android pose un voile gris clair sous les boutons (« contraste forcé ») par-dessus le bas de l'appli.
// On désactive ce voile et on impose des icônes claires (l'appli est noire) pour la barre d'état et la barre de navigation.
const { withAndroidStyles } = require('@expo/config-plugins');

const ITEMS = {
  'android:enforceNavigationBarContrast': 'false',
  'android:enforceStatusBarContrast': 'false',
  'android:windowLightNavigationBar': 'false',
  'android:windowLightStatusBar': 'false',
};

module.exports = function withFullScreen(config) {
  return withAndroidStyles(config, (cfg) => {
    const style = cfg.modResults.resources.style?.find((s) => s.$.name === 'AppTheme');
    if (!style) return cfg;
    style.item = style.item || [];
    for (const [name, value] of Object.entries(ITEMS)) {
      const known = style.item.find((i) => i.$.name === name);
      if (known) known._ = value;
      else style.item.push({ $: { name, 'tools:targetApi': name.includes('Contrast') ? '29' : '27' }, _: value });
    }
    return cfg;
  });
};
