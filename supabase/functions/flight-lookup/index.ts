// Flight Lookup Edge Function — AirLabs API integration
// Accepts a flight IATA code (e.g. "LX1234") and returns normalized flight data
// Optimized: 1 AirLabs API call per lookup (static maps for airports + airlines)

import { corsHeaders, json } from '../_shared/cors.ts';
import { getUser } from '../_shared/claude.ts';

const AIRLABS_API_KEY = Deno.env.get('AIRLABS_API_KEY') || '';
const AIRLABS_BASE = 'https://airlabs.co/api/v9';

// ─── Static Airport Map (~1000 airports, city + name) ───
// Replaces 2 AirLabs /airports API calls per lookup
const AIRPORT_MAP: Record<string, { city: string; name: string }> = {
  // Schweiz
  ZRH: { city: 'Zürich', name: 'Flughafen Zürich' },
  GVA: { city: 'Genf', name: 'Genève Aéroport' },
  BSL: { city: 'Basel', name: 'EuroAirport Basel-Mulhouse' },
  BRN: { city: 'Bern', name: 'Flughafen Bern-Belp' },
  LUG: { city: 'Lugano', name: 'Aeroporto di Lugano' },

  // Deutschland
  FRA: { city: 'Frankfurt', name: 'Frankfurt Airport' },
  MUC: { city: 'München', name: 'Flughafen München' },
  BER: { city: 'Berlin', name: 'Berlin Brandenburg' },
  DUS: { city: 'Düsseldorf', name: 'Düsseldorf Airport' },
  HAM: { city: 'Hamburg', name: 'Hamburg Airport' },
  CGN: { city: 'Köln', name: 'Köln Bonn Airport' },
  STR: { city: 'Stuttgart', name: 'Flughafen Stuttgart' },
  HAJ: { city: 'Hannover', name: 'Hannover Airport' },
  NUE: { city: 'Nürnberg', name: 'Albrecht Dürer Airport' },
  LEJ: { city: 'Leipzig', name: 'Leipzig/Halle Airport' },

  // Österreich
  VIE: { city: 'Wien', name: 'Wien-Schwechat' },
  SZG: { city: 'Salzburg', name: 'Salzburg Airport' },
  INN: { city: 'Innsbruck', name: 'Innsbruck Airport' },
  GRZ: { city: 'Graz', name: 'Graz Airport' },

  // Frankreich
  CDG: { city: 'Paris', name: 'Charles de Gaulle' },
  ORY: { city: 'Paris', name: 'Paris-Orly' },
  NCE: { city: 'Nizza', name: 'Nice Côte d\'Azur' },
  LYS: { city: 'Lyon', name: 'Lyon-Saint Exupéry' },
  MRS: { city: 'Marseille', name: 'Marseille Provence' },
  TLS: { city: 'Toulouse', name: 'Toulouse-Blagnac' },
  BOD: { city: 'Bordeaux', name: 'Bordeaux-Mérignac' },
  NTE: { city: 'Nantes', name: 'Nantes Atlantique' },
  BIA: { city: 'Bastia', name: 'Bastia-Poretta' },
  AJA: { city: 'Ajaccio', name: 'Ajaccio Napoleon Bonaparte' },

  // Italien
  FCO: { city: 'Rom', name: 'Roma Fiumicino' },
  MXP: { city: 'Mailand', name: 'Milano Malpensa' },
  LIN: { city: 'Mailand', name: 'Milano Linate' },
  VCE: { city: 'Venedig', name: 'Venezia Marco Polo' },
  NAP: { city: 'Neapel', name: 'Napoli Capodichino' },
  BLQ: { city: 'Bologna', name: 'Bologna Guglielmo Marconi' },
  FLR: { city: 'Florenz', name: 'Firenze Peretola' },
  PSA: { city: 'Pisa', name: 'Pisa Galileo Galilei' },
  CTA: { city: 'Catania', name: 'Catania-Fontanarossa' },
  PMO: { city: 'Palermo', name: 'Palermo Falcone Borsellino' },
  CAG: { city: 'Cagliari', name: 'Cagliari-Elmas' },
  OLB: { city: 'Olbia', name: 'Olbia Costa Smeralda' },
  BRI: { city: 'Bari', name: 'Bari Karol Wojtyła' },
  BGY: { city: 'Bergamo', name: 'Milano Bergamo' },

  // Spanien
  MAD: { city: 'Madrid', name: 'Adolfo Suárez Madrid-Barajas' },
  BCN: { city: 'Barcelona', name: 'Barcelona-El Prat' },
  PMI: { city: 'Palma', name: 'Palma de Mallorca' },
  AGP: { city: 'Málaga', name: 'Málaga-Costa del Sol' },
  ALC: { city: 'Alicante', name: 'Alicante-Elche' },
  TFS: { city: 'Teneriffa', name: 'Tenerife Sur' },
  LPA: { city: 'Las Palmas', name: 'Gran Canaria' },
  IBZ: { city: 'Ibiza', name: 'Ibiza Airport' },
  SVQ: { city: 'Sevilla', name: 'Sevilla Airport' },
  VLC: { city: 'Valencia', name: 'Valencia Airport' },
  BIO: { city: 'Bilbao', name: 'Bilbao Airport' },
  FUE: { city: 'Fuerteventura', name: 'Fuerteventura Airport' },
  ACE: { city: 'Lanzarote', name: 'Lanzarote Airport' },

  // Portugal
  LIS: { city: 'Lissabon', name: 'Aeroporto de Lisboa' },
  OPO: { city: 'Porto', name: 'Francisco Sá Carneiro' },
  FAO: { city: 'Faro', name: 'Faro Airport' },
  FNC: { city: 'Funchal', name: 'Madeira Airport' },
  PDL: { city: 'Azoren', name: 'Ponta Delgada' },

  // UK & Irland
  LHR: { city: 'London', name: 'London Heathrow' },
  LGW: { city: 'London', name: 'London Gatwick' },
  STN: { city: 'London', name: 'London Stansted' },
  LTN: { city: 'London', name: 'London Luton' },
  LCY: { city: 'London', name: 'London City' },
  MAN: { city: 'Manchester', name: 'Manchester Airport' },
  EDI: { city: 'Edinburgh', name: 'Edinburgh Airport' },
  BRS: { city: 'Bristol', name: 'Bristol Airport' },
  BHX: { city: 'Birmingham', name: 'Birmingham Airport' },
  DUB: { city: 'Dublin', name: 'Dublin Airport' },

  // Benelux
  AMS: { city: 'Amsterdam', name: 'Amsterdam Schiphol' },
  BRU: { city: 'Brüssel', name: 'Brussels Airport' },
  LUX: { city: 'Luxemburg', name: 'Luxembourg Airport' },

  // Skandinavien
  CPH: { city: 'Kopenhagen', name: 'Copenhagen Airport' },
  OSL: { city: 'Oslo', name: 'Oslo Gardermoen' },
  ARN: { city: 'Stockholm', name: 'Stockholm Arlanda' },
  GOT: { city: 'Göteborg', name: 'Göteborg Landvetter' },
  HEL: { city: 'Helsinki', name: 'Helsinki-Vantaa' },
  BGO: { city: 'Bergen', name: 'Bergen Flesland' },
  KEF: { city: 'Reykjavik', name: 'Keflavík International' },

  // Osteuropa
  PRG: { city: 'Prag', name: 'Václav Havel Airport' },
  WAW: { city: 'Warschau', name: 'Warsaw Chopin' },
  KRK: { city: 'Krakau', name: 'Kraków Airport' },
  BUD: { city: 'Budapest', name: 'Budapest Ferenc Liszt' },
  OTP: { city: 'Bukarest', name: 'Henri Coandă International' },
  SOF: { city: 'Sofia', name: 'Sofia Airport' },
  BEG: { city: 'Belgrad', name: 'Nikola Tesla Airport' },
  ZAG: { city: 'Zagreb', name: 'Zagreb Airport' },
  LJU: { city: 'Ljubljana', name: 'Ljubljana Airport' },
  BTS: { city: 'Bratislava', name: 'Bratislava Airport' },
  TLL: { city: 'Tallinn', name: 'Tallinn Airport' },
  RIX: { city: 'Riga', name: 'Riga International' },
  VNO: { city: 'Vilnius', name: 'Vilnius Airport' },

  // Griechenland
  ATH: { city: 'Athen', name: 'Athens Eleftherios Venizelos' },
  SKG: { city: 'Thessaloniki', name: 'Thessaloniki Airport' },
  HER: { city: 'Heraklion', name: 'Heraklion Airport' },
  RHO: { city: 'Rhodos', name: 'Rhodes Diagoras' },
  CFU: { city: 'Korfu', name: 'Corfu International' },
  JMK: { city: 'Mykonos', name: 'Mykonos Airport' },
  JTR: { city: 'Santorini', name: 'Santorini Airport' },
  KGS: { city: 'Kos', name: 'Kos Airport' },
  ZTH: { city: 'Zakynthos', name: 'Zakynthos Airport' },

  // Kroatien
  DBV: { city: 'Dubrovnik', name: 'Dubrovnik Airport' },
  SPU: { city: 'Split', name: 'Split Airport' },
  PUY: { city: 'Pula', name: 'Pula Airport' },

  // Türkei
  IST: { city: 'Istanbul', name: 'Istanbul Airport' },
  SAW: { city: 'Istanbul', name: 'Istanbul Sabiha Gökçen' },
  AYT: { city: 'Antalya', name: 'Antalya Airport' },
  ADB: { city: 'Izmir', name: 'Izmir Adnan Menderes' },
  DLM: { city: 'Dalaman', name: 'Dalaman Airport' },
  BJV: { city: 'Bodrum', name: 'Milas-Bodrum Airport' },

  // Nordafrika & Naher Osten
  CMN: { city: 'Casablanca', name: 'Mohammed V International' },
  RAK: { city: 'Marrakesch', name: 'Marrakech Menara' },
  TUN: { city: 'Tunis', name: 'Tunis-Carthage' },
  CAI: { city: 'Kairo', name: 'Cairo International' },
  HRG: { city: 'Hurghada', name: 'Hurghada International' },
  SSH: { city: 'Sharm el-Sheikh', name: 'Sharm el-Sheikh' },
  TLV: { city: 'Tel Aviv', name: 'Ben Gurion Airport' },
  AMM: { city: 'Amman', name: 'Queen Alia International' },
  DXB: { city: 'Dubai', name: 'Dubai International' },
  AUH: { city: 'Abu Dhabi', name: 'Abu Dhabi International' },
  DOH: { city: 'Doha', name: 'Hamad International' },
  MCT: { city: 'Muscat', name: 'Muscat International' },
  BAH: { city: 'Bahrain', name: 'Bahrain International' },
  RUH: { city: 'Riad', name: 'King Khalid International' },
  JED: { city: 'Dschidda', name: 'King Abdulaziz' },

  // Asien
  BKK: { city: 'Bangkok', name: 'Suvarnabhumi Airport' },
  HKT: { city: 'Phuket', name: 'Phuket International' },
  CNX: { city: 'Chiang Mai', name: 'Chiang Mai International' },
  SIN: { city: 'Singapur', name: 'Changi Airport' },
  KUL: { city: 'Kuala Lumpur', name: 'Kuala Lumpur International' },
  HKG: { city: 'Hongkong', name: 'Hong Kong International' },
  NRT: { city: 'Tokio', name: 'Narita International' },
  HND: { city: 'Tokio', name: 'Tokyo Haneda' },
  KIX: { city: 'Osaka', name: 'Kansai International' },
  ICN: { city: 'Seoul', name: 'Incheon International' },
  PEK: { city: 'Peking', name: 'Beijing Capital' },
  PVG: { city: 'Shanghai', name: 'Shanghai Pudong' },
  TPE: { city: 'Taipei', name: 'Taiwan Taoyuan' },
  DEL: { city: 'Neu-Delhi', name: 'Indira Gandhi International' },
  BOM: { city: 'Mumbai', name: 'Chhatrapati Shivaji' },
  BLR: { city: 'Bangalore', name: 'Kempegowda International' },
  CMB: { city: 'Colombo', name: 'Bandaranaike International' },
  MLE: { city: 'Malé', name: 'Velana International' },
  DPS: { city: 'Bali', name: 'Ngurah Rai International' },
  CGK: { city: 'Jakarta', name: 'Soekarno-Hatta' },
  MNL: { city: 'Manila', name: 'Ninoy Aquino International' },
  SGN: { city: 'Ho-Chi-Minh-Stadt', name: 'Tan Son Nhat' },
  HAN: { city: 'Hanoi', name: 'Noi Bai International' },
  REP: { city: 'Siem Reap', name: 'Siem Reap International' },
  PNH: { city: 'Phnom Penh', name: 'Phnom Penh International' },
  KTM: { city: 'Kathmandu', name: 'Tribhuvan International' },

  // Afrika
  JNB: { city: 'Johannesburg', name: 'O.R. Tambo International' },
  CPT: { city: 'Kapstadt', name: 'Cape Town International' },
  NBO: { city: 'Nairobi', name: 'Jomo Kenyatta' },
  DAR: { city: 'Dar es Salaam', name: 'Julius Nyerere' },
  JRO: { city: 'Kilimanjaro', name: 'Kilimanjaro International' },
  ZNZ: { city: 'Sansibar', name: 'Abeid Amani Karume' },
  ADD: { city: 'Addis Abeba', name: 'Bole International' },
  MRU: { city: 'Mauritius', name: 'Sir Seewoosagur Ramgoolam' },
  SEZ: { city: 'Mahé', name: 'Seychelles International' },

  // Nordamerika
  JFK: { city: 'New York', name: 'John F. Kennedy' },
  EWR: { city: 'New York', name: 'Newark Liberty' },
  LAX: { city: 'Los Angeles', name: 'Los Angeles International' },
  SFO: { city: 'San Francisco', name: 'San Francisco International' },
  ORD: { city: 'Chicago', name: 'Chicago O\'Hare' },
  MIA: { city: 'Miami', name: 'Miami International' },
  ATL: { city: 'Atlanta', name: 'Hartsfield-Jackson Atlanta' },
  DFW: { city: 'Dallas', name: 'Dallas/Fort Worth' },
  IAD: { city: 'Washington D.C.', name: 'Washington Dulles' },
  BOS: { city: 'Boston', name: 'Boston Logan' },
  SEA: { city: 'Seattle', name: 'Seattle-Tacoma' },
  DEN: { city: 'Denver', name: 'Denver International' },
  LAS: { city: 'Las Vegas', name: 'Harry Reid International' },
  MCO: { city: 'Orlando', name: 'Orlando International' },
  HNL: { city: 'Honolulu', name: 'Daniel K. Inouye' },
  PHX: { city: 'Phoenix', name: 'Phoenix Sky Harbor' },
  IAH: { city: 'Houston', name: 'George Bush Intercontinental' },
  MSP: { city: 'Minneapolis', name: 'Minneapolis-Saint Paul' },
  DTW: { city: 'Detroit', name: 'Detroit Metropolitan' },
  PHL: { city: 'Philadelphia', name: 'Philadelphia International' },
  SAN: { city: 'San Diego', name: 'San Diego International' },
  YYZ: { city: 'Toronto', name: 'Toronto Pearson' },
  YVR: { city: 'Vancouver', name: 'Vancouver International' },
  YUL: { city: 'Montréal', name: 'Montréal-Trudeau' },
  YOW: { city: 'Ottawa', name: 'Ottawa Macdonald-Cartier' },
  YYC: { city: 'Calgary', name: 'Calgary International' },
  MEX: { city: 'Mexiko-Stadt', name: 'Mexico City International' },
  CUN: { city: 'Cancún', name: 'Cancún International' },

  // Karibik & Mittelamerika
  SJO: { city: 'San José', name: 'Juan Santamaría' },
  PTY: { city: 'Panama-Stadt', name: 'Tocumen International' },
  HAV: { city: 'Havanna', name: 'José Martí International' },
  PUJ: { city: 'Punta Cana', name: 'Punta Cana International' },
  MBJ: { city: 'Montego Bay', name: 'Sangster International' },

  // Südamerika
  GRU: { city: 'São Paulo', name: 'São Paulo-Guarulhos' },
  GIG: { city: 'Rio de Janeiro', name: 'Rio de Janeiro-Galeão' },
  EZE: { city: 'Buenos Aires', name: 'Ministro Pistarini' },
  SCL: { city: 'Santiago', name: 'Arturo Merino Benítez' },
  BOG: { city: 'Bogotá', name: 'El Dorado International' },
  LIM: { city: 'Lima', name: 'Jorge Chávez' },
  UIO: { city: 'Quito', name: 'Mariscal Sucre' },

  // Ozeanien
  SYD: { city: 'Sydney', name: 'Sydney Kingsford Smith' },
  MEL: { city: 'Melbourne', name: 'Melbourne Tullamarine' },
  BNE: { city: 'Brisbane', name: 'Brisbane Airport' },
  PER: { city: 'Perth', name: 'Perth Airport' },
  AKL: { city: 'Auckland', name: 'Auckland Airport' },
  CHC: { city: 'Christchurch', name: 'Christchurch Airport' },
  NAN: { city: 'Nadi', name: 'Nadi International' },
  PPT: { city: 'Papeete', name: 'Faa\'a International' },

  // Malta, Zypern
  MLA: { city: 'Malta', name: 'Malta International' },
  LCA: { city: 'Larnaka', name: 'Larnaca International' },
  PFO: { city: 'Paphos', name: 'Paphos International' },

  // Deutschland (weitere)
  DTM: { city: 'Dortmund', name: 'Dortmund Airport' },
  FMM: { city: 'Memmingen', name: 'Memmingen Airport' },
  PAD: { city: 'Paderborn', name: 'Paderborn Lippstadt' },
  FDH: { city: 'Friedrichshafen', name: 'Friedrichshafen Airport' },
  KSF: { city: 'Kassel', name: 'Kassel Airport' },
  BRE: { city: 'Bremen', name: 'Bremen Airport' },
  SCN: { city: 'Saarbrücken', name: 'Saarbrücken Airport' },
  DRS: { city: 'Dresden', name: 'Dresden Airport' },
  RLG: { city: 'Rostock', name: 'Rostock-Laage' },
  ERF: { city: 'Erfurt', name: 'Erfurt-Weimar Airport' },
  SXF: { city: 'Karlsruhe', name: 'Karlsruhe/Baden-Baden' },
  HHN: { city: 'Hahn', name: 'Frankfurt-Hahn' },
  WEZ: { city: 'Weeze', name: 'Weeze Airport' },

  // Österreich (weitere)
  KLU: { city: 'Klagenfurt', name: 'Klagenfurt Airport' },
  LNZ: { city: 'Linz', name: 'Linz Airport' },

  // Frankreich (weitere)
  SXB: { city: 'Strassburg', name: 'Strasbourg Airport' },
  MLH: { city: 'Mulhouse', name: 'Mulhouse Airport' },
  LIL: { city: 'Lille', name: 'Lille Airport' },
  RNS: { city: 'Rennes', name: 'Rennes Airport' },
  MPL: { city: 'Montpellier', name: 'Montpellier Airport' },
  CFE: { city: 'Clermont-Ferrand', name: 'Clermont-Ferrand Airport' },
  PGF: { city: 'Perpignan', name: 'Perpignan Airport' },
  BIQ: { city: 'Biarritz', name: 'Biarritz Airport' },
  FSC: { city: 'Figari', name: 'Figari Airport' },
  CLY: { city: 'Calvi', name: 'Calvi Airport' },
  BVA: { city: 'Paris Beauvais', name: 'Beauvais-Tillé' },
  TLN: { city: 'Toulon', name: 'Toulon-Hyères' },
  BES: { city: 'Brest', name: 'Brest Bretagne' },
  LDE: { city: 'Lourdes', name: 'Lourdes Airport' },
  EGC: { city: 'Bergerac', name: 'Bergerac Airport' },
  LRH: { city: 'La Rochelle', name: 'La Rochelle Airport' },
  PIS: { city: 'Poitiers', name: 'Poitiers Airport' },
  CNG: { city: 'Cognac', name: 'Cognac Airport' },

  // Französische Übersee
  PTP: { city: 'Pointe-à-Pitre', name: 'Pointe-à-Pitre' },
  FDF: { city: 'Fort-de-France', name: 'Aimé Césaire' },
  CAY: { city: 'Cayenne', name: 'Cayenne-Rochambeau' },
  RUN: { city: 'Saint-Denis', name: 'Roland Garros' },
  DZA: { city: 'Dzaoudzi', name: 'Dzaoudzi Airport' },
  NOU: { city: 'Nouméa', name: 'La Tontouta' },
  WLS: { city: 'Wallis', name: 'Wallis Airport' },
  SBH: { city: 'St. Barthélemy', name: 'Gustaf III Airport' },

  // Italien (weitere)
  TRN: { city: 'Turin', name: 'Torino-Caselle' },
  GOA: { city: 'Genua', name: 'Genova Airport' },
  VRN: { city: 'Verona', name: 'Verona Villafranca' },
  TSF: { city: 'Treviso', name: 'Treviso Airport' },
  TRS: { city: 'Triest', name: 'Trieste Airport' },
  AOI: { city: 'Ancona', name: 'Ancona Falconara' },
  PEG: { city: 'Perugia', name: 'Perugia Airport' },
  SUF: { city: 'Lamezia Terme', name: 'Lamezia Terme Airport' },
  REG: { city: 'Reggio Calabria', name: 'Reggio Calabria Airport' },
  BDS: { city: 'Brindisi', name: 'Brindisi Airport' },
  PSR: { city: 'Pescara', name: 'Pescara Airport' },
  AHO: { city: 'Alghero', name: 'Alghero Airport' },
  TPS: { city: 'Trapani', name: 'Trapani Airport' },
  LMP: { city: 'Lampedusa', name: 'Lampedusa Airport' },
  PNL: { city: 'Pantelleria', name: 'Pantelleria Airport' },
  CRV: { city: 'Crotone', name: 'Crotone Airport' },

  // Spanien (weitere)
  GRX: { city: 'Granada', name: 'Granada Airport' },
  SCQ: { city: 'Santiago de Compostela', name: 'Santiago de Compostela' },
  OVD: { city: 'Oviedo', name: 'Asturias Airport' },
  SDR: { city: 'Santander', name: 'Santander Airport' },
  VGO: { city: 'Vigo', name: 'Vigo Airport' },
  REU: { city: 'Reus', name: 'Reus Airport' },
  ZAZ: { city: 'Saragossa', name: 'Zaragoza Airport' },
  LEI: { city: 'Almería', name: 'Almería Airport' },
  MJV: { city: 'Murcia', name: 'Murcia Airport' },
  MAH: { city: 'Menorca', name: 'Menorca Airport' },
  XRY: { city: 'Jerez', name: 'Jerez Airport' },
  TFN: { city: 'Teneriffa Nord', name: 'Tenerife Norte' },
  SPC: { city: 'La Palma', name: 'La Palma Airport' },
  VDE: { city: 'El Hierro', name: 'El Hierro Airport' },
  GMZ: { city: 'La Gomera', name: 'La Gomera Airport' },

  // Portugal (weitere)
  TER: { city: 'Terceira', name: 'Terceira Airport' },
  HOR: { city: 'Horta', name: 'Horta Airport' },
  FLW: { city: 'Flores', name: 'Flores Airport' },
  PXO: { city: 'Porto Santo', name: 'Porto Santo Airport' },

  // UK (weitere)
  GLA: { city: 'Glasgow', name: 'Glasgow Airport' },
  ABZ: { city: 'Aberdeen', name: 'Aberdeen Airport' },
  INV: { city: 'Inverness', name: 'Inverness Airport' },
  NCL: { city: 'Newcastle', name: 'Newcastle Airport' },
  LPL: { city: 'Liverpool', name: 'Liverpool John Lennon' },
  LBA: { city: 'Leeds', name: 'Leeds Bradford' },
  EMA: { city: 'East Midlands', name: 'East Midlands Airport' },
  SOU: { city: 'Southampton', name: 'Southampton Airport' },
  EXT: { city: 'Exeter', name: 'Exeter Airport' },
  CWL: { city: 'Cardiff', name: 'Cardiff Airport' },
  BFS: { city: 'Belfast', name: 'Belfast International' },
  BHD: { city: 'Belfast', name: 'Belfast City Airport' },
  JER: { city: 'Jersey', name: 'Jersey Airport' },
  GCI: { city: 'Guernsey', name: 'Guernsey Airport' },
  IOM: { city: 'Isle of Man', name: 'Isle of Man Airport' },

  // Irland (weitere)
  SNN: { city: 'Shannon', name: 'Shannon Airport' },
  ORK: { city: 'Cork', name: 'Cork Airport' },
  KNO: { city: 'Knock', name: 'Ireland West Airport' },

  // Niederlande (weitere)
  EIN: { city: 'Eindhoven', name: 'Eindhoven Airport' },
  RTM: { city: 'Rotterdam', name: 'Rotterdam The Hague' },
  GRQ: { city: 'Groningen', name: 'Groningen Airport' },
  MST: { city: 'Maastricht', name: 'Maastricht Aachen' },

  // Belgien (weitere)
  CRL: { city: 'Charleroi', name: 'Brussels South Charleroi' },
  OST: { city: 'Ostende', name: 'Ostend-Bruges Airport' },
  ANR: { city: 'Antwerpen', name: 'Antwerp Airport' },
  LGG: { city: 'Lüttich', name: 'Liège Airport' },

  // Skandinavien (weitere)
  TRD: { city: 'Trondheim', name: 'Trondheim Airport' },
  SVG: { city: 'Stavanger', name: 'Stavanger Airport' },
  BOO: { city: 'Bodø', name: 'Bodø Airport' },
  TOS: { city: 'Tromsø', name: 'Tromsø Airport' },
  AES: { city: 'Ålesund', name: 'Ålesund Airport' },
  HAU: { city: 'Haugesund', name: 'Haugesund Airport' },
  KRS: { city: 'Kristiansand', name: 'Kristiansand Airport' },
  EVE: { city: 'Harstad', name: 'Harstad/Narvik Airport' },
  LYR: { city: 'Longyearbyen', name: 'Svalbard Airport' },
  MMX: { city: 'Malmö', name: 'Malmö Airport' },
  LLA: { city: 'Luleå', name: 'Luleå Airport' },
  UME: { city: 'Umeå', name: 'Umeå Airport' },
  VBY: { city: 'Visby', name: 'Visby Airport' },
  KRN: { city: 'Kiruna', name: 'Kiruna Airport' },
  NYO: { city: 'Nyköping', name: 'Stockholm Skavsta' },
  BMA: { city: 'Stockholm', name: 'Stockholm Bromma' },
  AAL: { city: 'Aalborg', name: 'Aalborg Airport' },
  BLL: { city: 'Billund', name: 'Billund Airport' },
  AAR: { city: 'Aarhus', name: 'Aarhus Airport' },
  FAE: { city: 'Färöer', name: 'Vágar Airport' },
  OUL: { city: 'Oulu', name: 'Oulu Airport' },
  TMP: { city: 'Tampere', name: 'Tampere Airport' },
  TKU: { city: 'Turku', name: 'Turku Airport' },
  RVN: { city: 'Rovaniemi', name: 'Rovaniemi Airport' },
  KTT: { city: 'Kittilä', name: 'Kittilä Airport' },
  IVL: { city: 'Ivalo', name: 'Ivalo Airport' },
  KUO: { city: 'Kuopio', name: 'Kuopio Airport' },
  JOE: { city: 'Joensuu', name: 'Joensuu Airport' },
  VAA: { city: 'Vaasa', name: 'Vaasa Airport' },
  MHQ: { city: 'Mariehamn', name: 'Mariehamn Airport' },

  // Griechenland (weitere)
  CHQ: { city: 'Chania', name: 'Chania Airport' },
  EFL: { city: 'Kefalonia', name: 'Kefalonia Airport' },
  PVK: { city: 'Preveza', name: 'Preveza Airport' },
  JSI: { city: 'Skiathos', name: 'Skiathos Airport' },
  SMI: { city: 'Samos', name: 'Samos Airport' },
  JKH: { city: 'Chios', name: 'Chios Airport' },
  KVA: { city: 'Kavala', name: 'Kavala Airport' },
  VOL: { city: 'Volos', name: 'Volos Airport' },
  MJT: { city: 'Lesbos', name: 'Mytilene Airport' },
  LXS: { city: 'Lemnos', name: 'Lemnos Airport' },
  IOA: { city: 'Ioannina', name: 'Ioannina Airport' },
  JNX: { city: 'Naxos', name: 'Naxos Airport' },
  PAS: { city: 'Paros', name: 'Paros Airport' },
  MLO: { city: 'Milos', name: 'Milos Airport' },
  KLX: { city: 'Kalamata', name: 'Kalamata Airport' },
  AOK: { city: 'Karpathos', name: 'Karpathos Airport' },
  JIK: { city: 'Ikaria', name: 'Ikaria Airport' },
  JSH: { city: 'Sitia', name: 'Sitia Airport' },

  // Kroatien (weitere)
  ZAD: { city: 'Zadar', name: 'Zadar Airport' },
  RJK: { city: 'Rijeka', name: 'Rijeka Airport' },
  BWK: { city: 'Brač', name: 'Brač Airport' },
  OSI: { city: 'Osijek', name: 'Osijek Airport' },

  // Osteuropa (weitere)
  GDN: { city: 'Danzig', name: 'Gdańsk Airport' },
  WRO: { city: 'Breslau', name: 'Wrocław Airport' },
  KTW: { city: 'Kattowitz', name: 'Katowice Airport' },
  POZ: { city: 'Posen', name: 'Poznań Airport' },
  RZE: { city: 'Rzeszów', name: 'Rzeszów Airport' },
  SZZ: { city: 'Stettin', name: 'Szczecin Airport' },
  BZG: { city: 'Bydgoszcz', name: 'Bydgoszcz Airport' },
  LUZ: { city: 'Lublin', name: 'Lublin Airport' },
  WMI: { city: 'Warschau', name: 'Warsaw Modlin' },
  DEB: { city: 'Debrecen', name: 'Debrecen Airport' },
  CLJ: { city: 'Klausenburg', name: 'Cluj-Napoca Airport' },
  TSR: { city: 'Temeswar', name: 'Timișoara Airport' },
  IAS: { city: 'Iași', name: 'Iași Airport' },
  SBZ: { city: 'Hermannstadt', name: 'Sibiu Airport' },
  CRA: { city: 'Craiova', name: 'Craiova Airport' },
  SUJ: { city: 'Satu Mare', name: 'Satu Mare Airport' },
  BCM: { city: 'Bacău', name: 'Bacău Airport' },
  TGM: { city: 'Târgu Mureș', name: 'Târgu Mureș Airport' },
  CND: { city: 'Konstanza', name: 'Constanța Airport' },
  BOJ: { city: 'Burgas', name: 'Burgas Airport' },
  VAR: { city: 'Warna', name: 'Varna Airport' },
  PLO: { city: 'Plovdiv', name: 'Plovdiv Airport' },
  NIS: { city: 'Niš', name: 'Niš Airport' },
  TIV: { city: 'Tivat', name: 'Tivat Airport' },
  TGD: { city: 'Podgorica', name: 'Podgorica Airport' },
  PRN: { city: 'Pristina', name: 'Pristina Airport' },
  TIA: { city: 'Tirana', name: 'Tirana Airport' },
  OHD: { city: 'Ohrid', name: 'Ohrid Airport' },
  SKP: { city: 'Skopje', name: 'Skopje Airport' },
  SJJ: { city: 'Sarajewo', name: 'Sarajevo Airport' },
  KSC: { city: 'Kaschau', name: 'Košice Airport' },
  TAT: { city: 'Poprad', name: 'Poprad-Tatry Airport' },

  // Türkei (weitere)
  ESB: { city: 'Ankara', name: 'Ankara Esenboğa' },
  TZX: { city: 'Trabzon', name: 'Trabzon Airport' },
  GZT: { city: 'Gaziantep', name: 'Gaziantep Airport' },
  ASR: { city: 'Kayseri', name: 'Kayseri Airport' },
  NAV: { city: 'Kappadokien', name: 'Nevşehir Airport' },
  VAN: { city: 'Van', name: 'Van Airport' },
  ERZ: { city: 'Erzurum', name: 'Erzurum Airport' },
  DIY: { city: 'Diyarbakır', name: 'Diyarbakır Airport' },
  ADA: { city: 'Adana', name: 'Adana Airport' },
  SZF: { city: 'Samsun', name: 'Samsun Airport' },
  KYA: { city: 'Konya', name: 'Konya Airport' },
  MLX: { city: 'Malatya', name: 'Malatya Airport' },
  EZS: { city: 'Elazığ', name: 'Elazığ Airport' },
  HTY: { city: 'Hatay', name: 'Hatay Airport' },
  GNY: { city: 'Şanlıurfa', name: 'Şanlıurfa Airport' },

  // Russland
  SVO: { city: 'Moskau', name: 'Sheremetyevo' },
  DME: { city: 'Moskau', name: 'Domodedovo' },
  VKO: { city: 'Moskau', name: 'Vnukovo' },
  LED: { city: 'St. Petersburg', name: 'Pulkovo' },
  AER: { city: 'Sotschi', name: 'Sochi Airport' },
  KGD: { city: 'Kaliningrad', name: 'Kaliningrad Airport' },
  SVX: { city: 'Jekaterinburg', name: 'Koltsovo Airport' },
  OVB: { city: 'Nowosibirsk', name: 'Tolmachevo Airport' },
  KZN: { city: 'Kasan', name: 'Kazan Airport' },
  ROV: { city: 'Rostow am Don', name: 'Platov Airport' },
  KRR: { city: 'Krasnodar', name: 'Krasnodar Airport' },
  UFA: { city: 'Ufa', name: 'Ufa Airport' },
  VOG: { city: 'Wolgograd', name: 'Volgograd Airport' },
  GOJ: { city: 'Nischni Nowgorod', name: 'Nizhny Novgorod Airport' },
  MRV: { city: 'Mineralnye Wody', name: 'Mineralnye Vody Airport' },
  KUF: { city: 'Samara', name: 'Samara Airport' },
  VVO: { city: 'Wladiwostok', name: 'Vladivostok Airport' },
  KHV: { city: 'Chabarowsk', name: 'Khabarovsk Airport' },
  IKT: { city: 'Irkutsk', name: 'Irkutsk Airport' },
  KJA: { city: 'Krasnojarsk', name: 'Krasnoyarsk Airport' },
  PEE: { city: 'Perm', name: 'Perm Airport' },
  CEK: { city: 'Tscheljabinsk', name: 'Chelyabinsk Airport' },
  TJM: { city: 'Tjumen', name: 'Tyumen Airport' },
  OMS: { city: 'Omsk', name: 'Omsk Airport' },

  // Zentralasien
  NQZ: { city: 'Astana', name: 'Nursultan Nazarbayev' },
  ALA: { city: 'Almaty', name: 'Almaty International' },
  CIT: { city: 'Schymkent', name: 'Shymkent Airport' },
  AKX: { city: 'Aktobe', name: 'Aktobe Airport' },
  GYD: { city: 'Baku', name: 'Heydar Aliyev Airport' },
  TBS: { city: 'Tiflis', name: 'Tbilisi International' },
  BUS: { city: 'Batumi', name: 'Batumi Airport' },
  KUT: { city: 'Kutaissi', name: 'Kutaisi Airport' },
  EVN: { city: 'Jerewan', name: 'Zvartnots International' },
  TAS: { city: 'Taschkent', name: 'Tashkent International' },
  SKD: { city: 'Samarkand', name: 'Samarkand Airport' },
  BHK: { city: 'Buchara', name: 'Bukhara Airport' },
  FRG: { city: 'Fergana', name: 'Fergana Airport' },
  FRU: { city: 'Bischkek', name: 'Manas International' },
  OSS: { city: 'Osch', name: 'Osh Airport' },
  DYU: { city: 'Duschanbe', name: 'Dushanbe Airport' },
  ASB: { city: 'Aschgabat', name: 'Ashgabat Airport' },
  KBL: { city: 'Kabul', name: 'Kabul Airport' },

  // Ukraine, Belarus, Moldau
  KBP: { city: 'Kiew', name: 'Boryspil International' },
  IEV: { city: 'Kiew', name: 'Kyiv Zhuliany' },
  LWO: { city: 'Lemberg', name: 'Lviv Airport' },
  ODS: { city: 'Odessa', name: 'Odesa Airport' },
  HRK: { city: 'Charkiw', name: 'Kharkiv Airport' },
  MSQ: { city: 'Minsk', name: 'Minsk National Airport' },
  KIV: { city: 'Chișinău', name: 'Chișinău Airport' },

  // Naher Osten (weitere)
  BEY: { city: 'Beirut', name: 'Beirut Airport' },
  KWI: { city: 'Kuwait-Stadt', name: 'Kuwait International' },
  BGW: { city: 'Bagdad', name: 'Baghdad International' },
  EBL: { city: 'Erbil', name: 'Erbil International' },
  BSR: { city: 'Basra', name: 'Basra International' },
  NJF: { city: 'Nadschaf', name: 'Al-Najaf Airport' },
  AQJ: { city: 'Aqaba', name: 'Aqaba Airport' },
  IKA: { city: 'Teheran', name: 'Imam Khomeini' },
  MHD: { city: 'Maschhad', name: 'Mashhad Airport' },
  ISE: { city: 'Isfahan', name: 'Isfahan Airport' },
  SYZ: { city: 'Schiras', name: 'Shiraz Airport' },
  TBZ: { city: 'Täbris', name: 'Tabriz Airport' },
  DAM: { city: 'Damaskus', name: 'Damascus International' },
  SLL: { city: 'Salalah', name: 'Salalah Airport' },
  DMM: { city: 'Dammam', name: 'King Fahd International' },
  MED: { city: 'Medina', name: 'Prince Mohammad Airport' },
  AHB: { city: 'Abha', name: 'Abha Airport' },
  TIF: { city: 'Taif', name: 'Taif Airport' },
  TUU: { city: 'Tabuk', name: 'Tabuk Airport' },
  ELQ: { city: 'Buraidah', name: 'Qassim Airport' },
  SHJ: { city: 'Schardscha', name: 'Sharjah Airport' },
  RKT: { city: 'Ras al-Chaima', name: 'Ras Al Khaimah Airport' },
  DWC: { city: 'Dubai', name: 'Al Maktoum International' },
  SAH: { city: 'Sanaa', name: 'Sanaa Airport' },
  ADE: { city: 'Aden', name: 'Aden Airport' },

  // Südasien
  MAA: { city: 'Chennai', name: 'Chennai International' },
  HYD: { city: 'Hyderabad', name: 'Rajiv Gandhi International' },
  CCU: { city: 'Kalkutta', name: 'Netaji Subhas Chandra Bose' },
  COK: { city: 'Kochi', name: 'Cochin International' },
  GOI: { city: 'Goa', name: 'Goa Airport' },
  AMD: { city: 'Ahmedabad', name: 'Ahmedabad Airport' },
  JAI: { city: 'Jaipur', name: 'Jaipur International' },
  TRV: { city: 'Thiruvananthapuram', name: 'Thiruvananthapuram Airport' },
  PNQ: { city: 'Pune', name: 'Pune Airport' },
  GAU: { city: 'Guwahati', name: 'Guwahati Airport' },
  IXC: { city: 'Chandigarh', name: 'Chandigarh Airport' },
  LKO: { city: 'Lucknow', name: 'Lucknow Airport' },
  SXR: { city: 'Srinagar', name: 'Srinagar Airport' },
  VNS: { city: 'Varanasi', name: 'Varanasi Airport' },
  ATQ: { city: 'Amritsar', name: 'Amritsar Airport' },
  IXE: { city: 'Mangalore', name: 'Mangalore Airport' },
  IXB: { city: 'Bagdogra', name: 'Bagdogra Airport' },
  CCJ: { city: 'Kozhikode', name: 'Calicut Airport' },
  NAG: { city: 'Nagpur', name: 'Nagpur Airport' },
  PAT: { city: 'Patna', name: 'Patna Airport' },
  BBI: { city: 'Bhubaneswar', name: 'Bhubaneswar Airport' },
  IDR: { city: 'Indore', name: 'Indore Airport' },
  RPR: { city: 'Raipur', name: 'Raipur Airport' },
  IXR: { city: 'Ranchi', name: 'Ranchi Airport' },
  ISB: { city: 'Islamabad', name: 'Islamabad International' },
  KHI: { city: 'Karatschi', name: 'Jinnah International' },
  LHE: { city: 'Lahore', name: 'Allama Iqbal International' },
  PEW: { city: 'Peshawar', name: 'Peshawar Airport' },
  MUX: { city: 'Multan', name: 'Multan Airport' },
  SKT: { city: 'Sialkot', name: 'Sialkot Airport' },
  UET: { city: 'Quetta', name: 'Quetta Airport' },
  DAC: { city: 'Dhaka', name: 'Hazrat Shahjalal' },
  CGP: { city: 'Chittagong', name: 'Shah Amanat Airport' },
  RGN: { city: 'Rangun', name: 'Yangon International' },
  MDL: { city: 'Mandalay', name: 'Mandalay International' },
  NYT: { city: 'Naypyidaw', name: 'Naypyidaw Airport' },
  PBH: { city: 'Paro', name: 'Paro Airport' },

  // Südostasien (weitere)
  DMK: { city: 'Bangkok', name: 'Don Mueang Airport' },
  USM: { city: 'Koh Samui', name: 'Koh Samui Airport' },
  KBV: { city: 'Krabi', name: 'Krabi Airport' },
  HDY: { city: 'Hat Yai', name: 'Hat Yai Airport' },
  CEI: { city: 'Chiang Rai', name: 'Chiang Rai Airport' },
  UTP: { city: 'Pattaya', name: 'U-Tapao Airport' },
  UTH: { city: 'Udon Thani', name: 'Udon Thani Airport' },
  LPQ: { city: 'Luang Prabang', name: 'Luang Prabang Airport' },
  VTE: { city: 'Vientiane', name: 'Wattay International' },
  DAD: { city: 'Da Nang', name: 'Da Nang International' },
  CXR: { city: 'Nha Trang', name: 'Cam Ranh Airport' },
  PQC: { city: 'Phú Quốc', name: 'Phu Quoc Airport' },
  HUI: { city: 'Huế', name: 'Phu Bai Airport' },
  DLI: { city: 'Dalat', name: 'Lien Khuong Airport' },
  VCA: { city: 'Cần Thơ', name: 'Can Tho Airport' },
  PEN: { city: 'Penang', name: 'Penang International' },
  LGK: { city: 'Langkawi', name: 'Langkawi Airport' },
  BKI: { city: 'Kota Kinabalu', name: 'Kota Kinabalu Airport' },
  KCH: { city: 'Kuching', name: 'Kuching Airport' },
  JHB: { city: 'Johor Bahru', name: 'Senai Airport' },
  SZB: { city: 'Kuala Lumpur', name: 'Sultan Abdul Aziz Shah' },
  MYY: { city: 'Miri', name: 'Miri Airport' },
  TWU: { city: 'Tawau', name: 'Tawau Airport' },
  IPH: { city: 'Ipoh', name: 'Ipoh Airport' },
  SUB: { city: 'Surabaya', name: 'Juanda International' },
  UPG: { city: 'Makassar', name: 'Hasanuddin Airport' },
  MDC: { city: 'Manado', name: 'Sam Ratulangi Airport' },
  YIA: { city: 'Yogyakarta', name: 'Yogyakarta Airport' },
  BPN: { city: 'Balikpapan', name: 'Sultan Aji Muhammad Sulaiman' },
  PLM: { city: 'Palembang', name: 'Sultan Mahmud Badaruddin II' },
  PDG: { city: 'Padang', name: 'Minangkabau Airport' },
  KNO: { city: 'Medan', name: 'Kualanamu Airport' },
  PKU: { city: 'Pekanbaru', name: 'Sultan Syarif Kasim II' },
  BTJ: { city: 'Banda Aceh', name: 'Sultan Iskandar Muda' },
  LOP: { city: 'Lombok', name: 'Lombok International' },
  SOC: { city: 'Solo', name: 'Adi Soemarmo Airport' },
  SRG: { city: 'Semarang', name: 'Ahmad Yani Airport' },
  BTH: { city: 'Batam', name: 'Hang Nadim Airport' },
  CEB: { city: 'Cebu', name: 'Mactan-Cebu Airport' },
  CRK: { city: 'Clark', name: 'Clark International' },
  DVO: { city: 'Davao', name: 'Davao Airport' },
  ILO: { city: 'Iloilo', name: 'Iloilo Airport' },
  KLO: { city: 'Kalibo', name: 'Kalibo Airport' },
  PPS: { city: 'Puerto Princesa', name: 'Puerto Princesa Airport' },
  TAG: { city: 'Tagbilaran', name: 'Bohol-Panglao Airport' },
  BCD: { city: 'Bacolod', name: 'Bacolod Airport' },
  MPH: { city: 'Boracay', name: 'Caticlan Airport' },
  USU: { city: 'Coron', name: 'Busuanga Airport' },
  SFS: { city: 'Subic Bay', name: 'Subic Bay Airport' },
  BWN: { city: 'Bandar Seri Begawan', name: 'Brunei International' },

  // Ostasien (weitere)
  CTS: { city: 'Sapporo', name: 'New Chitose Airport' },
  FUK: { city: 'Fukuoka', name: 'Fukuoka Airport' },
  NGO: { city: 'Nagoya', name: 'Chubu Centrair' },
  OKA: { city: 'Okinawa', name: 'Naha Airport' },
  KOJ: { city: 'Kagoshima', name: 'Kagoshima Airport' },
  SDJ: { city: 'Sendai', name: 'Sendai Airport' },
  HIJ: { city: 'Hiroshima', name: 'Hiroshima Airport' },
  ITM: { city: 'Osaka', name: 'Itami Airport' },
  TAK: { city: 'Takamatsu', name: 'Takamatsu Airport' },
  MYJ: { city: 'Matsuyama', name: 'Matsuyama Airport' },
  KMJ: { city: 'Kumamoto', name: 'Kumamoto Airport' },
  OIT: { city: 'Oita', name: 'Oita Airport' },
  NGS: { city: 'Nagasaki', name: 'Nagasaki Airport' },
  KMI: { city: 'Miyazaki', name: 'Miyazaki Airport' },
  ISG: { city: 'Ishigaki', name: 'Ishigaki Airport' },
  MMY: { city: 'Miyako', name: 'Miyako Airport' },
  GMP: { city: 'Seoul', name: 'Gimpo International' },
  PUS: { city: 'Busan', name: 'Gimhae International' },
  CJU: { city: 'Jeju', name: 'Jeju International' },
  TAE: { city: 'Daegu', name: 'Daegu Airport' },
  CAN: { city: 'Guangzhou', name: 'Guangzhou Baiyun' },
  SZX: { city: 'Shenzhen', name: 'Shenzhen Baoan' },
  CTU: { city: 'Chengdu', name: 'Chengdu Tianfu' },
  CKG: { city: 'Chongqing', name: 'Chongqing Jiangbei' },
  KMG: { city: 'Kunming', name: 'Kunming Changshui' },
  XIY: { city: 'Xi\'an', name: 'Xi\'an Xianyang' },
  HGH: { city: 'Hangzhou', name: 'Hangzhou Xiaoshan' },
  NKG: { city: 'Nanking', name: 'Nanjing Lukou' },
  WUH: { city: 'Wuhan', name: 'Wuhan Tianhe' },
  XMN: { city: 'Xiamen', name: 'Xiamen Gaoqi' },
  DLC: { city: 'Dalian', name: 'Dalian Zhoushuizi' },
  TSN: { city: 'Tianjin', name: 'Tianjin Binhai' },
  CSX: { city: 'Changsha', name: 'Changsha Huanghua' },
  SHE: { city: 'Shenyang', name: 'Shenyang Taoxian' },
  TAO: { city: 'Qingdao', name: 'Qingdao Jiaodong' },
  HAK: { city: 'Haikou', name: 'Haikou Meilan' },
  SYX: { city: 'Sanya', name: 'Sanya Phoenix' },
  HRB: { city: 'Harbin', name: 'Harbin Taiping' },
  LHW: { city: 'Lanzhou', name: 'Lanzhou Zhongchuan' },
  URC: { city: 'Ürümqi', name: 'Ürümqi Diwopu' },
  NNG: { city: 'Nanning', name: 'Nanning Wuxu' },
  KWE: { city: 'Guiyang', name: 'Guiyang Longdongbao' },
  KWL: { city: 'Guilin', name: 'Guilin Liangjiang' },
  FOC: { city: 'Fuzhou', name: 'Fuzhou Changle' },
  CGO: { city: 'Zhengzhou', name: 'Zhengzhou Xinzheng' },
  TNA: { city: 'Jinan', name: 'Jinan Yaoqiang' },
  SHA: { city: 'Shanghai', name: 'Shanghai Hongqiao' },
  PKX: { city: 'Peking', name: 'Beijing Daxing' },
  LXA: { city: 'Lhasa', name: 'Lhasa Gonggar' },
  MFM: { city: 'Macau', name: 'Macau International' },
  KHH: { city: 'Kaohsiung', name: 'Kaohsiung International' },
  RMQ: { city: 'Taichung', name: 'Taichung Airport' },
  UBN: { city: 'Ulaanbaatar', name: 'Chinggis Khaan' },
  FNJ: { city: 'Pjöngjang', name: 'Pyongyang Airport' },

  // Nordafrika (weitere)
  ALG: { city: 'Algier', name: 'Algier Airport' },
  ORN: { city: 'Oran', name: 'Oran Airport' },
  CZL: { city: 'Constantine', name: 'Constantine Airport' },
  TLM: { city: 'Tlemcen', name: 'Tlemcen Airport' },
  BJA: { city: 'Béjaïa', name: 'Béjaïa Airport' },
  GHA: { city: 'Ghardaïa', name: 'Ghardaïa Airport' },
  TMR: { city: 'Tamanrasset', name: 'Tamanrasset Airport' },
  TIP: { city: 'Tripolis', name: 'Tripoli International' },
  BEN: { city: 'Bengasi', name: 'Benghazi Airport' },
  MIR: { city: 'Monastir', name: 'Monastir Airport' },
  DJE: { city: 'Djerba', name: 'Djerba-Zarzis' },
  SFA: { city: 'Sfax', name: 'Sfax Airport' },
  FEZ: { city: 'Fès', name: 'Fès-Saïss Airport' },
  TNG: { city: 'Tanger', name: 'Tangier Airport' },
  AGA: { city: 'Agadir', name: 'Agadir Al Massira' },
  NDR: { city: 'Nador', name: 'Nador Airport' },
  OJD: { city: 'Oujda', name: 'Oujda Airport' },
  RBA: { city: 'Rabat', name: 'Rabat-Salé Airport' },
  ESU: { city: 'Essaouira', name: 'Essaouira Airport' },
  ERH: { city: 'Errachidia', name: 'Errachidia Airport' },
  OZZ: { city: 'Ouarzazate', name: 'Ouarzazate Airport' },
  LXR: { city: 'Luxor', name: 'Luxor Airport' },
  ASW: { city: 'Assuan', name: 'Aswan Airport' },
  ALY: { city: 'Alexandria', name: 'Alexandria Airport' },
  RMF: { city: 'Marsa Alam', name: 'Marsa Alam Airport' },
  HBE: { city: 'Alexandria', name: 'Borg el Arab Airport' },
  SPX: { city: 'Kairo', name: 'Sphinx International' },

  // Westafrika
  LOS: { city: 'Lagos', name: 'Murtala Muhammed' },
  ABV: { city: 'Abuja', name: 'Nnamdi Azikiwe' },
  PHC: { city: 'Port Harcourt', name: 'Port Harcourt Airport' },
  KAN: { city: 'Kano', name: 'Mallam Aminu Kano' },
  ENU: { city: 'Enugu', name: 'Enugu Airport' },
  ACC: { city: 'Accra', name: 'Kotoka International' },
  DSS: { city: 'Dakar', name: 'Blaise Diagne International' },
  ABJ: { city: 'Abidjan', name: 'Félix-Houphouët-Boigny' },
  OUA: { city: 'Ouagadougou', name: 'Thomas Sankara International' },
  BKO: { city: 'Bamako', name: 'Bamako-Sénou' },
  CKY: { city: 'Conakry', name: 'Conakry Airport' },
  FNA: { city: 'Freetown', name: 'Lungi Airport' },
  ROB: { city: 'Monrovia', name: 'Roberts International' },
  NIM: { city: 'Niamey', name: 'Niamey Airport' },
  LFW: { city: 'Lomé', name: 'Lomé-Tokoin' },
  COO: { city: 'Cotonou', name: 'Cotonou Airport' },
  BJL: { city: 'Banjul', name: 'Banjul Airport' },
  RAI: { city: 'Praia', name: 'Nelson Mandela Airport' },
  SID: { city: 'Sal', name: 'Sal Airport' },
  BVC: { city: 'Boa Vista', name: 'Boa Vista Airport' },
  NKC: { city: 'Nouakchott', name: 'Oumtounsy Airport' },
  OXB: { city: 'Bissau', name: 'Bissau Airport' },

  // Zentralafrika
  DLA: { city: 'Douala', name: 'Douala Airport' },
  NSI: { city: 'Yaoundé', name: 'Yaoundé Nsimalen' },
  LBV: { city: 'Libreville', name: 'Libreville Airport' },
  SSG: { city: 'Malabo', name: 'Malabo Airport' },
  BZV: { city: 'Brazzaville', name: 'Brazzaville Airport' },
  PNR: { city: 'Pointe-Noire', name: 'Pointe-Noire Airport' },
  FIH: { city: 'Kinshasa', name: 'N\'djili Airport' },
  FBM: { city: 'Lubumbashi', name: 'Lubumbashi Airport' },
  NDJ: { city: 'N\'Djamena', name: 'N\'Djamena Airport' },
  BGF: { city: 'Bangui', name: 'Bangui Airport' },
  STP: { city: 'São Tomé', name: 'São Tomé Airport' },

  // Ostafrika (weitere)
  EBB: { city: 'Entebbe', name: 'Entebbe Airport' },
  KGL: { city: 'Kigali', name: 'Kigali Airport' },
  BJM: { city: 'Bujumbura', name: 'Bujumbura Airport' },
  MBA: { city: 'Mombasa', name: 'Moi International' },
  MGQ: { city: 'Mogadischu', name: 'Mogadishu Airport' },
  JIB: { city: 'Dschibuti', name: 'Djibouti Airport' },
  ASM: { city: 'Asmara', name: 'Asmara International' },
  LLW: { city: 'Lilongwe', name: 'Lilongwe Airport' },
  BLZ: { city: 'Blantyre', name: 'Blantyre Airport' },
  LUN: { city: 'Lusaka', name: 'Kenneth Kaunda' },
  LVI: { city: 'Livingstone', name: 'Livingstone Airport' },
  NLA: { city: 'Ndola', name: 'Ndola Airport' },
  HRE: { city: 'Harare', name: 'Harare Airport' },
  VFA: { city: 'Victoria Falls', name: 'Victoria Falls Airport' },
  BUQ: { city: 'Bulawayo', name: 'Bulawayo Airport' },
  MPM: { city: 'Maputo', name: 'Maputo Airport' },
  BEW: { city: 'Beira', name: 'Beira Airport' },
  VXE: { city: 'Vilankulo', name: 'Vilankulo Airport' },
  APL: { city: 'Nampula', name: 'Nampula Airport' },
  TNR: { city: 'Antananarivo', name: 'Ivato Airport' },
  NOS: { city: 'Nosy Be', name: 'Nosy Be Airport' },
  HAH: { city: 'Moroni', name: 'Moroni Airport' },

  // Südliches Afrika (weitere)
  DUR: { city: 'Durban', name: 'King Shaka International' },
  PLZ: { city: 'Gqeberha', name: 'Port Elizabeth Airport' },
  BFN: { city: 'Bloemfontein', name: 'Bloemfontein Airport' },
  ELS: { city: 'East London', name: 'East London Airport' },
  GRJ: { city: 'George', name: 'George Airport' },
  MQP: { city: 'Nelspruit', name: 'Kruger Mpumalanga' },
  WDH: { city: 'Windhoek', name: 'Hosea Kutako International' },
  WVB: { city: 'Walvis Bay', name: 'Walvis Bay Airport' },
  GBE: { city: 'Gaborone', name: 'Sir Seretse Khama' },
  MUN: { city: 'Maun', name: 'Maun Airport' },
  MSU: { city: 'Maseru', name: 'Moshoeshoe I Airport' },
  MTS: { city: 'Manzini', name: 'Matsapha Airport' },
  LAD: { city: 'Luanda', name: 'Luanda Airport' },

  // Indischer Ozean (weitere)
  RRG: { city: 'Rodrigues', name: 'Rodrigues Airport' },
  GAN: { city: 'Addu Atoll', name: 'Gan Airport' },

  // Karibik (weitere)
  BGI: { city: 'Bridgetown', name: 'Grantley Adams' },
  POS: { city: 'Port of Spain', name: 'Piarco International' },
  AUA: { city: 'Aruba', name: 'Queen Beatrix Airport' },
  CUR: { city: 'Curaçao', name: 'Hato International' },
  SXM: { city: 'Sint Maarten', name: 'Princess Juliana' },
  ANU: { city: 'Antigua', name: 'V.C. Bird International' },
  UVF: { city: 'St. Lucia', name: 'Hewanorra International' },
  GND: { city: 'Grenada', name: 'Maurice Bishop' },
  SVD: { city: 'St. Vincent', name: 'Argyle International' },
  DOM: { city: 'Dominica', name: 'Douglas-Charles Airport' },
  SKB: { city: 'St. Kitts', name: 'Robert L. Bradshaw' },
  TAB: { city: 'Tobago', name: 'Tobago Airport' },
  BON: { city: 'Bonaire', name: 'Flamingo Airport' },
  EUX: { city: 'Sint Eustatius', name: 'Roosevelt Airport' },
  SAB: { city: 'Saba', name: 'Juancho Airport' },
  SJU: { city: 'San Juan', name: 'Luis Muñoz Marín' },
  STT: { city: 'St. Thomas', name: 'Cyril E. King Airport' },
  STX: { city: 'St. Croix', name: 'Henry E. Rohlsen' },
  NAS: { city: 'Nassau', name: 'Nassau Airport' },
  FPO: { city: 'Freeport', name: 'Grand Bahama Airport' },
  ELH: { city: 'Eleuthera', name: 'North Eleuthera Airport' },
  MHH: { city: 'Marsh Harbour', name: 'Marsh Harbour Airport' },
  EXU: { city: 'Exuma', name: 'Exuma Airport' },
  GCM: { city: 'Grand Cayman', name: 'Owen Roberts Airport' },
  KIN: { city: 'Kingston', name: 'Norman Manley Airport' },
  SDQ: { city: 'Santo Domingo', name: 'Las Américas' },
  STI: { city: 'Santiago', name: 'Cibao International' },
  PAP: { city: 'Port-au-Prince', name: 'Toussaint Louverture' },
  BDA: { city: 'Bermuda', name: 'Bermuda Airport' },
  PLS: { city: 'Providenciales', name: 'Providenciales Airport' },
  AXA: { city: 'Anguilla', name: 'Clayton J. Lloyd Airport' },
  BQN: { city: 'Aguadilla', name: 'Rafael Hernández Airport' },
  PSE: { city: 'Ponce', name: 'Mercedita Airport' },
  VQS: { city: 'Vieques', name: 'Vieques Airport' },
  EIS: { city: 'Tortola', name: 'Terrance B. Lettsome' },
  VIJ: { city: 'Virgin Gorda', name: 'Virgin Gorda Airport' },
  MNI: { city: 'Montserrat', name: 'John A. Osborne Airport' },

  // Mittelamerika (weitere)
  GUA: { city: 'Guatemala-Stadt', name: 'La Aurora International' },
  BZE: { city: 'Belize City', name: 'Philip Goldson' },
  SPR: { city: 'San Pedro', name: 'San Pedro Airport' },
  SAP: { city: 'San Pedro Sula', name: 'Ramón Villeda Morales' },
  TGU: { city: 'Tegucigalpa', name: 'Toncontín Airport' },
  RTB: { city: 'Roatán', name: 'Roatán Airport' },
  SAL: { city: 'San Salvador', name: 'Monseñor Óscar Romero' },
  MGA: { city: 'Managua', name: 'Managua Airport' },
  LIR: { city: 'Liberia', name: 'Daniel Oduber Quirós' },

  // Mexiko (weitere)
  GDL: { city: 'Guadalajara', name: 'Guadalajara Airport' },
  MTY: { city: 'Monterrey', name: 'Monterrey Airport' },
  TIJ: { city: 'Tijuana', name: 'Tijuana Airport' },
  SJD: { city: 'San José del Cabo', name: 'Los Cabos Airport' },
  PVR: { city: 'Puerto Vallarta', name: 'Puerto Vallarta Airport' },
  MID: { city: 'Mérida', name: 'Mérida Airport' },
  CZM: { city: 'Cozumel', name: 'Cozumel Airport' },
  ACA: { city: 'Acapulco', name: 'Acapulco Airport' },
  OAX: { city: 'Oaxaca', name: 'Oaxaca Airport' },
  HUX: { city: 'Huatulco', name: 'Huatulco Airport' },
  ZIH: { city: 'Ixtapa', name: 'Ixtapa-Zihuatanejo Airport' },
  BJX: { city: 'León', name: 'León/Guanajuato Airport' },
  AGU: { city: 'Aguascalientes', name: 'Aguascalientes Airport' },
  QRO: { city: 'Querétaro', name: 'Querétaro Airport' },
  PBC: { city: 'Puebla', name: 'Puebla Airport' },
  VSA: { city: 'Villahermosa', name: 'Villahermosa Airport' },
  TAP: { city: 'Tapachula', name: 'Tapachula Airport' },
  TGZ: { city: 'Tuxtla Gutiérrez', name: 'Tuxtla Gutiérrez Airport' },
  CME: { city: 'Ciudad del Carmen', name: 'Ciudad del Carmen Airport' },
  CUL: { city: 'Culiacán', name: 'Culiacán Airport' },
  MZT: { city: 'Mazatlán', name: 'Mazatlán Airport' },
  HMO: { city: 'Hermosillo', name: 'Hermosillo Airport' },
  LPZ: { city: 'La Paz', name: 'La Paz Airport' },

  // Südamerika (weitere)
  MDE: { city: 'Medellín', name: 'José María Córdova' },
  CTG: { city: 'Cartagena', name: 'Rafael Núñez' },
  CLO: { city: 'Cali', name: 'Alfonso Bonilla Aragón' },
  BAQ: { city: 'Barranquilla', name: 'Ernesto Cortissoz' },
  SMR: { city: 'Santa Marta', name: 'Simón Bolívar' },
  BGA: { city: 'Bucaramanga', name: 'Palonegro Airport' },
  PEI: { city: 'Pereira', name: 'Pereira Airport' },
  ADZ: { city: 'San Andrés', name: 'San Andrés Airport' },
  GYE: { city: 'Guayaquil', name: 'José Joaquín de Olmedo' },
  GPS: { city: 'Galápagos', name: 'Galápagos Airport' },
  CUE: { city: 'Cuenca', name: 'Cuenca Airport' },
  CCS: { city: 'Caracas', name: 'Simón Bolívar International' },
  MAR: { city: 'Maracaibo', name: 'La Chinita Airport' },
  PMV: { city: 'Isla Margarita', name: 'Isla Margarita Airport' },
  VLN: { city: 'Valencia', name: 'Valencia Airport' },
  CUZ: { city: 'Cusco', name: 'Alejandro Velasco Astete' },
  AQP: { city: 'Arequipa', name: 'Rodríguez Ballón' },
  IQT: { city: 'Iquitos', name: 'Iquitos Airport' },
  JUL: { city: 'Juliaca', name: 'Juliaca Airport' },
  PIU: { city: 'Piura', name: 'Piura Airport' },
  TRU: { city: 'Trujillo', name: 'Trujillo Airport' },
  TCQ: { city: 'Tacna', name: 'Tacna Airport' },
  LPB: { city: 'La Paz', name: 'El Alto International' },
  VVI: { city: 'Santa Cruz', name: 'Viru Viru International' },
  CBB: { city: 'Cochabamba', name: 'Cochabamba Airport' },
  SRE: { city: 'Sucre', name: 'Sucre Airport' },
  ASU: { city: 'Asunción', name: 'Silvio Pettirossi' },
  MVD: { city: 'Montevideo', name: 'Carrasco International' },
  PDP: { city: 'Punta del Este', name: 'Punta del Este Airport' },
  AEP: { city: 'Buenos Aires', name: 'Aeroparque Jorge Newbery' },
  COR: { city: 'Córdoba', name: 'Córdoba Airport' },
  MDZ: { city: 'Mendoza', name: 'Mendoza Airport' },
  BRC: { city: 'Bariloche', name: 'Bariloche Airport' },
  IGR: { city: 'Iguazú', name: 'Iguazú Airport' },
  USH: { city: 'Ushuaia', name: 'Ushuaia Airport' },
  SLA: { city: 'Salta', name: 'Salta Airport' },
  ROS: { city: 'Rosario', name: 'Rosario Airport' },
  TUC: { city: 'Tucumán', name: 'Tucumán Airport' },
  NQN: { city: 'Neuquén', name: 'Neuquén Airport' },
  FTE: { city: 'El Calafate', name: 'El Calafate Airport' },
  REL: { city: 'Trelew', name: 'Trelew Airport' },
  PMC: { city: 'Puerto Montt', name: 'El Tepual Airport' },
  PUQ: { city: 'Punta Arenas', name: 'Punta Arenas Airport' },
  CCP: { city: 'Concepción', name: 'Concepción Airport' },
  IQQ: { city: 'Iquique', name: 'Iquique Airport' },
  ANF: { city: 'Antofagasta', name: 'Antofagasta Airport' },
  ZCO: { city: 'Temuco', name: 'Temuco Airport' },
  IPC: { city: 'Osterinsel', name: 'Osterinsel Airport' },
  CJC: { city: 'Calama', name: 'Calama Airport' },
  LSC: { city: 'La Serena', name: 'La Serena Airport' },
  ZAL: { city: 'Valdivia', name: 'Valdivia Airport' },
  GEO: { city: 'Georgetown', name: 'Cheddi Jagan Airport' },
  PBM: { city: 'Paramaribo', name: 'Paramaribo Airport' },

  // Brasilien (weitere)
  BSB: { city: 'Brasília', name: 'Brasília Airport' },
  CNF: { city: 'Belo Horizonte', name: 'Confins Airport' },
  SSA: { city: 'Salvador', name: 'Salvador Airport' },
  REC: { city: 'Recife', name: 'Recife Airport' },
  FOR: { city: 'Fortaleza', name: 'Fortaleza Airport' },
  POA: { city: 'Porto Alegre', name: 'Porto Alegre Airport' },
  CWB: { city: 'Curitiba', name: 'Curitiba Airport' },
  BEL: { city: 'Belém', name: 'Belém Airport' },
  MAO: { city: 'Manaus', name: 'Manaus Airport' },
  FLN: { city: 'Florianópolis', name: 'Florianópolis Airport' },
  NAT: { city: 'Natal', name: 'Natal Airport' },
  VCP: { city: 'Campinas', name: 'Campinas Airport' },
  CGH: { city: 'São Paulo', name: 'Congonhas Airport' },
  SDU: { city: 'Rio de Janeiro', name: 'Santos Dumont' },
  MCZ: { city: 'Maceió', name: 'Maceió Airport' },
  AJU: { city: 'Aracaju', name: 'Aracaju Airport' },
  SLZ: { city: 'São Luís', name: 'São Luís Airport' },
  THE: { city: 'Teresina', name: 'Teresina Airport' },
  CGB: { city: 'Cuiabá', name: 'Cuiabá Airport' },
  GYN: { city: 'Goiânia', name: 'Goiânia Airport' },
  VIX: { city: 'Vitória', name: 'Vitória Airport' },
  IGU: { city: 'Foz do Iguaçu', name: 'Foz do Iguaçu Airport' },
  JPA: { city: 'João Pessoa', name: 'João Pessoa Airport' },
  FEN: { city: 'Fernando de Noronha', name: 'Fernando de Noronha' },

  // USA (weitere)
  CLT: { city: 'Charlotte', name: 'Charlotte Douglas' },
  BWI: { city: 'Baltimore', name: 'Baltimore/Washington' },
  DCA: { city: 'Washington D.C.', name: 'Reagan National' },
  FLL: { city: 'Fort Lauderdale', name: 'Fort Lauderdale' },
  TPA: { city: 'Tampa', name: 'Tampa International' },
  SLC: { city: 'Salt Lake City', name: 'Salt Lake City International' },
  PDX: { city: 'Portland', name: 'Portland International' },
  STL: { city: 'St. Louis', name: 'St. Louis Lambert' },
  IND: { city: 'Indianapolis', name: 'Indianapolis International' },
  BNA: { city: 'Nashville', name: 'Nashville International' },
  AUS: { city: 'Austin', name: 'Austin-Bergstrom' },
  RDU: { city: 'Raleigh', name: 'Raleigh-Durham' },
  CLE: { city: 'Cleveland', name: 'Cleveland Hopkins' },
  CMH: { city: 'Columbus', name: 'Columbus Airport' },
  MKE: { city: 'Milwaukee', name: 'Milwaukee Airport' },
  SAT: { city: 'San Antonio', name: 'San Antonio International' },
  JAX: { city: 'Jacksonville', name: 'Jacksonville Airport' },
  PIT: { city: 'Pittsburgh', name: 'Pittsburgh International' },
  MEM: { city: 'Memphis', name: 'Memphis International' },
  OMA: { city: 'Omaha', name: 'Omaha Eppley Airfield' },
  MCI: { city: 'Kansas City', name: 'Kansas City International' },
  MSY: { city: 'New Orleans', name: 'New Orleans Airport' },
  RSW: { city: 'Fort Myers', name: 'Southwest Florida' },
  RNO: { city: 'Reno', name: 'Reno-Tahoe International' },
  OAK: { city: 'Oakland', name: 'Oakland International' },
  SJC: { city: 'San José', name: 'San José International' },
  SMF: { city: 'Sacramento', name: 'Sacramento International' },
  ONT: { city: 'Ontario', name: 'Ontario International' },
  BUR: { city: 'Burbank', name: 'Hollywood Burbank' },
  SNA: { city: 'Santa Ana', name: 'John Wayne Airport' },
  ABQ: { city: 'Albuquerque', name: 'Albuquerque Sunport' },
  ELP: { city: 'El Paso', name: 'El Paso International' },
  TUS: { city: 'Tucson', name: 'Tucson International' },
  ANC: { city: 'Anchorage', name: 'Ted Stevens Anchorage' },
  FAI: { city: 'Fairbanks', name: 'Fairbanks International' },
  OGG: { city: 'Maui', name: 'Kahului Airport' },
  KOA: { city: 'Kona', name: 'Kona International' },
  LIH: { city: 'Kauai', name: 'Lihue Airport' },
  ITO: { city: 'Hilo', name: 'Hilo International' },
  BUF: { city: 'Buffalo', name: 'Buffalo Niagara' },
  SYR: { city: 'Syracuse', name: 'Syracuse Airport' },
  ROC: { city: 'Rochester', name: 'Rochester Airport' },
  ALB: { city: 'Albany', name: 'Albany Airport' },
  PVD: { city: 'Providence', name: 'Providence Airport' },
  BDL: { city: 'Hartford', name: 'Hartford Bradley' },
  PWM: { city: 'Portland', name: 'Portland Jetport' },
  BTV: { city: 'Burlington', name: 'Burlington Airport' },
  CVG: { city: 'Cincinnati', name: 'Cincinnati Airport' },
  SDF: { city: 'Louisville', name: 'Louisville Airport' },
  RIC: { city: 'Richmond', name: 'Richmond Airport' },
  ORF: { city: 'Norfolk', name: 'Norfolk International' },
  CHS: { city: 'Charleston', name: 'Charleston Airport' },
  SAV: { city: 'Savannah', name: 'Savannah Airport' },
  PBI: { city: 'West Palm Beach', name: 'Palm Beach International' },
  SRQ: { city: 'Sarasota', name: 'Sarasota Airport' },
  PNS: { city: 'Pensacola', name: 'Pensacola Airport' },
  DSM: { city: 'Des Moines', name: 'Des Moines Airport' },
  ICT: { city: 'Wichita', name: 'Wichita Airport' },
  OKC: { city: 'Oklahoma City', name: 'Oklahoma City Airport' },
  TUL: { city: 'Tulsa', name: 'Tulsa Airport' },
  LIT: { city: 'Little Rock', name: 'Little Rock Airport' },
  BHM: { city: 'Birmingham', name: 'Birmingham Airport' },
  MSN: { city: 'Madison', name: 'Madison Airport' },
  GRR: { city: 'Grand Rapids', name: 'Grand Rapids Airport' },
  BOI: { city: 'Boise', name: 'Boise Airport' },
  GEG: { city: 'Spokane', name: 'Spokane Airport' },
  PSP: { city: 'Palm Springs', name: 'Palm Springs Airport' },
  SBP: { city: 'San Luis Obispo', name: 'San Luis Obispo Airport' },
  MRY: { city: 'Monterey', name: 'Monterey Airport' },
  SBA: { city: 'Santa Barbara', name: 'Santa Barbara Airport' },

  // Kanada (weitere)
  YEG: { city: 'Edmonton', name: 'Edmonton International' },
  YWG: { city: 'Winnipeg', name: 'Winnipeg Airport' },
  YHZ: { city: 'Halifax', name: 'Halifax Stanfield' },
  YQB: { city: 'Québec', name: 'Québec City Airport' },
  YXE: { city: 'Saskatoon', name: 'Saskatoon Airport' },
  YQR: { city: 'Regina', name: 'Regina Airport' },
  YYJ: { city: 'Victoria', name: 'Victoria Airport' },
  YKA: { city: 'Kamloops', name: 'Kamloops Airport' },
  YLW: { city: 'Kelowna', name: 'Kelowna Airport' },
  YXU: { city: 'London', name: 'London Airport' },
  YQT: { city: 'Thunder Bay', name: 'Thunder Bay Airport' },
  YSB: { city: 'Sudbury', name: 'Sudbury Airport' },
  YQM: { city: 'Moncton', name: 'Moncton Airport' },
  YSJ: { city: 'Saint John', name: 'Saint John Airport' },
  YFC: { city: 'Fredericton', name: 'Fredericton Airport' },
  YYT: { city: 'St. John\'s', name: 'St. John\'s Airport' },
  YQY: { city: 'Sydney', name: 'Sydney Airport' },
  YDF: { city: 'Deer Lake', name: 'Deer Lake Airport' },
  YYG: { city: 'Charlottetown', name: 'Charlottetown Airport' },
  YZF: { city: 'Yellowknife', name: 'Yellowknife Airport' },
  YXY: { city: 'Whitehorse', name: 'Whitehorse Airport' },

  // Ozeanien (weitere)
  ADL: { city: 'Adelaide', name: 'Adelaide Airport' },
  CNS: { city: 'Cairns', name: 'Cairns Airport' },
  OOL: { city: 'Gold Coast', name: 'Gold Coast Airport' },
  HBA: { city: 'Hobart', name: 'Hobart Airport' },
  CBR: { city: 'Canberra', name: 'Canberra Airport' },
  DRW: { city: 'Darwin', name: 'Darwin Airport' },
  TSV: { city: 'Townsville', name: 'Townsville Airport' },
  LST: { city: 'Launceston', name: 'Launceston Airport' },
  AVV: { city: 'Geelong', name: 'Avalon Airport' },
  NTL: { city: 'Newcastle', name: 'Newcastle Airport' },
  PPP: { city: 'Whitsundays', name: 'Proserpine Airport' },
  HTI: { city: 'Hamilton Island', name: 'Hamilton Island Airport' },
  BME: { city: 'Broome', name: 'Broome Airport' },
  ASP: { city: 'Alice Springs', name: 'Alice Springs Airport' },
  AYQ: { city: 'Uluru', name: 'Ayers Rock Airport' },
  KTA: { city: 'Karratha', name: 'Karratha Airport' },
  MCY: { city: 'Sunshine Coast', name: 'Sunshine Coast Airport' },
  WLG: { city: 'Wellington', name: 'Wellington Airport' },
  ZQN: { city: 'Queenstown', name: 'Queenstown Airport' },
  DUD: { city: 'Dunedin', name: 'Dunedin Airport' },
  PMR: { city: 'Palmerston North', name: 'Palmerston North Airport' },
  NPL: { city: 'New Plymouth', name: 'New Plymouth Airport' },
  HLZ: { city: 'Hamilton', name: 'Hamilton Airport' },
  TRG: { city: 'Tauranga', name: 'Tauranga Airport' },
  ROT: { city: 'Rotorua', name: 'Rotorua Airport' },
  NSN: { city: 'Nelson', name: 'Nelson Airport' },
  BHE: { city: 'Blenheim', name: 'Blenheim Airport' },
  IVC: { city: 'Invercargill', name: 'Invercargill Airport' },
  NPE: { city: 'Napier', name: 'Napier Airport' },

  // Pazifische Inseln
  BOB: { city: 'Bora Bora', name: 'Bora Bora Airport' },
  MOZ: { city: 'Moorea', name: 'Moorea Airport' },
  RGI: { city: 'Rangiroa', name: 'Rangiroa Airport' },
  RFP: { city: 'Raiatea', name: 'Raiatea Airport' },
  HUH: { city: 'Huahine', name: 'Huahine Airport' },
  FAA: { city: 'Fakarava', name: 'Fakarava Airport' },
  TIH: { city: 'Tikehau', name: 'Tikehau Airport' },
  SUV: { city: 'Suva', name: 'Nausori Airport' },
  APW: { city: 'Apia', name: 'Faleolo Airport' },
  PPG: { city: 'Pago Pago', name: 'Pago Pago Airport' },
  TBU: { city: 'Nuku\'alofa', name: 'Fua\'amotu Airport' },
  RAR: { city: 'Rarotonga', name: 'Rarotonga Airport' },
  AIT: { city: 'Aitutaki', name: 'Aitutaki Airport' },
  VLI: { city: 'Port Vila', name: 'Bauerfield Airport' },
  SON: { city: 'Luganville', name: 'Santo-Pekoa Airport' },
  HIR: { city: 'Honiara', name: 'Honiara Airport' },
  TRW: { city: 'Tarawa', name: 'Bonriki Airport' },
  CXI: { city: 'Kiritimati', name: 'Christmas Island Airport' },
  FUN: { city: 'Funafuti', name: 'Funafuti Airport' },
  IUE: { city: 'Alofi', name: 'Niue Airport' },
  MJN: { city: 'Majuro', name: 'Majuro Airport' },
  KWA: { city: 'Kwajalein', name: 'Kwajalein Airport' },
  ROR: { city: 'Koror', name: 'Roman Tmetuchl Airport' },
  TKK: { city: 'Chuuk', name: 'Chuuk Airport' },
  PNI: { city: 'Pohnpei', name: 'Pohnpei Airport' },
  YAP: { city: 'Yap', name: 'Yap Airport' },
  KSA: { city: 'Kosrae', name: 'Kosrae Airport' },
  WKJ: { city: 'Wallis', name: 'Wallis Island Airport' },
  GUM: { city: 'Guam', name: 'Guam Airport' },
  SPN: { city: 'Saipan', name: 'Saipan Airport' },
  MDY: { city: 'Midway', name: 'Midway Island Airport' },


  // Weitere europäische Inseln
  ACH: { city: 'Altenrhein', name: 'St. Gallen-Altenrhein' },
  SMI: { city: 'Samos', name: 'Samos Airport' },
  GPA: { city: 'Patras', name: 'Patras Airport' },

  // Gibraltar, Andorra
  GIB: { city: 'Gibraltar', name: 'Gibraltar Airport' },
};

