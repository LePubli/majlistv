// Éléments de dessin de la bibliothèque des widgets, sans son code natif (pour les tests Node).
const base = '../../node_modules/react-native-android-widget/lib/commonjs/widgets/';
module.exports = { FlexWidget: require(base + 'FlexWidget').FlexWidget, TextWidget: require(base + 'TextWidget').TextWidget };
