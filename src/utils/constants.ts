export const CURRENCIES = [
  { code: 'CHF', symbol: 'CHF', name: 'Schweizer Franken' },
] as const;

export const DEFAULT_CURRENCY = 'CHF';

export const ACTIVITY_CATEGORIES = [
  { id: 'sightseeing', label: 'Sehenswürdigkeit', icon: '🏛️' },
  { id: 'food', label: 'Essen', icon: '🍽️' },
  { id: 'activity', label: 'Aktivität', icon: '🎯' },
  { id: 'transport', label: 'Transport', icon: '✈️' },
  { id: 'hotel', label: 'Unterkunft', icon: '🏠' },
  { id: 'shopping', label: 'Einkaufen', icon: '🛍️' },
  { id: 'relaxation', label: 'Entspannung', icon: '🧘' },
  { id: 'stop', label: 'Zwischenstopp', icon: '📍' },
  { id: 'other', label: 'Sonstiges', icon: '📌' },
] as const;

export const BUDGET_CATEGORIES = [
  { id: 'transport', label: 'Transport', color: '#FF6B6B' },
  { id: 'accommodation', label: 'Unterkunft', color: '#4ECDC4' },
  { id: 'food', label: 'Essen & Trinken', color: '#FFD93D' },
  { id: 'activities', label: 'Aktivitäten', color: '#6C5CE7' },
  { id: 'shopping', label: 'Einkaufen', color: '#74B9FF' },
  { id: 'other', label: 'Sonstiges', color: '#636E72' },
] as const;

export const PACKING_CATEGORIES = [
  'Kleidung',
  'Toilettenartikel',
  'Elektronik',
  'Dokumente',
  'Medikamente',
  'Sonstiges',
] as const;

export const TRIP_STATUS = {
  PLANNING: 'planning',
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;

export const COLLABORATOR_ROLES = {
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;
