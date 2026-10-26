// Éléments de dessin de la bibliothèque des widgets, sans son code natif (pour les tests Node).
const base = '../../node_modules/react-native-android-widget/lib/commonjs/widgets/';
// L'image réelle appelle react-native (Image.resolveAssetSource) : ici, un équivalent pur qui garde le même type de nœud.
function ImageWidget() { return null; }
ImageWidget.__name__ = 'ImageWidget';
ImageWidget.convertProps = (props) => ({ imageWidth: props.imageWidth, imageHeight: props.imageHeight, image: { uri: String(props.image) } });
module.exports = { FlexWidget: require(base + 'FlexWidget').FlexWidget, TextWidget: require(base + 'TextWidget').TextWidget, ImageWidget };
