// Illustrations des badges enfants (version « rosace dorée » validée par Epok le 04/11). Images PNG fournies avec l'application :
// aucun module natif ajouté (la mise à jour du contenu suffit). Mêmes dessins que le site (web/public/kids/badges/*.svg).
import type { ImageSourcePropType } from 'react-native';

export const BADGE_IMAGES: Record<string, ImageSourcePropType> = {
  first_quiz: require('../../assets/badges/first_quiz.png'),
  three_stars: require('../../assets/badges/three_stars.png'),
  quizzes_5: require('../../assets/badges/quizzes_5.png'),
  explorer: require('../../assets/badges/explorer.png'),
  watcher_3: require('../../assets/badges/watcher_3.png'),
  retry_better: require('../../assets/badges/retry_better.png'),
  stars_10: require('../../assets/badges/stars_10.png'),
};
