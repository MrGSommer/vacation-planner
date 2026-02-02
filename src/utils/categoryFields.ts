export interface CategoryField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'time' | 'date' | 'place';
  placeholder?: string;
  options?: string[];
}

export const CATEGORY_FIELDS: Record<string, CategoryField[]> = {
  transport: [
    { key: 'transport_type', label: 'Transportmittel', type: 'select', options: ['Flug', 'Zug', 'Bus', 'Fähre', 'Auto', 'Taxi'] },
    { key: 'carrier', label: 'Gesellschaft', type: 'text', placeholder: 'z.B. Swiss, SBB' },
    { key: 'reference_number', label: 'Buchungsnr / Flugnr', type: 'text', placeholder: 'z.B. LX1234' },
    { key: 'departure_station', label: 'Abfahrt', type: 'place', placeholder: 'Abfahrtsort' },
    { key: 'arrival_station', label: 'Ankunft', type: 'place', placeholder: 'Ankunftsort' },
    { key: 'departure_date', label: 'Abfahrtsdatum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'departure_time', label: 'Abfahrtszeit', type: 'time', placeholder: 'HH:MM' },
    { key: 'arrival_date', label: 'Ankunftsdatum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'arrival_time', label: 'Ankunftszeit', type: 'time', placeholder: 'HH:MM' },
  ],
  hotel: [
    { key: 'check_in_date', label: 'Ankunft', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'check_out_date', label: 'Abreise', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'confirmation_number', label: 'Buchungsnr', type: 'text', placeholder: 'Bestätigungsnummer' },
    { key: 'hotel_contact', label: 'Kontakt', type: 'text', placeholder: 'Tel / Website' },
  ],
  food: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'cuisine_type', label: 'Küche', type: 'text', placeholder: 'z.B. Italienisch' },
    { key: 'reservation_time', label: 'Reservierung', type: 'time', placeholder: 'HH:MM' },
    { key: 'reservation_name', label: 'Reserviert auf', type: 'text', placeholder: 'Name' },
  ],
  activity: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'booking_reference', label: 'Buchungsreferenz', type: 'text', placeholder: 'Buchungsnr' },
    { key: 'duration', label: 'Dauer', type: 'text', placeholder: 'z.B. 2h' },
    { key: 'participants', label: 'Teilnehmer', type: 'text', placeholder: 'Anzahl' },
  ],
  sightseeing: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'opening_hours', label: 'Öffnungszeiten', type: 'text', placeholder: 'z.B. 09:00–18:00' },
    { key: 'ticket_price', label: 'Eintritt', type: 'text', placeholder: 'z.B. 15 EUR' },
    { key: 'website_url', label: 'Website', type: 'text', placeholder: 'https://...' },
  ],
  shopping: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'shop_type', label: 'Art', type: 'select', options: ['Mall', 'Markt', 'Boutique', 'Outlet', 'Sonstiges'] },
  ],
  relaxation: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'facility_type', label: 'Art', type: 'select', options: ['Spa', 'Strand', 'Pool', 'Therme', 'Sonstiges'] },
    { key: 'reservation_time', label: 'Reservierung', type: 'time', placeholder: 'HH:MM' },
  ],
  stop: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
  ],
  other: [
    { key: 'date', label: 'Datum', type: 'date', placeholder: 'YYYY-MM-DD' },
  ],
};

export const CATEGORY_COLORS: Record<string, string> = {
  transport: '#3498DB',
  hotel: '#8E44AD',
  food: '#E67E22',
  activity: '#27AE60',
  sightseeing: '#E74C3C',
  shopping: '#E84393',
  relaxation: '#00CEC9',
  stop: '#2D3436',
  other: '#636E72',
};

export function formatCategoryDetail(category: string, data: Record<string, any>): string | null {
  if (!data || Object.keys(data).length === 0) return null;

  switch (category) {
    case 'transport': {
      const parts: string[] = [];
      if (data.reference_number) parts.push(data.reference_number);
      if (data.departure_station_name && data.arrival_station_name) {
        parts.push(`${data.departure_station_name} → ${data.arrival_station_name}`);
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
      if (data.opening_hours) parts.push(data.opening_hours);
      if (data.ticket_price) parts.push(data.ticket_price);
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
    case 'stop': {
      if (data.date) {
        return formatDE(data.date);
      }
      return null;
    }
    default:
      return null;
  }
}

function formatDE(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
