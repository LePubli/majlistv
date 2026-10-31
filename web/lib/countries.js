// Étape 44 — Codes pays ISO 3166-1 alpha-2 (le nom affiché vient d'Intl.DisplayNames, dans la langue du site).
export const COUNTRY_CODES = ('AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ '
  + 'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP '
  + 'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM '
  + 'PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ '
  + 'VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');

export function countryName(code, locale) {
  try { return new Intl.DisplayNames([locale || 'fr'], { type: 'region' }).of(code) || code; } catch { return code; }
}

// Pays déduit de la langue du navigateur (« fr-MA » → MA) ; vide quand la langue n'indique pas de pays.
export function guessCountry() {
  try {
    for (const l of navigator.languages || [navigator.language]) {
      const m = /-([A-Za-z]{2})$/.exec(l || '');
      if (m && COUNTRY_CODES.includes(m[1].toUpperCase())) return m[1].toUpperCase();
    }
  } catch { /* navigateur sans informations de langue */ }
  return '';
}
