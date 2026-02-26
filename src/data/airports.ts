export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
}

// Major airports worldwide — focused on Swiss traveler needs
// ~250 airports, ~25KB, searched client-side (no API call)
const AIRPORTS: Airport[] = [
  // --- Schweiz ---
  { iata: 'ZRH', name: 'Flughafen Zürich', city: 'Zürich', country: 'CH' },
  { iata: 'GVA', name: 'Genève Aéroport', city: 'Genf', country: 'CH' },
  { iata: 'BSL', name: 'EuroAirport Basel-Mulhouse', city: 'Basel', country: 'CH' },
  { iata: 'BRN', name: 'Flughafen Bern-Belp', city: 'Bern', country: 'CH' },
  { iata: 'LUG', name: 'Aeroporto di Lugano', city: 'Lugano', country: 'CH' },
  // --- Deutschland ---
  { iata: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE' },
  { iata: 'MUC', name: 'Flughafen München', city: 'München', country: 'DE' },
  { iata: 'BER', name: 'Berlin Brandenburg', city: 'Berlin', country: 'DE' },
  { iata: 'DUS', name: 'Düsseldorf Airport', city: 'Düsseldorf', country: 'DE' },
  { iata: 'HAM', name: 'Hamburg Airport', city: 'Hamburg', country: 'DE' },
  { iata: 'CGN', name: 'Köln Bonn Airport', city: 'Köln', country: 'DE' },
  { iata: 'STR', name: 'Flughafen Stuttgart', city: 'Stuttgart', country: 'DE' },
  { iata: 'HAJ', name: 'Hannover Airport', city: 'Hannover', country: 'DE' },
  { iata: 'NUE', name: 'Albrecht Dürer Airport', city: 'Nürnberg', country: 'DE' },
  { iata: 'LEJ', name: 'Leipzig/Halle Airport', city: 'Leipzig', country: 'DE' },
  // --- Österreich ---
  { iata: 'VIE', name: 'Wien-Schwechat', city: 'Wien', country: 'AT' },
  { iata: 'SZG', name: 'Salzburg Airport', city: 'Salzburg', country: 'AT' },
  { iata: 'INN', name: 'Innsbruck Airport', city: 'Innsbruck', country: 'AT' },
  { iata: 'GRZ', name: 'Graz Airport', city: 'Graz', country: 'AT' },
  // --- Frankreich ---
  { iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'FR' },
  { iata: 'ORY', name: 'Paris-Orly', city: 'Paris', country: 'FR' },
  { iata: 'NCE', name: 'Nice Côte d\'Azur', city: 'Nizza', country: 'FR' },
  { iata: 'LYS', name: 'Lyon-Saint Exupéry', city: 'Lyon', country: 'FR' },
  { iata: 'MRS', name: 'Marseille Provence', city: 'Marseille', country: 'FR' },
  { iata: 'TLS', name: 'Toulouse-Blagnac', city: 'Toulouse', country: 'FR' },
  { iata: 'BOD', name: 'Bordeaux-Mérignac', city: 'Bordeaux', country: 'FR' },
  { iata: 'NTE', name: 'Nantes Atlantique', city: 'Nantes', country: 'FR' },
  { iata: 'BIA', name: 'Bastia-Poretta', city: 'Bastia', country: 'FR' },
  { iata: 'AJA', name: 'Ajaccio Napoleon Bonaparte', city: 'Ajaccio', country: 'FR' },
  // --- Italien ---
  { iata: 'FCO', name: 'Roma Fiumicino', city: 'Rom', country: 'IT' },
  { iata: 'MXP', name: 'Milano Malpensa', city: 'Mailand', country: 'IT' },
  { iata: 'LIN', name: 'Milano Linate', city: 'Mailand', country: 'IT' },
  { iata: 'VCE', name: 'Venezia Marco Polo', city: 'Venedig', country: 'IT' },
  { iata: 'NAP', name: 'Napoli Capodichino', city: 'Neapel', country: 'IT' },
  { iata: 'BLQ', name: 'Bologna Guglielmo Marconi', city: 'Bologna', country: 'IT' },
  { iata: 'FLR', name: 'Firenze Peretola', city: 'Florenz', country: 'IT' },
  { iata: 'PSA', name: 'Pisa Galileo Galilei', city: 'Pisa', country: 'IT' },
  { iata: 'CTA', name: 'Catania-Fontanarossa', city: 'Catania', country: 'IT' },
  { iata: 'PMO', name: 'Palermo Falcone Borsellino', city: 'Palermo', country: 'IT' },
  { iata: 'CAG', name: 'Cagliari-Elmas', city: 'Cagliari', country: 'IT' },
  { iata: 'OLB', name: 'Olbia Costa Smeralda', city: 'Olbia', country: 'IT' },
  { iata: 'BRI', name: 'Bari Karol Wojtyła', city: 'Bari', country: 'IT' },
  { iata: 'BGY', name: 'Milano Bergamo', city: 'Bergamo', country: 'IT' },
  // --- Spanien ---
  { iata: 'MAD', name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'ES' },
  { iata: 'BCN', name: 'Barcelona-El Prat', city: 'Barcelona', country: 'ES' },
  { iata: 'PMI', name: 'Palma de Mallorca', city: 'Palma', country: 'ES' },
  { iata: 'AGP', name: 'Málaga-Costa del Sol', city: 'Málaga', country: 'ES' },
  { iata: 'ALC', name: 'Alicante-Elche', city: 'Alicante', country: 'ES' },
  { iata: 'TFS', name: 'Tenerife Sur', city: 'Teneriffa', country: 'ES' },
  { iata: 'LPA', name: 'Gran Canaria', city: 'Las Palmas', country: 'ES' },
  { iata: 'IBZ', name: 'Ibiza Airport', city: 'Ibiza', country: 'ES' },
  { iata: 'SVQ', name: 'Sevilla Airport', city: 'Sevilla', country: 'ES' },
  { iata: 'VLC', name: 'Valencia Airport', city: 'Valencia', country: 'ES' },
  { iata: 'BIO', name: 'Bilbao Airport', city: 'Bilbao', country: 'ES' },
  { iata: 'FUE', name: 'Fuerteventura Airport', city: 'Fuerteventura', country: 'ES' },
  { iata: 'ACE', name: 'Lanzarote Airport', city: 'Lanzarote', country: 'ES' },
  // --- Portugal ---
  { iata: 'LIS', name: 'Aeroporto de Lisboa', city: 'Lissabon', country: 'PT' },
  { iata: 'OPO', name: 'Francisco Sá Carneiro', city: 'Porto', country: 'PT' },
  { iata: 'FAO', name: 'Faro Airport', city: 'Faro', country: 'PT' },
  { iata: 'FNC', name: 'Madeira Airport', city: 'Funchal', country: 'PT' },
  { iata: 'PDL', name: 'Ponta Delgada', city: 'Azoren', country: 'PT' },
  // --- UK & Irland ---
  { iata: 'LHR', name: 'London Heathrow', city: 'London', country: 'GB' },
  { iata: 'LGW', name: 'London Gatwick', city: 'London', country: 'GB' },
  { iata: 'STN', name: 'London Stansted', city: 'London', country: 'GB' },
  { iata: 'LTN', name: 'London Luton', city: 'London', country: 'GB' },
  { iata: 'LCY', name: 'London City', city: 'London', country: 'GB' },
  { iata: 'MAN', name: 'Manchester Airport', city: 'Manchester', country: 'GB' },
  { iata: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', country: 'GB' },
  { iata: 'BRS', name: 'Bristol Airport', city: 'Bristol', country: 'GB' },
  { iata: 'BHX', name: 'Birmingham Airport', city: 'Birmingham', country: 'GB' },
  { iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'IE' },
  // --- Benelux ---
  { iata: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'NL' },
  { iata: 'BRU', name: 'Brussels Airport', city: 'Brüssel', country: 'BE' },
  { iata: 'LUX', name: 'Luxembourg Airport', city: 'Luxemburg', country: 'LU' },
  // --- Skandinavien ---
  { iata: 'CPH', name: 'Copenhagen Airport', city: 'Kopenhagen', country: 'DK' },
  { iata: 'OSL', name: 'Oslo Gardermoen', city: 'Oslo', country: 'NO' },
  { iata: 'ARN', name: 'Stockholm Arlanda', city: 'Stockholm', country: 'SE' },
  { iata: 'GOT', name: 'Göteborg Landvetter', city: 'Göteborg', country: 'SE' },
  { iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'FI' },
  { iata: 'BGO', name: 'Bergen Flesland', city: 'Bergen', country: 'NO' },
  { iata: 'KEF', name: 'Keflavík International', city: 'Reykjavik', country: 'IS' },
  // --- Osteuropa ---
  { iata: 'PRG', name: 'Václav Havel Airport', city: 'Prag', country: 'CZ' },
  { iata: 'WAW', name: 'Warsaw Chopin', city: 'Warschau', country: 'PL' },
  { iata: 'KRK', name: 'Kraków Airport', city: 'Krakau', country: 'PL' },
  { iata: 'BUD', name: 'Budapest Ferenc Liszt', city: 'Budapest', country: 'HU' },
  { iata: 'OTP', name: 'Henri Coandă International', city: 'Bukarest', country: 'RO' },
  { iata: 'SOF', name: 'Sofia Airport', city: 'Sofia', country: 'BG' },
  { iata: 'BEG', name: 'Nikola Tesla Airport', city: 'Belgrad', country: 'RS' },
  { iata: 'ZAG', name: 'Zagreb Airport', city: 'Zagreb', country: 'HR' },
  { iata: 'LJU', name: 'Ljubljana Airport', city: 'Ljubljana', country: 'SI' },
  { iata: 'BTS', name: 'Bratislava Airport', city: 'Bratislava', country: 'SK' },
  { iata: 'TLL', name: 'Tallinn Airport', city: 'Tallinn', country: 'EE' },
  { iata: 'RIX', name: 'Riga International', city: 'Riga', country: 'LV' },
  { iata: 'VNO', name: 'Vilnius Airport', city: 'Vilnius', country: 'LT' },
  // --- Griechenland ---
  { iata: 'ATH', name: 'Athens Eleftherios Venizelos', city: 'Athen', country: 'GR' },
  { iata: 'SKG', name: 'Thessaloniki Airport', city: 'Thessaloniki', country: 'GR' },
  { iata: 'HER', name: 'Heraklion Airport', city: 'Heraklion', country: 'GR' },
  { iata: 'RHO', name: 'Rhodes Diagoras', city: 'Rhodos', country: 'GR' },
  { iata: 'CFU', name: 'Corfu International', city: 'Korfu', country: 'GR' },
  { iata: 'JMK', name: 'Mykonos Airport', city: 'Mykonos', country: 'GR' },
  { iata: 'JTR', name: 'Santorini Airport', city: 'Santorini', country: 'GR' },
  { iata: 'KGS', name: 'Kos Airport', city: 'Kos', country: 'GR' },
  { iata: 'ZTH', name: 'Zakynthos Airport', city: 'Zakynthos', country: 'GR' },
  // --- Kroatien ---
  { iata: 'DBV', name: 'Dubrovnik Airport', city: 'Dubrovnik', country: 'HR' },
  { iata: 'SPU', name: 'Split Airport', city: 'Split', country: 'HR' },
  { iata: 'PUY', name: 'Pula Airport', city: 'Pula', country: 'HR' },
  // --- Türkei ---
  { iata: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'TR' },
  { iata: 'SAW', name: 'Istanbul Sabiha Gökçen', city: 'Istanbul', country: 'TR' },
  { iata: 'AYT', name: 'Antalya Airport', city: 'Antalya', country: 'TR' },
  { iata: 'ADB', name: 'Izmir Adnan Menderes', city: 'Izmir', country: 'TR' },
  { iata: 'DLM', name: 'Dalaman Airport', city: 'Dalaman', country: 'TR' },
  { iata: 'BJV', name: 'Milas-Bodrum Airport', city: 'Bodrum', country: 'TR' },
  // --- Nordafrika & Naher Osten ---
  { iata: 'CMN', name: 'Mohammed V International', city: 'Casablanca', country: 'MA' },
  { iata: 'RAK', name: 'Marrakech Menara', city: 'Marrakesch', country: 'MA' },
  { iata: 'TUN', name: 'Tunis-Carthage', city: 'Tunis', country: 'TN' },
  { iata: 'CAI', name: 'Cairo International', city: 'Kairo', country: 'EG' },
  { iata: 'HRG', name: 'Hurghada International', city: 'Hurghada', country: 'EG' },
  { iata: 'SSH', name: 'Sharm el-Sheikh', city: 'Sharm el-Sheikh', country: 'EG' },
  { iata: 'TLV', name: 'Ben Gurion Airport', city: 'Tel Aviv', country: 'IL' },
  { iata: 'AMM', name: 'Queen Alia International', city: 'Amman', country: 'JO' },
  { iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'AE' },
  { iata: 'AUH', name: 'Abu Dhabi International', city: 'Abu Dhabi', country: 'AE' },
  { iata: 'DOH', name: 'Hamad International', city: 'Doha', country: 'QA' },
  { iata: 'MCT', name: 'Muscat International', city: 'Muscat', country: 'OM' },
  { iata: 'BAH', name: 'Bahrain International', city: 'Bahrain', country: 'BH' },
  { iata: 'RUH', name: 'King Khalid International', city: 'Riad', country: 'SA' },
  { iata: 'JED', name: 'King Abdulaziz', city: 'Dschidda', country: 'SA' },
  // --- Asien ---
  { iata: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'TH' },
  { iata: 'HKT', name: 'Phuket International', city: 'Phuket', country: 'TH' },
  { iata: 'CNX', name: 'Chiang Mai International', city: 'Chiang Mai', country: 'TH' },
  { iata: 'SIN', name: 'Changi Airport', city: 'Singapur', country: 'SG' },
  { iata: 'KUL', name: 'Kuala Lumpur International', city: 'Kuala Lumpur', country: 'MY' },
  { iata: 'HKG', name: 'Hong Kong International', city: 'Hongkong', country: 'HK' },
  { iata: 'NRT', name: 'Narita International', city: 'Tokio', country: 'JP' },
  { iata: 'HND', name: 'Tokyo Haneda', city: 'Tokio', country: 'JP' },
  { iata: 'KIX', name: 'Kansai International', city: 'Osaka', country: 'JP' },
  { iata: 'ICN', name: 'Incheon International', city: 'Seoul', country: 'KR' },
  { iata: 'PEK', name: 'Beijing Capital', city: 'Peking', country: 'CN' },
  { iata: 'PVG', name: 'Shanghai Pudong', city: 'Shanghai', country: 'CN' },
  { iata: 'TPE', name: 'Taiwan Taoyuan', city: 'Taipei', country: 'TW' },
  { iata: 'DEL', name: 'Indira Gandhi International', city: 'Neu-Delhi', country: 'IN' },
  { iata: 'BOM', name: 'Chhatrapati Shivaji', city: 'Mumbai', country: 'IN' },
  { iata: 'BLR', name: 'Kempegowda International', city: 'Bangalore', country: 'IN' },
  { iata: 'CMB', name: 'Bandaranaike International', city: 'Colombo', country: 'LK' },
  { iata: 'MLE', name: 'Velana International', city: 'Malé', country: 'MV' },
  { iata: 'DPS', name: 'Ngurah Rai International', city: 'Bali', country: 'ID' },
  { iata: 'CGK', name: 'Soekarno-Hatta', city: 'Jakarta', country: 'ID' },
  { iata: 'MNL', name: 'Ninoy Aquino International', city: 'Manila', country: 'PH' },
  { iata: 'SGN', name: 'Tan Son Nhat', city: 'Ho-Chi-Minh-Stadt', country: 'VN' },
  { iata: 'HAN', name: 'Noi Bai International', city: 'Hanoi', country: 'VN' },
  { iata: 'REP', name: 'Siem Reap International', city: 'Siem Reap', country: 'KH' },
  { iata: 'PNH', name: 'Phnom Penh International', city: 'Phnom Penh', country: 'KH' },
  { iata: 'KTM', name: 'Tribhuvan International', city: 'Kathmandu', country: 'NP' },
  // --- Afrika ---
  { iata: 'JNB', name: 'O.R. Tambo International', city: 'Johannesburg', country: 'ZA' },
  { iata: 'CPT', name: 'Cape Town International', city: 'Kapstadt', country: 'ZA' },
  { iata: 'NBO', name: 'Jomo Kenyatta', city: 'Nairobi', country: 'KE' },
  { iata: 'DAR', name: 'Julius Nyerere', city: 'Dar es Salaam', country: 'TZ' },
  { iata: 'JRO', name: 'Kilimanjaro International', city: 'Kilimanjaro', country: 'TZ' },
  { iata: 'ZNZ', name: 'Abeid Amani Karume', city: 'Sansibar', country: 'TZ' },
  { iata: 'ADD', name: 'Bole International', city: 'Addis Abeba', country: 'ET' },
  { iata: 'MRU', name: 'Sir Seewoosagur Ramgoolam', city: 'Mauritius', country: 'MU' },
  { iata: 'SEZ', name: 'Seychelles International', city: 'Mahé', country: 'SC' },
  // --- Nordamerika ---
  { iata: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'US' },
  { iata: 'EWR', name: 'Newark Liberty', city: 'New York', country: 'US' },
  { iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'US' },
  { iata: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'US' },
  { iata: 'ORD', name: 'Chicago O\'Hare', city: 'Chicago', country: 'US' },
  { iata: 'MIA', name: 'Miami International', city: 'Miami', country: 'US' },
  { iata: 'ATL', name: 'Hartsfield-Jackson Atlanta', city: 'Atlanta', country: 'US' },
  { iata: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', country: 'US' },
  { iata: 'IAD', name: 'Washington Dulles', city: 'Washington D.C.', country: 'US' },
  { iata: 'BOS', name: 'Boston Logan', city: 'Boston', country: 'US' },
  { iata: 'SEA', name: 'Seattle-Tacoma', city: 'Seattle', country: 'US' },
  { iata: 'DEN', name: 'Denver International', city: 'Denver', country: 'US' },
  { iata: 'LAS', name: 'Harry Reid International', city: 'Las Vegas', country: 'US' },
  { iata: 'MCO', name: 'Orlando International', city: 'Orlando', country: 'US' },
  { iata: 'HNL', name: 'Daniel K. Inouye', city: 'Honolulu', country: 'US' },
  { iata: 'PHX', name: 'Phoenix Sky Harbor', city: 'Phoenix', country: 'US' },
  { iata: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', country: 'US' },
  { iata: 'MSP', name: 'Minneapolis-Saint Paul', city: 'Minneapolis', country: 'US' },
  { iata: 'DTW', name: 'Detroit Metropolitan', city: 'Detroit', country: 'US' },
  { iata: 'PHL', name: 'Philadelphia International', city: 'Philadelphia', country: 'US' },
  { iata: 'SAN', name: 'San Diego International', city: 'San Diego', country: 'US' },
  { iata: 'YYZ', name: 'Toronto Pearson', city: 'Toronto', country: 'CA' },
  { iata: 'YVR', name: 'Vancouver International', city: 'Vancouver', country: 'CA' },
  { iata: 'YUL', name: 'Montréal-Trudeau', city: 'Montréal', country: 'CA' },
  { iata: 'YOW', name: 'Ottawa Macdonald-Cartier', city: 'Ottawa', country: 'CA' },
  { iata: 'YYC', name: 'Calgary International', city: 'Calgary', country: 'CA' },
  { iata: 'MEX', name: 'Mexico City International', city: 'Mexiko-Stadt', country: 'MX' },
  { iata: 'CUN', name: 'Cancún International', city: 'Cancún', country: 'MX' },
  // --- Karibik & Mittelamerika ---
  { iata: 'SJO', name: 'Juan Santamaría', city: 'San José', country: 'CR' },
  { iata: 'PTY', name: 'Tocumen International', city: 'Panama-Stadt', country: 'PA' },
  { iata: 'HAV', name: 'José Martí International', city: 'Havanna', country: 'CU' },
  { iata: 'PUJ', name: 'Punta Cana International', city: 'Punta Cana', country: 'DO' },
  { iata: 'MBJ', name: 'Sangster International', city: 'Montego Bay', country: 'JM' },
  // --- Südamerika ---
  { iata: 'GRU', name: 'São Paulo-Guarulhos', city: 'São Paulo', country: 'BR' },
  { iata: 'GIG', name: 'Rio de Janeiro-Galeão', city: 'Rio de Janeiro', country: 'BR' },
  { iata: 'EZE', name: 'Ministro Pistarini', city: 'Buenos Aires', country: 'AR' },
  { iata: 'SCL', name: 'Arturo Merino Benítez', city: 'Santiago', country: 'CL' },
  { iata: 'BOG', name: 'El Dorado International', city: 'Bogotá', country: 'CO' },
  { iata: 'LIM', name: 'Jorge Chávez', city: 'Lima', country: 'PE' },
  { iata: 'UIO', name: 'Mariscal Sucre', city: 'Quito', country: 'EC' },
  // --- Ozeanien ---
  { iata: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'AU' },
  { iata: 'MEL', name: 'Melbourne Tullamarine', city: 'Melbourne', country: 'AU' },
  { iata: 'BNE', name: 'Brisbane Airport', city: 'Brisbane', country: 'AU' },
  { iata: 'PER', name: 'Perth Airport', city: 'Perth', country: 'AU' },
  { iata: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'NZ' },
  { iata: 'CHC', name: 'Christchurch Airport', city: 'Christchurch', country: 'NZ' },
  { iata: 'NAN', name: 'Nadi International', city: 'Nadi', country: 'FJ' },
  { iata: 'PPT', name: 'Faa\'a International', city: 'Papeete', country: 'PF' },
  // --- Malta, Zypern ---
  { iata: 'MLA', name: 'Malta International', city: 'Malta', country: 'MT' },
  { iata: 'LCA', name: 'Larnaca International', city: 'Larnaka', country: 'CY' },
  { iata: 'PFO', name: 'Paphos International', city: 'Paphos', country: 'CY' },
];

/** Strip diacritics and lowercase for accent-insensitive matching */
function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Search airports by city name, airport name, or IATA code */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];

  // Exact IATA match (highest priority)
  const exactIata = AIRPORTS.filter(a => a.iata.toLowerCase() === q);
  if (exactIata.length > 0) return exactIata.slice(0, limit);

  // Score-based matching
  const scored = AIRPORTS
    .map(a => {
      const cityN = normalize(a.city);
      const nameN = normalize(a.name);
      const iataLower = a.iata.toLowerCase();
      let score = 0;
      if (cityN.startsWith(q)) score = 100;
      else if (iataLower.startsWith(q)) score = 90;
      else if (cityN.includes(q)) score = 70;
      else if (nameN.includes(q)) score = 50;
      else return null;
      return { airport: a, score };
    })
    .filter(Boolean) as { airport: Airport; score: number }[];

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.airport);
}

/** Get an airport by IATA code */
export function getAirportByIata(iata: string): Airport | undefined {
  return AIRPORTS.find(a => a.iata === iata.toUpperCase());
}
