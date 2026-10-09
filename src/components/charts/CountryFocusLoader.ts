/**
 * Country bounding box for the single-country map drill-down.
 *
 * Strategy (in order):
 *  1. Nominatim (OpenStreetMap) search using the country's English name + ISO2
 *     countrycode hint — the only combination Nominatim resolves reliably.
 *  2. Offline approximate bbox table covering the full world country list, so
 *     the map still renders even when the remote service is unreachable,
 *     rate-limited, or blocked by proxy/CORS — the loader no longer hard-fails.
 */

/** Approximate offline country bounds [west, south, east, north] (ISO-3 keys). */
const COUNTRY_BBOX_OFFLINE: Record<string, [number, number, number, number]> = {
  // west, south, east, north
  SAU: [34.48, 16.0, 55.67, 32.0],
  ARE: [51.4, 22.0, 56.6, 26.5],
  QAT: [50.7, 24.5, 52.0, 26.2],
  KWT: [46.5, 28.5, 48.5, 30.1],
  BHR: [50.3, 25.5, 50.9, 26.5],
  OMN: [51.8, 16.0, 60.0, 26.5],
  YEM: [41.8, 12.0, 54.5, 19.0],
  JOR: [34.9, 29.2, 39.3, 32.7],
  LBN: [35.0, 33.0, 36.6, 34.7],
  SYR: [35.5, 32.0, 42.4, 37.3],
  IRQ: [38.7, 29.0, 48.8, 37.4],
  PSE: [34.2, 31.2, 35.6, 32.7],
  ISR: [34.8, 29.5, 35.1, 33.3],
  EGY: [24.7, 21.7, 37.3, 31.7],
  LBY: [9.3, 19.5, 25.2, 33.2],
  TUN: [7.5, 30.2, 11.6, 37.6],
  DZA: [-8.7, 18.9, 12.4, 37.1],
  MAR: [-13.2, 27.6, -0.99, 35.9],
  SDN: [21.8, 8.7, 38.6, 22.0],
  SSD: [24.0, 3.5, 35.9, 12.2],
  MRT: [-17.1, 14.7, -4.8, 27.3],
  SOM: [40.9, -1.7, 51.4, 12.0],
  DJI: [41.8, 10.9, 43.4, 12.7],
  COM: [43.2, -11.9, 44.6, -11.3],
  TUR: [25.7, 35.8, 44.8, 42.1],
  IRN: [44.1, 25.0, 63.3, 39.7],
  AFG: [60.5, 29.4, 74.9, 38.5],
  PAK: [60.9, 23.8, 77.8, 37.1],
  IND: [68.2, 8.1, 97.4, 35.7],
  BGD: [88.0, 20.6, 92.7, 26.6],
  LKA: [79.6, 5.9, 81.9, 9.8],
  NPL: [80.1, 26.4, 88.2, 30.4],
  BTN: [88.8, 26.7, 92.1, 28.3],
  MDV: [72.0, -0.7, 74.6, 7.1],
  CHN: [73.6, 18.2, 135.0, 53.5],
  JPN: [122.9, 24.2, 148.4, 45.6],
  KOR: [124.6, 33.1, 131.9, 38.6],
  PRK: [124.3, 37.7, 131.9, 43.0],
  MNG: [87.7, 41.6, 120.0, 52.1],
  TWN: [118.3, 21.9, 122.0, 25.3],
  HKG: [113.8, 22.1, 114.4, 22.6],
  MYS: [99.6, 0.8, 119.3, 7.4],
  SGP: [103.6, 1.2, 104.1, 1.5],
  IDN: [95.0, -10.9, 141.0, 6.1],
  THA: [97.4, 5.6, 105.6, 20.5],
  VNM: [102.1, 8.3, 109.5, 23.4],
  PHL: [117.2, 4.6, 126.6, 19.0],
  MMR: [92.2, 9.5, 101.2, 28.5],
  KHM: [102.3, 10.4, 107.6, 14.7],
  LAO: [100.1, 13.9, 107.7, 22.5],
  BRN: [114.1, 4.0, 115.4, 5.0],
  TLS: [124.0, -9.5, 127.3, -8.1],
  KAZ: [46.5, 40.6, 87.3, 55.4],
  UZB: [55.9, 37.2, 73.1, 45.6],
  TKM: [52.5, 35.1, 66.7, 42.8],
  KGZ: [69.3, 39.2, 80.2, 43.2],
  TJK: [67.3, 36.7, 75.1, 41.0],
  GBR: [-8.6, 49.9, 1.8, 60.8],
  IRL: [-10.5, 51.4, -6.0, 55.4],
  FRA: [-5.1, 41.4, 9.5, 51.1],
  DEU: [5.9, 47.3, 15.0, 55.1],
  ESP: [-9.3, 36.0, 3.3, 43.8],
  PRT: [-9.5, 36.9, -6.2, 42.2],
  ITA: [6.6, 36.6, 18.5, 47.1],
  CHE: [5.9, 45.8, 10.5, 47.8],
  AUT: [9.5, 46.4, 17.2, 49.0],
  BEL: [2.5, 49.5, 6.4, 51.5],
  NLD: [3.3, 50.7, 7.2, 53.6],
  LUX: [5.8, 49.4, 6.5, 50.2],
  DNK: [8.1, 54.5, 15.2, 57.8],
  SWE: [10.6, 55.3, 24.2, 69.1],
  NOR: [4.6, 58.0, 31.1, 71.2],
  FIN: [20.6, 59.8, 31.5, 70.1],
  ISL: [-24.5, 63.4, -13.5, 66.5],
  POL: [14.1, 49.0, 24.2, 54.9],
  CZE: [12.1, 48.5, 22.9, 51.1],
  SVK: [16.8, 47.7, 22.6, 49.6],
  HUN: [16.1, 45.7, 22.1, 48.6],
  ROU: [20.3, 43.6, 29.7, 48.3],
  BGR: [22.4, 41.2, 28.6, 44.2],
  GRC: [19.4, 34.8, 28.2, 41.8],
  HRV: [13.5, 42.4, 19.4, 46.5],
  SVN: [13.4, 45.4, 16.6, 46.9],
  SRB: [18.8, 42.2, 23.0, 46.2],
  BIH: [15.7, 42.6, 19.6, 45.3],
  MNE: [18.4, 41.9, 20.4, 43.5],
  MKD: [20.5, 40.8, 23.0, 42.4],
  ALB: [19.3, 39.6, 21.0, 42.7],
  EST: [21.8, 57.5, 28.2, 59.6],
  LVA: [20.9, 55.7, 28.2, 58.1],
  LTU: [20.9, 53.9, 26.8, 56.4],
  BLR: [23.2, 51.3, 32.8, 56.2],
  UKR: [22.1, 44.3, 40.2, 52.4],
  MDA: [26.6, 45.4, 30.1, 48.5],
  RUS: [19.6, 41.2, 180.0, 81.9],
  CYP: [32.3, 34.5, 34.6, 35.7],
  MLT: [14.1, 35.8, 14.6, 36.1],
  GEO: [40.0, 41.0, 46.7, 43.6],
  ARM: [43.4, 38.8, 46.6, 41.3],
  AZE: [44.8, 38.4, 50.4, 41.9],
  NGA: [2.7, 4.2, 14.7, 13.9],
  GHA: [-3.3, 4.7, 1.2, 11.1],
  SEN: [-17.5, 12.3, -11.3, 14.9],
  MLI: [-12.2, 10.1, 4.3, 25.0],
  NER: [0.1, 11.7, 15.9, 23.5],
  TCD: [13.5, 7.4, 24.0, 23.4],
  CMR: [8.5, 1.7, 16.1, 13.1],
  CIV: [-8.6, 4.3, -2.5, 10.7],
  BFA: [-5.5, 9.4, 2.4, 15.1],
  GIN: [-15.1, 7.2, -7.9, 12.7],
  BEN: [0.7, 6.1, 3.9, 12.4],
  TGO: [-0.1, 6.1, 1.8, 11.1],
  SLE: [-13.3, 6.9, -10.5, 10.0],
  LBR: [-11.5, 4.3, -7.5, 8.6],
  GMB: [-16.8, 13.0, -13.8, 13.5],
  GNB: [-16.7, 10.9, -13.6, 12.7],
  GAB: [8.7, -3.9, 14.5, 2.3],
  COG: [11.1, -5.0, 18.6, 3.7],
  COD: [12.1, -13.4, 31.3, 5.4],
  CAF: [14.4, 2.2, 27.5, 11.0],
  GNQ: [5.7, 0.9, 11.3, 2.2],
  ETH: [33.0, 3.4, 48.0, 14.9],
  ERI: [36.4, 12.4, 43.1, 18.0],
  KEN: [33.9, -4.7, 41.9, 5.5],
  UGA: [29.6, -1.5, 35.0, 4.2],
  TZA: [29.3, -11.7, 40.4, -0.9],
  RWA: [28.9, -2.8, 30.9, -1.0],
  BDI: [29.0, -4.5, 30.8, -2.3],
  ZMB: [22.0, -18.1, 33.7, -8.2],
  ZWE: [25.2, -22.4, 33.1, -15.6],
  MWI: [32.7, -17.2, 35.9, -9.3],
  MOZ: [30.2, -26.8, 40.8, -10.3],
  AGO: [11.7, -18.0, 24.1, -4.4],
  NAM: [11.7, -17.1, 25.3, -16.9],
  BWA: [19.0, -26.9, 29.4, -17.8],
  ZAF: [16.4, -34.8, 32.9, -22.1],
  LSO: [27.0, -30.7, 29.5, -28.6],
  SWZ: [30.8, -27.3, 32.1, -25.7],
  MDG: [43.2, -25.6, 50.5, -11.9],
  MUS: [56.5, -20.5, 57.8, -19.9],
  USA: [-124.7, 24.5, -66.9, 49.4],
  CAN: [-141.0, 41.7, -52.6, 83.1],
  MEX: [-117.1, 14.5, -86.8, 32.7],
  GTM: [-92.2, 13.7, -88.2, 17.8],
  HND: [-89.4, 12.9, -83.1, 16.5],
  SLV: [-90.1, 13.1, -87.6, 14.4],
  NIC: [-87.7, 10.7, -83.6, 15.0],
  CRI: [-85.9, 8.0, -82.5, 11.2],
  PAN: [-83.0, 7.2, -77.2, 9.7],
  CUB: [-85.0, 19.9, -74.1, 23.3],
  DOM: [-72.0, 17.5, -68.3, 19.9],
  HTI: [-74.5, 18.0, -71.6, 20.1],
  JAM: [-78.4, 17.7, -76.2, 18.5],
  TTO: [-61.7, 10.0, -60.5, 11.4],
  COL: [-79.0, -4.2, -67.9, 13.4],
  VEN: [-73.4, 0.6, 11.8, 12.2],
  ECU: [-92.2, -5.0, -75.2, 1.4],
  PER: [-81.3, -18.4, -68.7, -0.0],
  BOL: [-69.7, -22.9, -57.5, -9.7],
  BRA: [-74.0, -33.7, -34.8, 5.3],
  PRY: [-62.6, -27.6, -54.3, -19.3],
  URY: [-58.4, -34.9, -53.2, -30.1],
  ARG: [-73.5, -55.0, -53.6, -21.8],
  CHL: [-75.6, -56.7, -66.4, -17.5],
  GUY: [-61.4, 1.2, -56.5, 8.3],
  SUR: [-58.1, 1.8, -53.9, 6.0],
  AUS: [113.1, -43.7, 153.6, -10.7],
  NZL: [166.4, -47.0, 178.5, -34.4],
  FJI: [177.0, -19.0, -178.0, -16.0],
  PNG: [140.8, -11.7, 159.5, -0.9],
  SLB: [155.5, -11.9, 170.2, -6.0],
  VUT: [166.5, -20.2, 171.0, -13.0],
  WSM: [-172.8, -14.1, -171.4, -13.4],
  TON: [-175.4, -21.4, -173.7, -15.6],
};

