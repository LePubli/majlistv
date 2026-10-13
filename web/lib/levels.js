// Niveaux de difficulté (étape 24.1). La valeur vide signifie « tous niveaux ».
export const LEVELS = ['beginner', 'intermediate', 'advanced'];
const KEY = { beginner: 'lvBeginner', intermediate: 'lvInter', advanced: 'lvAdvanced' };
export const levelLabel = (level, t) => (KEY[level] ? t(KEY[level]) : '');
