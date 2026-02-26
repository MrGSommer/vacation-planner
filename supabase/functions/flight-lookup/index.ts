// Flight Lookup Edge Function — AirLabs API integration
// Accepts a flight IATA code (e.g. "LX1234") and returns normalized flight data
// Optimized: 1 AirLabs API call per lookup (static maps for airports + airlines)

import { corsHeaders, json } from '../_shared/cors.ts';
import { getUser } from '../_shared/claude.ts';

const AIRLABS_API_KEY = Deno.env.get('AIRLABS_API_KEY') || '';
const AIRLABS_BASE = 'https://airlabs.co/api/v9';

// ─── Static Airport Map (~250 airports, city + name) ───
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
    // Live data: use real status. Template data: always "scheduled"
    status: isLive ? (flight.status || flight.flight_status || 'scheduled') : 'scheduled',
    aircraft: flight.aircraft_icao || null,
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

      console.log(`flight-lookup route: ${depNorm} → ${arrNorm}`);

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

    console.log(`flight-lookup: candidates=${candidates.join(',')}, date: ${dateParam || 'none'}`);

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
