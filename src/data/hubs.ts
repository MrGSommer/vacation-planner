/**
 * Static hub suggestions for multi-leg flight routing.
 * Maps region pairs to common connection airports.
 * Zero API calls — all client-side.
 */

// ISO country → region code
const REGION_MAP: Record<string, string> = {
  // Europe
  CH: 'EUR', DE: 'EUR', AT: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR',
  GB: 'EUR', NL: 'EUR', BE: 'EUR', GR: 'EUR', HR: 'EUR', CZ: 'EUR', PL: 'EUR',
  SE: 'EUR', NO: 'EUR', DK: 'EUR', FI: 'EUR', IE: 'EUR', HU: 'EUR', RO: 'EUR',
  BG: 'EUR', RS: 'EUR', SK: 'EUR', SI: 'EUR', LT: 'EUR', LV: 'EUR', EE: 'EUR',
  IS: 'EUR', MT: 'EUR', CY: 'EUR', LU: 'EUR', ME: 'EUR', AL: 'EUR', MK: 'EUR',
  BA: 'EUR', XK: 'EUR', MD: 'EUR', UA: 'EUR', BY: 'EUR',
  // Turkey bridges EUR/MEA
  TR: 'MEA',
  // North America
  US: 'NAM', CA: 'NAM', MX: 'NAM',
  // Central America & Caribbean
  PA: 'CAM', CR: 'CAM', CU: 'CAM', DO: 'CAM', JM: 'CAM', HT: 'CAM',
  GT: 'CAM', HN: 'CAM', NI: 'CAM', SV: 'CAM', BZ: 'CAM',
  BS: 'CAM', BB: 'CAM', TT: 'CAM', AW: 'CAM', CW: 'CAM',
  // South America
  BR: 'SAM', AR: 'SAM', CL: 'SAM', CO: 'SAM', PE: 'SAM', EC: 'SAM',
  VE: 'SAM', BO: 'SAM', PY: 'SAM', UY: 'SAM', GY: 'SAM', SR: 'SAM',
  // Africa
  ZA: 'AFR', EG: 'AFR', MA: 'AFR', TN: 'AFR', KE: 'AFR', NG: 'AFR',
  ET: 'AFR', TZ: 'AFR', GH: 'AFR', SN: 'AFR', CI: 'AFR', MU: 'AFR',
  MG: 'AFR', MZ: 'AFR', ZW: 'AFR', NA: 'AFR', BW: 'AFR', RW: 'AFR',
  UG: 'AFR', CM: 'AFR', AO: 'AFR', DZ: 'AFR', LY: 'AFR',
  // Middle East
  AE: 'MEA', SA: 'MEA', QA: 'MEA', OM: 'MEA', BH: 'MEA', KW: 'MEA',
  JO: 'MEA', LB: 'MEA', IL: 'MEA', IQ: 'MEA', IR: 'MEA',
  // South & Central Asia
  IN: 'SAS', LK: 'SAS', PK: 'SAS', BD: 'SAS', NP: 'SAS', MV: 'SAS',
  UZ: 'SAS', KZ: 'SAS', GE: 'SAS', AM: 'SAS', AZ: 'SAS',
  // Southeast Asia
  TH: 'SEA', VN: 'SEA', SG: 'SEA', MY: 'SEA', ID: 'SEA', PH: 'SEA',
  KH: 'SEA', MM: 'SEA', LA: 'SEA', BN: 'SEA',
  // East Asia
  JP: 'EAS', KR: 'EAS', CN: 'EAS', TW: 'EAS', HK: 'EAS', MO: 'EAS', MN: 'EAS',
  // Oceania & Pacific
  AU: 'OCE', NZ: 'OCE', FJ: 'OCE', PF: 'OCE', NC: 'OCE', WS: 'OCE',
  TO: 'OCE', VU: 'OCE', PG: 'OCE', GU: 'OCE', CK: 'OCE',
};

function regionKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