/** English names for Nominatim lookups. */
const ISO3_TO_NAME: Record<string, string> = Object.fromEntries(
  [
    ['SAU', 'Saudi Arabia'], ['ARE', 'United Arab Emirates'], ['QAT', 'Qatar'], ['KWT', 'Kuwait'],
    ['BHR', 'Bahrain'], ['OMN', 'Oman'], ['YEM', 'Yemen'], ['JOR', 'Jordan'], ['LBN', 'Lebanon'],
    ['SYR', 'Syria'], ['IRQ', 'Iraq'], ['PSE', 'Palestine'], ['ISR', 'Israel'], ['EGY', 'Egypt'],
    ['LBY', 'Libya'], ['TUN', 'Tunisia'], ['DZA', 'Algeria'], ['MAR', 'Morocco'], ['SDN', 'Sudan'],
    ['SSD', 'South Sudan'], ['MRT', 'Mauritania'], ['SOM', 'Somalia'], ['DJI', 'Djibouti'],
    ['COM', 'Comoros'], ['TUR', 'Turkey'], ['IRN', 'Iran'], ['AFG', 'Afghanistan'], ['PAK', 'Pakistan'],
    ['IND', 'India'], ['BGD', 'Bangladesh'], ['LKA', 'Sri Lanka'], ['NPL', 'Nepal'], ['BTN', 'Bhutan'],
    ['MDV', 'Maldives'], ['CHN', 'China'], ['JPN', 'Japan'], ['KOR', 'South Korea'],
    ['PRK', 'North Korea'], ['MNG', 'Mongolia'], ['TWN', 'Taiwan'], ['HKG', 'Hong Kong'],
    ['MYS', 'Malaysia'], ['SGP', 'Singapore'], ['IDN', 'Indonesia'], ['THA', 'Thailand'],
    ['VNM', 'Vietnam'], ['PHL', 'Philippines'], ['MMR', 'Myanmar'], ['KHM', 'Cambodia'],
    ['LAO', 'Laos'], ['BRN', 'Brunei'], ['TLS', 'Timor-Leste'], ['KAZ', 'Kazakhstan'],
    ['UZB', 'Uzbekistan'], ['TKM', 'Turkmenistan'], ['KGZ', 'Kyrgyzstan'], ['TJK', 'Tajikistan'],
    ['GBR', 'United Kingdom'], ['IRL', 'Ireland'], ['FRA', 'France'], ['DEU', 'Germany'],
    ['ESP', 'Spain'], ['PRT', 'Portugal'], ['ITA', 'Italy'], ['CHE', 'Switzerland'],
    ['AUT', 'Austria'], ['BEL', 'Belgium'], ['NLD', 'Netherlands'], ['LUX', 'Luxembourg'],
    ['DNK', 'Denmark'], ['SWE', 'Sweden'], ['NOR', 'Norway'], ['FIN', 'Finland'], ['ISL', 'Iceland'],
    ['POL', 'Poland'], ['CZE', 'Czechia'], ['SVK', 'Slovakia'], ['HUN', 'Hungary'], ['ROU', 'Romania'],
    ['BGR', 'Bulgaria'], ['GRC', 'Greece'], ['HRV', 'Croatia'], ['SVN', 'Slovenia'], ['SRB', 'Serbia'],
    ['BIH', 'Bosnia and Herzegovina'], ['MNE', 'Montenegro'], ['MKD', 'North Macedonia'],
    ['ALB', 'Albania'], ['EST', 'Estonia'], ['LVA', 'Latvia'], ['LTU', 'Lithuania'], ['BLR', 'Belarus'],
    ['UKR', 'Ukraine'], ['MDA', 'Moldova'], ['RUS', 'Russia'], ['CYP', 'Cyprus'], ['MLT', 'Malta'],
    ['GEO', 'Georgia'], ['ARM', 'Armenia'], ['AZE', 'Azerbaijan'], ['NGA', 'Nigeria'], ['GHA', 'Ghana'],
    ['SEN', 'Senegal'], ['MLI', 'Mali'], ['NER', 'Niger'], ['TCD', 'Chad'], ['CMR', 'Cameroon'],
    ['CIV', "Côte d'Ivoire"], ['BFA', 'Burkina Faso'], ['GIN', 'Guinea'], ['BEN', 'Benin'],
    ['TGO', 'Togo'], ['SLE', 'Sierra Leone'], ['LBR', 'Liberia'], ['GMB', 'Gambia'],
    ['GNB', 'Guinea-Bissau'], ['GAB', 'Gabon'], ['COG', 'Republic of the Congo'], ['COD', 'DR Congo'],
    ['CAF', 'Central African Republic'], ['GNQ', 'Equatorial Guinea'], ['ETH', 'Ethiopia'],
    ['ERI', 'Eritrea'], ['KEN', 'Kenya'], ['UGA', 'Uganda'], ['TZA', 'Tanzania'], ['RWA', 'Rwanda'],
    ['BDI', 'Burundi'], ['ZMB', 'Zambia'], ['ZWE', 'Zimbabwe'], ['MWI', 'Malawi'], ['MOZ', 'Mozambique'],
    ['AGO', 'Angola'], ['NAM', 'Namibia'], ['BWA', 'Botswana'], ['ZAF', 'South Africa'],
    ['LSO', 'Lesotho'], ['SWZ', 'Eswatini'], ['MDG', 'Madagascar'], ['MUS', 'Mauritius'],
    ['USA', 'United States'], ['CAN', 'Canada'], ['MEX', 'Mexico'], ['GTM', 'Guatemala'],
    ['HND', 'Honduras'], ['SLV', 'El Salvador'], ['NIC', 'Nicaragua'], ['CRI', 'Costa Rica'],
    ['PAN', 'Panama'], ['CUB', 'Cuba'], ['DOM', 'Dominican Republic'], ['HTI', 'Haiti'],
    ['JAM', 'Jamaica'], ['TTO', 'Trinidad and Tobago'], ['COL', 'Colombia'], ['VEN', 'Venezuela'],
    ['ECU', 'Ecuador'], ['PER', 'Peru'], ['BOL', 'Bolivia'], ['BRA', 'Brazil'], ['PRY', 'Paraguay'],
    ['URY', 'Uruguay'], ['ARG', 'Argentina'], ['CHL', 'Chile'], ['GUY', 'Guyana'], ['SUR', 'Suriname'],
    ['AUS', 'Australia'], ['NZL', 'New Zealand'], ['FJI', 'Fiji'], ['PNG', 'Papua New Guinea'],
    ['SLB', 'Solomon Islands'], ['VUT', 'Vanuatu'], ['WSM', 'Samoa'], ['TON', 'Tonga'],
  ]
);

