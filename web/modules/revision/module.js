// Module « Révision espacée » — partie web (étape M3b). Pages : web/app/(module-revision)/ et web/app/studio/(module-revision)/ s'il y en a.
const mod = {
  id: 'revision',
  name: 'Révision espacée',
  features: ['revision'],
  paths: [
    /^\/studio\/reminders(\/|$)/,
  ],
};
export default mod;