// Region-pair → suggested hub IATA codes
const HUB_SUGGESTIONS: Record<string, string[]> = {
  // Europe ↔ long-haul
  [regionKey('EUR', 'NAM')]: ['LHR', 'CDG', 'FRA', 'AMS', 'IST'],
  [regionKey('EUR', 'SAM')]: ['MAD', 'LIS', 'CDG', 'FRA', 'GRU'],
  [regionKey('EUR', 'CAM')]: ['MAD', 'MIA', 'CDG', 'AMS', 'FRA'],
  [regionKey('EUR', 'AFR')]: ['CDG', 'IST', 'ADD', 'NBO', 'AMS'],
  [regionKey('EUR', 'MEA')]: ['IST', 'DXB', 'DOH', 'VIE', 'ATH'],
  [regionKey('EUR', 'SAS')]: ['DXB', 'DOH', 'IST', 'DEL', 'FRA'],
  [regionKey('EUR', 'SEA')]: ['DXB', 'DOH', 'SIN', 'BKK', 'IST'],
  [regionKey('EUR', 'EAS')]: ['IST', 'DXB', 'DOH', 'HEL', 'FRA'],
  [regionKey('EUR', 'OCE')]: ['SIN', 'DXB', 'DOH', 'HKG', 'KUL'],
  // North America ↔
  [regionKey('NAM', 'SEA')]: ['NRT', 'ICN', 'TPE', 'LAX', 'SFO'],
  [regionKey('NAM', 'EAS')]: ['NRT', 'ICN', 'LAX', 'SFO', 'YVR'],
  [regionKey('NAM', 'OCE')]: ['LAX', 'SFO', 'NRT', 'AKL', 'HNL'],
  [regionKey('NAM', 'SAM')]: ['MIA', 'IAH', 'PTY', 'BOG', 'GRU'],
  [regionKey('NAM', 'AFR')]: ['LHR', 'CDG', 'ADD', 'JFK', 'IAD'],
  [regionKey('NAM', 'MEA')]: ['LHR', 'CDG', 'DXB', 'DOH', 'IST'],
  [regionKey('NAM', 'SAS')]: ['LHR', 'DXB', 'DOH', 'DEL', 'FRA'],
  // Asia cross-region
  [regionKey('SEA', 'EAS')]: ['SIN', 'BKK', 'HKG', 'KUL', 'MNL'],
  [regionKey('SEA', 'OCE')]: ['SIN', 'KUL', 'BKK', 'DPS', 'SYD'],
  [regionKey('EAS', 'OCE')]: ['SIN', 'HKG', 'NRT', 'SYD', 'AKL'],
  [regionKey('MEA', 'SEA')]: ['DXB', 'DOH', 'BKK', 'SIN', 'KUL'],
  [regionKey('MEA', 'EAS')]: ['DXB', 'DOH', 'IST', 'HKG', 'BKK'],
  [regionKey('MEA', 'OCE')]: ['DXB', 'DOH', 'SIN', 'KUL', 'SYD'],
  [regionKey('AFR', 'SEA')]: ['DXB', 'DOH', 'ADD', 'NBO', 'SIN'],
  [regionKey('AFR', 'EAS')]: ['DXB', 'DOH', 'ADD', 'IST', 'HKG'],
  [regionKey('AFR', 'OCE')]: ['DXB', 'DOH', 'JNB', 'SIN', 'SYD'],
  [regionKey('SAM', 'AFR')]: ['GRU', 'JNB', 'ADD', 'LIS', 'CDG'],
  [regionKey('SAM', 'SEA')]: ['LAX', 'DXB', 'DOH', 'GRU', 'SIN'],
  [regionKey('SAM', 'EAS')]: ['LAX', 'GRU', 'DFW', 'NRT', 'SCL'],
  [regionKey('SAM', 'OCE')]: ['SCL', 'AKL', 'SYD', 'LAX', 'GRU'],
  [regionKey('SAS', 'EAS')]: ['DEL', 'BOM', 'BKK', 'SIN', 'HKG'],
  [regionKey('SAS', 'OCE')]: ['SIN', 'KUL', 'BKK', 'DEL', 'SYD'],
  [regionKey('SAS', 'SEA')]: ['DEL', 'BOM', 'BKK', 'SIN', 'KUL'],
};

/**
 * Suggest hub airports for connecting two countries.
 * Returns 3-5 IATA codes or empty array if same region / unknown.
 */
export function suggestHubs(depCountry: string, arrCountry: string): string[] {
  const depRegion = REGION_MAP[depCountry?.toUpperCase()];
  const arrRegion = REGION_MAP[arrCountry?.toUpperCase()];

  if (!depRegion || !arrRegion) return [];
  if (depRegion === arrRegion) return []; // Same region — likely has direct flights

  const key = regionKey(depRegion, arrRegion);
  return HUB_SUGGESTIONS[key] || [];
}

export { REGION_MAP };