/** ISO-3 -> ISO-2 for the Nominatim countrycodes hint. */
const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries([
  ['SAU', 'sa'], ['ARE', 'ae'], ['QAT', 'qa'], ['KWT', 'kw'], ['BHR', 'bh'], ['OMN', 'om'],
  ['YEM', 'ye'], ['JOR', 'jo'], ['LBN', 'lb'], ['SYR', 'sy'], ['IRQ', 'iq'], ['PSE', 'ps'],
  ['ISR', 'il'], ['EGY', 'eg'], ['LBY', 'ly'], ['TUN', 'tn'], ['DZA', 'dz'], ['MAR', 'ma'],
  ['SDN', 'sd'], ['SSD', 'ss'], ['MRT', 'mr'], ['SOM', 'so'], ['DJI', 'dj'], ['COM', 'km'],
  ['TUR', 'tr'], ['IRN', 'ir'], ['AFG', 'af'], ['PAK', 'pk'], ['IND', 'in'], ['BGD', 'bd'],
  ['LKA', 'lk'], ['NPL', 'np'], ['BTN', 'bt'], ['MDV', 'mv'], ['CHN', 'cn'], ['JPN', 'jp'],
  ['KOR', 'kr'], ['PRK', 'kp'], ['MNG', 'mn'], ['TWN', 'tw'], ['HKG', 'hk'], ['MYS', 'my'],
  ['SGP', 'sg'], ['IDN', 'id'], ['THA', 'th'], ['VNM', 'vn'], ['PHL', 'ph'], ['MMR', 'mm'],
  ['KHM', 'kh'], ['LAO', 'la'], ['BRN', 'bn'], ['TLS', 'tl'], ['KAZ', 'kz'], ['UZB', 'uz'],
  ['TKM', 'tm'], ['KGZ', 'kg'], ['TJK', 'tj'], ['GBR', 'gb'], ['IRL', 'ie'], ['FRA', 'fr'],
  ['DEU', 'de'], ['ESP', 'es'], ['PRT', 'pt'], ['ITA', 'it'], ['CHE', 'ch'], ['AUT', 'at'],
  ['BEL', 'be'], ['NLD', 'nl'], ['LUX', 'lu'], ['DNK', 'dk'], ['SWE', 'se'], ['NOR', 'no'],
  ['FIN', 'fi'], ['ISL', 'is'], ['POL', 'pl'], ['CZE', 'cz'], ['SVK', 'sk'], ['HUN', 'hu'],
  ['ROU', 'ro'], ['BGR', 'bg'], ['GRC', 'gr'], ['HRV', 'hr'], ['SVN', 'si'], ['SRB', 'rs'],
  ['BIH', 'ba'], ['MNE', 'me'], ['MKD', 'mk'], ['ALB', 'al'], ['EST', 'ee'], ['LVA', 'lv'],
  ['LTU', 'lt'], ['BLR', 'by'], ['UKR', 'ua'], ['MDA', 'md'], ['RUS', 'ru'], ['CYP', 'cy'],
  ['MLT', 'mt'], ['GEO', 'ge'], ['ARM', 'am'], ['AZE', 'az'], ['NGA', 'ng'], ['GHA', 'gh'],
  ['SEN', 'sn'], ['MLI', 'ml'], ['NER', 'ne'], ['TCD', 'td'], ['CMR', 'cm'], ['CIV', 'ci'],
  ['BFA', 'bf'], ['GIN', 'gn'], ['BEN', 'bj'], ['TGO', 'tg'], ['SLE', 'sl'], ['LBR', 'lr'],
  ['GMB', 'gm'], ['GNB', 'gw'], ['GAB', 'ga'], ['COG', 'cg'], ['COD', 'cd'], ['CAF', 'cf'],
  ['GNQ', 'gq'], ['ETH', 'et'], ['ERI', 'er'], ['KEN', 'ke'], ['UGA', 'ug'], ['TZA', 'tz'],
  ['RWA', 'rw'], ['BDI', 'bi'], ['ZMB', 'zm'], ['ZWE', 'zw'], ['MWI', 'mw'], ['MOZ', 'mz'],
  ['AGO', 'ao'], ['NAM', 'na'], ['BWA', 'bw'], ['ZAF', 'za'], ['LSO', 'ls'], ['SWZ', 'sz'],
  ['MDG', 'mg'], ['MUS', 'mu'], ['USA', 'us'], ['CAN', 'ca'], ['MEX', 'mx'], ['GTM', 'gt'],
  ['HND', 'hn'], ['SLV', 'sv'], ['NIC', 'ni'], ['CRI', 'cr'], ['PAN', 'pa'], ['CUB', 'cu'],
  ['DOM', 'do'], ['HTI', 'ht'], ['JAM', 'jm'], ['TTO', 'tt'], ['COL', 'co'], ['VEN', 've'],
  ['ECU', 'ec'], ['PER', 'pe'], ['BOL', 'bo'], ['BRA', 'br'], ['PRY', 'py'], ['URY', 'uy'],
  ['ARG', 'ar'], ['CHL', 'cl'], ['GUY', 'gy'], ['SUR', 'sr'], ['AUS', 'au'], ['NZL', 'nz'],
  ['FJI', 'fj'], ['PNG', 'pg'], ['SLB', 'sb'], ['VUT', 'vu'], ['WSM', 'ws'], ['TON', 'to'],
]);

