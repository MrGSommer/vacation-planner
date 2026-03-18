export interface CategoryField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'time' | 'date' | 'place' | 'airport';
  placeholder?: string;
  options?: string[];
  pair?: 'left' | 'right';
  secondary?: boolean;
}

// --- Multi-Leg Flight Support ---

export interface FlightLeg {
  dep_iata: string;
  dep_name: string;
  arr_iata: string;
  arr_name: string;
  flight_number?: string;
  carrier?: string;
  dep_date?: string;
  dep_time?: string;
  arr_date?: string;
  arr_time?: string;
  flight_verified?: boolean;
}

/**
 * Normalize any flight category_data into a FlightLeg[] array.
 * Handles:
 * - New format: flight_legs array already present
 * - Old format with via_airport: synthesize 2 legs
 * - Simple dep/arr only: synthesize 1 leg
 */
export function getFlightLegs(data: Record<string, any>): FlightLeg[] {
  if (!data) return [];

  // New format
  if (Array.isArray(data.flight_legs) && data.flight_legs.length > 0) {
    return data.flight_legs;
  }

  const depIata = data.departure_station;
  const depName = data.departure_station_name || depIata || '';
  const arrIata = data.arrival_station;
  const arrName = data.arrival_station_name || arrIata || '';

  if (!depIata && !arrIata) return [];

  // Old format with via_airport → 2 legs
  if (data.via_airport) {
    const viaIata = data.via_airport;
    const viaName = data.via_airport_name || viaIata;
    return [
      {
        dep_iata: depIata || '',
        dep_name: depName,
        arr_iata: viaIata,
        arr_name: viaName,
        flight_number: data.reference_number || undefined,
        carrier: data.carrier || undefined,
        dep_date: data.departure_date || undefined,
        dep_time: data.departure_time || undefined,
        flight_verified: data.flight_verified || false,
      },
      {
        dep_iata: viaIata,
        dep_name: viaName,
        arr_iata: arrIata || '',
        arr_name: arrName,
        flight_number: data.via_flight_number || undefined,
        arr_date: data.arrival_date || undefined,
        arr_time: data.arrival_time || undefined,
      },
    ];
  }

  // Simple single leg
  return [{
    dep_iata: depIata || '',
    dep_name: depName,
    arr_iata: arrIata || '',
    arr_name: arrName,
    flight_number: data.reference_number || undefined,
    carrier: data.carrier || undefined,
    dep_date: data.departure_date || undefined,
    dep_time: data.departure_time || undefined,
    arr_date: data.arrival_date || undefined,
    arr_time: data.arrival_time || undefined,
    flight_verified: data.flight_verified || false,
  }];
}

// Transport: only transport_type selector initially — remaining fields come from getTransportFields()
export const TRANSPORT_TYPE_FIELD: CategoryField = {
  key: 'transport_type', label: 'Transportmittel', type: 'select',
  options: ['Flug', 'Zug', 'Bus', 'Auto', 'Fähre', 'Taxi'],
};