// ─── Static Airline Map (~50 common airlines from Swiss perspective) ───
// Replaces missing airline_name from /flight endpoint
const AIRLINE_MAP: Record<string, string> = {
  LX: 'Swiss',
  LH: 'Lufthansa',
  OS: 'Austrian Airlines',
  SN: 'Brussels Airlines',
  EN: 'Air Dolomiti',
  CL: 'Lufthansa CityLine',
  EW: 'Eurowings',
  '4Y': 'Eurowings Discover',
  DE: 'Condor',
  X3: 'TUIfly',
  AB: 'Air Berlin',
  AF: 'Air France',
  BA: 'British Airways',
  IB: 'Iberia',
  AY: 'Finnair',
  SK: 'SAS',
  KL: 'KLM',
  AZ: 'ITA Airways',
  TP: 'TAP Air Portugal',
  TK: 'Turkish Airlines',
  EK: 'Emirates',
  QR: 'Qatar Airways',
  EY: 'Etihad Airways',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  NH: 'ANA',
  JL: 'Japan Airlines',
  UA: 'United Airlines',
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  AC: 'Air Canada',
  QF: 'Qantas',
  NZ: 'Air New Zealand',
  ET: 'Ethiopian Airlines',
  SA: 'South African Airways',
  MS: 'EgyptAir',
  RJ: 'Royal Jordanian',
  SV: 'Saudia',
  AI: 'Air India',
  TG: 'Thai Airways',
  MH: 'Malaysia Airlines',
  GA: 'Garuda Indonesia',
  PR: 'Philippine Airlines',
  VN: 'Vietnam Airlines',
  CZ: 'China Southern',
  MU: 'China Eastern',
  CA: 'Air China',
  BR: 'EVA Air',
  CI: 'China Airlines',
  OZ: 'Asiana Airlines',
  KE: 'Korean Air',
  U2: 'easyJet',
  FR: 'Ryanair',
  W6: 'Wizz Air',
  VY: 'Vueling',
  V7: 'Volotea',
  PC: 'Pegasus Airlines',
  DY: 'Norwegian',
  '6E': 'IndiGo',
  WS: 'WestJet',
  AM: 'Aeroméxico',
  LA: 'LATAM Airlines',
  AV: 'Avianca',
  CM: 'Copa Airlines',
  G3: 'Gol Airlines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  AS: 'Alaska Airlines',
};