export interface CountryBboxResult {
  bbox: [number, number, number, number]; // [west, south, east, north]
  source: 'nominatim' | 'offline';
}

/** Normalize Nominatim's [south, north, west, east] to [west, south, east, north]. */
const fromNominatim = (bb: unknown[]): [number, number, number, number] | null => {
  if (!Array.isArray(bb) || bb.length !== 4) return null;
  const [south, north, west, east] = bb.map(parseFloat);
  return [south, north, west, east].every(Number.isFinite) ? [west, south, east, north] : null;
};

/**
 * Fetch the bounding box of a single country for map drill-down.
 * 1) Nominatim with the country's English name + ISO2 countrycode hint.
 * 2) Offline approximate bbox — the map always renders; no hard failure.
 */
export async function fetchCountryBbox(iso3: string, signal?: AbortSignal): Promise<CountryBboxResult> {
  const code = (iso3 || '').toUpperCase();
  const offline = COUNTRY_BBOX_OFFLINE[code];
  const name = ISO3_TO_NAME[code];
  if (!name && !offline) throw new Error(`Unknown country code: ${iso3}`);

  const params = new URLSearchParams({ q: name || code, format: 'json', limit: '1' });
  const iso2 = ISO3_TO_ISO2[code];
  if (iso2) params.set('countrycodes', iso2);

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const results = await res.json();
      const bbox = fromNominatim(results?.[0]?.boundingbox);
      if (bbox) {
        return { bbox, source: 'nominatim' };
      }
    }
  } catch {
    /* fall through to offline */
  }
  if (!offline) throw new Error(`No bounds available for ${iso3}`);
  return { bbox: offline, source: 'offline' };
}