// Per-transport-type field definitions with context-appropriate labels
export const TRANSPORT_TYPE_FIELDS: Record<string, CategoryField[]> = {
  Flug: [
    { key: 'departure_station', label: 'Abflughafen', type: 'airport', placeholder: 'z.B. Zürich' },
    { key: 'arrival_station', label: 'Zielflughafen', type: 'airport', placeholder: 'z.B. Lissabon' },
    { key: 'departure_date', label: 'Abflugdatum', type: 'date', placeholder: 'YYYY-MM-DD', pair: 'left' },
    { key: 'reference_number', label: 'Flugnummer', type: 'text', placeholder: 'z.B. LX1234 (optional)', pair: 'right' },
    { key: 'via_airport', label: 'Zwischenstopp', type: 'airport', placeholder: 'z.B. Istanbul (optional)' },
    { key: 'via_flight_number', label: 'Anschlussflug', type: 'text', placeholder: 'z.B. TK1890 (optional)', secondary: true },
    { key: 'carrier', label: 'Airline', type: 'text', placeholder: 'z.B. Swiss, Lufthansa', secondary: true },
    { key: 'departure_time', label: 'Abflugzeit', type: 'time', placeholder: 'HH:MM', secondary: true, pair: 'left' },
    { key: 'arrival_time', label: 'Ankunftszeit', type: 'time', placeholder: 'HH:MM', secondary: true, pair: 'right' },
    { key: 'arrival_date', label: 'Ankunftsdatum', type: 'date', placeholder: 'YYYY-MM-DD', secondary: true },
  ],
  Zug: [
    { key: 'carrier', label: 'Bahngesellschaft', type: 'text', placeholder: 'z.B. SBB, DB, SNCF' },
    { key: 'reference_number', label: 'Zugnummer', type: 'text', placeholder: 'z.B. IC 724' },
    { key: 'departure_station', label: 'Abfahrtsbahnhof', type: 'place', placeholder: 'Bahnhof' },
    { key: 'arrival_station', label: 'Zielbahnhof', type: 'place', placeholder: 'Bahnhof' },
    { key: 'departure_date', label: 'Abfahrtsdatum', type: 'date', placeholder: 'YYYY-MM-DD', pair: 'left' },
    { key: 'departure_time', label: 'Abfahrtszeit', type: 'time', placeholder: 'HH:MM', pair: 'right' },
    { key: 'arrival_date', label: 'Ankunftsdatum', type: 'date', placeholder: 'YYYY-MM-DD', secondary: true, pair: 'left' },
    { key: 'arrival_time', label: 'Ankunftszeit', type: 'time', placeholder: 'HH:MM', secondary: true, pair: 'right' },
  ],
  Bus: [
    { key: 'carrier', label: 'Busunternehmen', type: 'text', placeholder: 'z.B. FlixBus, PostAuto' },
    { key: 'reference_number', label: 'Buchungsnr', type: 'text', placeholder: 'Buchungsnummer' },
    { key: 'departure_station', label: 'Abfahrtshaltestelle', type: 'place', placeholder: 'Haltestelle' },
    { key: 'arrival_station', label: 'Zielhaltestelle', type: 'place', placeholder: 'Haltestelle' },
    { key: 'departure_date', label: 'Abfahrtsdatum', type: 'date', placeholder: 'YYYY-MM-DD', pair: 'left' },
    { key: 'departure_time', label: 'Abfahrtszeit', type: 'time', placeholder: 'HH:MM', pair: 'right' },
    { key: 'arrival_date', label: 'Ankunftsdatum', type: 'date', placeholder: 'YYYY-MM-DD', secondary: true, pair: 'left' },
    { key: 'arrival_time', label: 'Ankunftszeit', type: 'time', placeholder: 'HH:MM', secondary: true, pair: 'right' },
  ],
  Auto: [
    { key: 'departure_station', label: 'Startort', type: 'place', placeholder: 'Von' },
    { key: 'arrival_station', label: 'Zielort', type: 'place', placeholder: 'Nach' },
    { key: 'departure_date', label: 'Abfahrtsdatum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'departure_time', label: 'Abfahrtszeit', type: 'time', placeholder: 'HH:MM' },
    { key: 'arrival_date', label: 'Ankunftsdatum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'arrival_time', label: 'Ankunftszeit', type: 'time', placeholder: 'HH:MM' },
  ],
  'Fähre': [
    { key: 'carrier', label: 'Fährgesellschaft', type: 'text', placeholder: 'z.B. Stena Line' },
    { key: 'reference_number', label: 'Buchungsnr', type: 'text', placeholder: 'Buchungsnummer' },
    { key: 'departure_station', label: 'Abfahrtshafen', type: 'place', placeholder: 'Hafen' },
    { key: 'arrival_station', label: 'Zielhafen', type: 'place', placeholder: 'Hafen' },
    { key: 'departure_date', label: 'Abfahrtsdatum', type: 'date', placeholder: 'YYYY-MM-DD', pair: 'left' },
    { key: 'departure_time', label: 'Abfahrtszeit', type: 'time', placeholder: 'HH:MM', pair: 'right' },
    { key: 'arrival_date', label: 'Ankunftsdatum', type: 'date', placeholder: 'YYYY-MM-DD', secondary: true, pair: 'left' },
    { key: 'arrival_time', label: 'Ankunftszeit', type: 'time', placeholder: 'HH:MM', secondary: true, pair: 'right' },
  ],
  Taxi: [
    { key: 'carrier', label: 'Taxiunternehmen', type: 'text', placeholder: 'z.B. Uber, Bolt' },
    { key: 'departure_station', label: 'Abholort', type: 'place', placeholder: 'Adresse' },
    { key: 'arrival_station', label: 'Zielort', type: 'place', placeholder: 'Adresse' },
    { key: 'departure_date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'departure_time', label: 'Abholzeit', type: 'time', placeholder: 'HH:MM' },
  ],
};

/** Get transport fields for a specific transport type (or empty if not yet selected) */
export function getTransportFields(transportType?: string): CategoryField[] {
  if (!transportType) return [];
  return TRANSPORT_TYPE_FIELDS[transportType] || [];
}

export const CATEGORY_FIELDS: Record<string, CategoryField[]> = {
  transport: [TRANSPORT_TYPE_FIELD],
  hotel: [
    { key: 'check_in_date', label: 'Ankunft', type: 'date', placeholder: 'YYYY-MM-DD', pair: 'left' },
    { key: 'check_out_date', label: 'Abreise', type: 'date', placeholder: 'YYYY-MM-DD', pair: 'right' },
    { key: 'confirmation_number', label: 'Buchungsnr', type: 'text', placeholder: 'Bestätigungsnummer', pair: 'left' },
    { key: 'hotel_contact', label: 'Kontakt', type: 'text', placeholder: 'Tel / Website', pair: 'right' },
  ],
  food: [
    { key: 'cuisine_type', label: 'Küche', type: 'text', placeholder: 'z.B. Italienisch' },
    { key: 'reservation_time', label: 'Reservierung', type: 'time', placeholder: 'HH:MM' },
    { key: 'reservation_name', label: 'Reserviert auf', type: 'text', placeholder: 'Name' },
  ],
  activity: [
    { key: 'booking_reference', label: 'Buchungsreferenz', type: 'text', placeholder: 'Buchungsnr' },
    { key: 'duration', label: 'Dauer', type: 'text', placeholder: 'z.B. 2h' },
    { key: 'participants', label: 'Teilnehmer', type: 'text', placeholder: 'Anzahl' },
  ],
  sightseeing: [
    { key: 'ticket_price', label: 'Eintritt', type: 'text', placeholder: 'z.B. 15 EUR' },
    { key: 'website_url', label: 'Website', type: 'text', placeholder: 'https://...' },
  ],
  shopping: [
    { key: 'shop_type', label: 'Art', type: 'select', options: ['Mall', 'Markt', 'Boutique', 'Outlet', 'Sonstiges'] },
  ],
  relaxation: [
    { key: 'facility_type', label: 'Art', type: 'select', options: ['Spa', 'Strand', 'Pool', 'Therme', 'Sonstiges'] },
    { key: 'reservation_time', label: 'Reservierung', type: 'time', placeholder: 'HH:MM' },
  ],
  stop: [],
  other: [],
};

/** Map Google Places types to app activity categories */
export const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
  lodging: 'hotel', hotel: 'hotel', hostel: 'hotel', resort_hotel: 'hotel', motel: 'hotel',
  restaurant: 'food', cafe: 'food', bar: 'food', bakery: 'food', meal_delivery: 'food', meal_takeaway: 'food',
  museum: 'sightseeing', art_gallery: 'sightseeing', church: 'sightseeing', hindu_temple: 'sightseeing',
  mosque: 'sightseeing', synagogue: 'sightseeing', tourist_attraction: 'sightseeing', landmark: 'sightseeing',
  amusement_park: 'activity', bowling_alley: 'activity', aquarium: 'activity', zoo: 'activity', stadium: 'activity',
  park: 'relaxation', spa: 'relaxation', campground: 'relaxation',
  shopping_mall: 'shopping', store: 'shopping', clothing_store: 'shopping', book_store: 'shopping',
  train_station: 'transport', airport: 'transport', bus_station: 'transport', subway_station: 'transport',
  transit_station: 'transport',
};

/** Detect app category from an array of Google Places types */
export function detectCategoryFromTypes(types?: string[]): string {
  if (!types?.length) return 'sightseeing';
  for (const t of types) {
    const cat = GOOGLE_TYPE_TO_CATEGORY[t];
    if (cat) return cat;
  }
  return 'sightseeing';
}

export const CATEGORY_COLORS: Record<string, string> = {
  transport: '#4A90D9',   // freundliches Blau
  hotel: '#6C5CE7',       // WayFable Purple/Accent
  food: '#FF6B6B',        // WayFable Coral
  activity: '#00B894',    // WayFable Success-Grün
  sightseeing: '#E17055', // warmes Orange-Rot
  shopping: '#E84393',    // Pink
  relaxation: '#4ECDC4',  // WayFable Turquoise
  stop: '#6C5CE7',        // Purple
  poll: '#F39C12',         // warmes Gelb
  other: '#95A5A6',       // sanftes Grau
};

export function formatCategoryDetail(category: string, data: Record<string, any>): string | null {
  if (!data || Object.keys(data).length === 0) return null;

  switch (category) {
    case 'transport': {
      const parts: string[] = [];
      const legs = data.transport_type === 'Flug' ? getFlightLegs(data) : [];

      if (legs.length >= 2) {
        // Multi-leg: show all flight numbers joined
        const flightNums = legs
          .map(l => l.flight_number)
          .filter(Boolean)
          .join(' + ');
        if (flightNums) parts.push(flightNums);

        // Route: DEP → VIA1 → VIA2 → ARR
        const routeParts = [legs[0].dep_name];
        for (const leg of legs) routeParts.push(leg.arr_name);
        const shortRoute = routeParts.map(n => n.replace(/\s*\([A-Z]{3}\)\s*$/, '')).join(' → ');
        parts.push(shortRoute);
      } else {
        // Single leg or non-flight transport
        if (data.reference_number) {
          parts.push(data.reference_number);
        }
        if (data.departure_station_name && data.arrival_station_name) {
          parts.push(`${data.departure_station_name} → ${data.arrival_station_name}`);
        }
      }

      if (data.departure_time && data.arrival_time) {
        parts.push(`${data.departure_time}–${data.arrival_time}`);
      } else if (data.departure_time) {
        parts.push(data.departure_time);
      }
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'hotel': {
      const parts: string[] = [];
      if (data.check_in_date && data.check_out_date) {
        parts.push(`${formatDE(data.check_in_date)} – ${formatDE(data.check_out_date)}`);
      }
      if (data.confirmation_number) parts.push(`Ref: ${data.confirmation_number}`);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'food': {
      const parts: string[] = [];
      if (data.cuisine_type) parts.push(data.cuisine_type);
      if (data.reservation_time) parts.push(`Reservierung ${data.reservation_time}`);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'activity': {
      const parts: string[] = [];
      if (data.duration) parts.push(data.duration);
      if (data.participants) parts.push(`${data.participants} Pers.`);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'sightseeing': {
      const parts: string[] = [];
      if (data.ticket_price) parts.push(data.ticket_price);
      if (data.website_url) parts.push(data.website_url);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'shopping':
      return data.shop_type || null;
    case 'relaxation': {
      const parts: string[] = [];
      if (data.facility_type) parts.push(data.facility_type);
      if (data.reservation_time) parts.push(data.reservation_time);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'stop':
      return null;
    default:
      return null;
  }
}

function formatDE(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