// In-memory cache for API fallback airport lookups (exotic airports)
const airportApiCache = new Map<string, { city: string; name: string }>();

// Rate limiting: 20 lookups per minute per user
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  // Clean expired entries on every call to prevent memory leak
  for (const [key, val] of rateLimits) {
    if (now > val.resetAt) rateLimits.delete(key);
  }
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Get airport info: static map first, API fallback for exotic airports
async function getAirportInfo(iata: string): Promise<{ city: string; name: string }> {
  // 1. Static map (no API call)
  if (AIRPORT_MAP[iata]) return AIRPORT_MAP[iata];

  // 2. API cache (from previous lookups in this instance)
  if (airportApiCache.has(iata)) return airportApiCache.get(iata)!;

  // 3. API fallback (only for exotic airports not in our map)
  try {
    const res = await fetch(
      `${AIRLABS_BASE}/airports?iata_code=${iata}&api_key=${AIRLABS_API_KEY}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = await res.json();
      const airport = data?.response?.[0];
      if (airport) {
        const info = { city: airport.city || iata, name: airport.name || iata };
        airportApiCache.set(iata, info);
        return info;
      }
    }
  } catch {
    // Fallback to IATA code
  }
  return { city: iata, name: iata };
}

// Get airline name: static map, then flight data, then null
function getAirlineName(airlineIata: string, flightAirlineName?: string): string | null {
  if (flightAirlineName) return flightAirlineName;
  return AIRLINE_MAP[airlineIata] || null;
}

interface FlightResponse {
  found: boolean;
  flight_iata: string;
  airline_name: string | null;
  airline_iata: string | null;
  dep_airport: string | null;
  dep_city: string | null;
  dep_terminal: string | null;
  dep_gate: string | null;
  arr_airport: string | null;
  arr_city: string | null;
  arr_terminal: string | null;
  arr_gate: string | null;
  dep_time_utc: string | null;
  arr_time_utc: string | null;
  dep_time_local: string | null;
  arr_time_local: string | null;
  duration_min: number | null;
  status: string | null;
  aircraft: string | null;
  dep_delayed: number | null;
  arr_delayed: number | null;
  dep_estimated: string | null;
  arr_estimated: string | null;
  arr_baggage: string | null;
  frozen: boolean;
}

// Replace/set the date portion of a time value, preserving only the time.
// dayOffset handles overnight flights (e.g. arrival = departure + 1 day).
function replaceDate(targetDate: string, timeVal: string | null, dayOffset = 0): string | null {
  if (!timeVal) return null;

  // Extract just the time portion
  let timePart: string;
  if (/^\d{4}-\d{2}-\d{2}/.test(timeVal)) {
    // Full datetime (e.g. "2026-02-26 19:53") — strip the date, keep time
    timePart = timeVal.split(/[T ]/)[1] || timeVal;
  } else {
    // Already time-only (e.g. "19:53")
    timePart = timeVal;
  }

  if (dayOffset === 0) {
    return `${targetDate} ${timePart}`;
  }

  // Apply day offset for overnight arrivals
  const d = new Date(targetDate + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  const offsetDate = d.toISOString().split('T')[0];
  return `${offsetDate} ${timePart}`;
}

// Normalize AirLabs response to our format
// isLive=true means the /flight date matches the requested date (real-time status)
// isLive=false means template data (status always "scheduled")
async function normalizeFlightData(flight: any, flightIata: string, flightDate?: string, isLive = false): Promise<FlightResponse> {
  const depIata = flight.dep_iata || null;
  const arrIata = flight.arr_iata || null;
  const airlineIata = flight.airline_iata || flightIata.replace(/\d+/g, '');

  // Check if airports are in static map (no API call needed)
  const depInMap = depIata && AIRPORT_MAP[depIata];
  const arrInMap = arrIata && AIRPORT_MAP[arrIata];

  // Only call API for airports NOT in static map
  const [depInfo, arrInfo] = await Promise.all([
    depIata
      ? (depInMap ? Promise.resolve(AIRPORT_MAP[depIata]) : getAirportInfo(depIata))
      : Promise.resolve({ city: null as string | null, name: null as string | null }),
    arrIata
      ? (arrInMap ? Promise.resolve(AIRPORT_MAP[arrIata]) : getAirportInfo(arrIata))
      : Promise.resolve({ city: null as string | null, name: null as string | null }),
  ]);

  let depTimeLocal = flight.dep_time || null;
  let arrTimeLocal = flight.arr_time || null;
  let depTimeUtc = flight.dep_time_utc || flight.dep_time || null;
  let arrTimeUtc = flight.arr_time_utc || flight.arr_time || null;

  // Replace API dates with user's requested date (API returns "today" dates)
  if (flightDate && /^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
    // Calculate day offset between dep→arr (for overnight flights)
    const origDepDate = depTimeLocal?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const origArrDate = arrTimeLocal?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    let arrDayOffset = 0;
    if (origDepDate && origArrDate && origDepDate !== origArrDate) {
      arrDayOffset = Math.round(
        (new Date(origArrDate + 'T00:00:00').getTime() - new Date(origDepDate + 'T00:00:00').getTime()) / (24 * 60 * 60_000)
      );
    }

    depTimeLocal = replaceDate(flightDate, depTimeLocal);
    arrTimeLocal = replaceDate(flightDate, arrTimeLocal, arrDayOffset);
    depTimeUtc = replaceDate(flightDate, depTimeUtc);
    arrTimeUtc = replaceDate(flightDate, arrTimeUtc, arrDayOffset);
  }

  // Delay fields (only meaningful for live data)
  const depDelayed = isLive ? (flight.dep_delayed ?? null) : null;
  const arrDelayed = isLive ? (flight.arr_delayed ?? null) : null;
  const depEstimated = isLive ? (flight.dep_estimated || null) : null;
  const arrEstimated = isLive ? (flight.arr_estimated || null) : null;
  const arrBaggage = isLive ? (flight.arr_baggage || null) : null;
  const status = isLive ? (flight.status || flight.flight_status || 'scheduled') : 'scheduled';

  // Freeze: flight is past arrival → final status, no more updates needed
  const frozen = status === 'landed' || status === 'cancelled';

  return {
    found: true,
    flight_iata: flight.flight_iata || flightIata,
    airline_name: getAirlineName(airlineIata, flight.airline_name),
    airline_iata: airlineIata,
    dep_airport: depIata,
    dep_city: depInfo.city,
    dep_terminal: flight.dep_terminal || null,
    dep_gate: flight.dep_gate || null,
    arr_airport: arrIata,
    arr_city: arrInfo.city,
    arr_terminal: flight.arr_terminal || null,
    arr_gate: flight.arr_gate || null,
    dep_time_utc: depTimeUtc,
    arr_time_utc: arrTimeUtc,
    dep_time_local: depTimeLocal,
    arr_time_local: arrTimeLocal,
    duration_min: flight.duration || null,
    status,
    aircraft: flight.aircraft_icao || null,
    dep_delayed: depDelayed,
    arr_delayed: arrDelayed,
    dep_estimated: depEstimated,
    arr_estimated: arrEstimated,
    arr_baggage: arrBaggage,
    frozen,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, origin, 401);

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, origin, 429);
    }

    if (!AIRLABS_API_KEY) {
      return json({ error: 'Flight-Service nicht konfiguriert' }, origin, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { mode, flight_iata, flight_date, dep_iata, arr_iata } = body;

    // ─── Route Search Mode: find all flights between two airports ───
    if (mode === 'route_search') {
      if (!dep_iata || !arr_iata || typeof dep_iata !== 'string' || typeof arr_iata !== 'string') {
        return json({ error: 'dep_iata und arr_iata erforderlich' }, origin, 400);
      }
      const depNorm = dep_iata.toUpperCase().trim();
      const arrNorm = arr_iata.toUpperCase().trim();
      if (!/^[A-Z]{3}$/.test(depNorm) || !/^[A-Z]{3}$/.test(arrNorm)) {
        return json({ error: 'Ungültiger IATA-Code (3 Buchstaben)' }, origin, 400);
      }

      try {
        const routeRes = await fetch(
          `${AIRLABS_BASE}/routes?dep_iata=${depNorm}&arr_iata=${arrNorm}&api_key=${AIRLABS_API_KEY}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!routeRes.ok) {
          return json({ error: 'Routensuche fehlgeschlagen' }, origin, 502);
        }
        const routeData = await routeRes.json();
        const flights = routeData?.response || [];

        // Normalize and deduplicate by flight_iata
        const seen = new Set<string>();
        const routes = flights
          .filter((f: any) => {
            const iata = f.flight_iata;
            if (!iata || seen.has(iata)) return false;
            seen.add(iata);
            return true;
          })
          .slice(0, 30)
          .map((f: any) => ({
            flight_iata: f.flight_iata,
            airline_iata: f.airline_iata || null,
            airline_name: f.airline_name || (f.airline_iata ? AIRLINE_MAP[f.airline_iata] : null) || null,
            dep_time: f.dep_time || null,
            arr_time: f.arr_time || null,
            duration: f.duration || null,
            days: f.days || [],
          }));

        return json({ routes, dep_iata: depNorm, arr_iata: arrNorm }, origin);
      } catch (e) {
        console.error('AirLabs /routes error:', e);
        return json({ error: 'Routensuche fehlgeschlagen' }, origin, 502);
      }
    }

    // ─── Single Flight Lookup Mode (default) ───
    if (!flight_iata || typeof flight_iata !== 'string') {
      return json({ error: 'flight_iata erforderlich' }, origin, 400);
    }

    // Validate IATA format: 2 letters + 1-5 digits
    const normalized = flight_iata.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9]{2}\d{1,5}$/.test(normalized)) {
      return json({ error: 'Ungültiges Flugnummern-Format (z.B. LX1234)' }, origin, 400);
    }

    // Validate flight_date if provided (YYYY-MM-DD)
    const dateParam = (typeof flight_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(flight_date))
      ? flight_date : undefined;

    // Build candidate flight numbers: original + zero-padded variant
    const candidates = [normalized];
    const airlinePrefix = normalized.replace(/\d+$/, '');
    const flightNum = normalized.replace(/^[A-Z0-9]{2}/, '');
    if (flightNum.length < 4) {
      candidates.push(airlinePrefix + flightNum.padStart(4, '0'));
    }

    // Determine if today's date for live status check
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = dateParam === todayStr;

    let flightData: any = null;
    let isLiveData = false;
    let matchedIata = normalized;

    for (const candidate of candidates) {
      // Call /flight endpoint (1 API call)
      try {
        const flightRes = await fetch(
          `${AIRLABS_BASE}/flight?flight_iata=${candidate}&api_key=${AIRLABS_API_KEY}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (flightRes.ok) {
          const data = await flightRes.json();
          if (data?.response) {
            // Got flight data from API
            matchedIata = candidate;

            if (isToday) {
              // Requested date is today → check if API date matches for live status
              const depTime = data.response.dep_time || data.response.dep_time_utc || '';
              if (depTime.startsWith(todayStr)) {
                flightData = data.response;
                isLiveData = true;
              } else {
                // API returned different date — use as template
                flightData = data.response;
                isLiveData = false;
              }
            } else {
              // Not today → always template data (status = "scheduled")
              flightData = data.response;
              isLiveData = false;
            }
            break; // Got data, no need to try zero-padded variant
          }
        }
      } catch {
        // /flight failed for this candidate, try next
      }
    }

    if (!flightData) {
      return json({
        found: false,
        flight_iata: normalized,
        error: 'Flug nicht gefunden. Prüfe die Flugnummer oder versuche es später erneut.',
      }, origin);
    }

    const result = await normalizeFlightData(flightData, normalized, dateParam, isLiveData);
    // Ensure the original flight number is returned (not the zero-padded variant)
    result.flight_iata = normalized;
    return json(result, origin);
  } catch (e) {
    console.error('flight-lookup error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }, origin, 500);
  }
});
