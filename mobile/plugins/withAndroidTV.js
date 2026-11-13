// Application TV (Android TV / Google TV) : la MÊME application s'installe sur une télé et y apparaît dans le lanceur de la télé.
//  - <uses-feature> écran tactile et « leanback » NON obligatoires (sinon le magasin et le système la refusent sur une télé) ;
//  - catégorie LEANBACK_LAUNCHER sur l'écran principal (icône dans le lanceur de la télé) ;
//  - bannière 320 × 180 (assets/tv-banner.png → res/drawable/tv_banner.png), exigée par le lanceur de la télé.
// Sur la télé, l'application affiche ses écrans pensés pour la télécommande (src/app/tv, cf. src/lib/tv.ts).
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

function withTvManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const m = cfg.modResults.manifest;
    m['uses-feature'] = m['uses-feature'] || [];
    for (const name of ['android.hardware.touchscreen', 'android.software.leanback']) {
      const known = m['uses-feature'].find((f) => f.$['android:name'] === name);
      if (known) known.$['android:required'] = 'false';
      else m['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    const app = m.application[0];
    app.$['android:banner'] = '@drawable/tv_banner';
    const main = (app.activity || []).find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      const launcher = (main['intent-filter'] || []).find((f) => (f.action || []).some((a) => a.$['android:name'] === 'android.intent.action.MAIN'));
      if (launcher) {
        launcher.category = launcher.category || [];
        if (!launcher.category.some((c) => c.$['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER')) {
          launcher.category.push({ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } });
        }
      }
    }
    return cfg;
  });
}

function withTvBanner(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const src = path.join(cfg.modRequest.projectRoot, 'assets', 'tv-banner.png');
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, 'tv_banner.png'));
    return cfg;
  }]);
}

module.exports = function withAndroidTV(config) {
  return withTvBanner(withTvManifest(config));
};
