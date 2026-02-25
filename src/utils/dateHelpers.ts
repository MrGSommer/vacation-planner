import { differenceInDays, addDays, parseISO, isWithinInterval, format } from 'date-fns';

/** Returns the device/browser locale, defaults to 'de-CH' */
export function getDeviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'de-CH';
  }
}

const locale = getDeviceLocale();

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateShort = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
};

export const formatDateMedium = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateLong = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const getDayCount = (startDate: string, endDate: string): number => {
  return differenceInDays(parseISO(endDate), parseISO(startDate)) + 1;
};

export const getDayDates = (startDate: string, endDate: string): string[] => {
  const days: string[] = [];
  const start = parseISO(startDate);
  const count = getDayCount(startDate, endDate);
  for (let i = 0; i < count; i++) {
    days.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }
  return days;
};

export const getToday = (): string => format(new Date(), 'yyyy-MM-dd');

export const isTripActive = (startDate: string, endDate: string): boolean => {
  const now = new Date();
  return isWithinInterval(now, { start: parseISO(startDate), end: parseISO(endDate) });
};

export const formatDateRange = (startDate: string, endDate: string): string => {
  return `${formatDateShort(startDate)} – ${formatDateShort(endDate)}`;
};

/** Days until a date from today. Negative = past. */
export const getDaysUntil = (date: string): number => {
  const target = parseISO(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return differenceInDays(target, now);
};

/** Current trip day (1-based) and total days. Returns null if not active. */
export const getCurrentTripDay = (startDate: string, endDate: string): { day: number; total: number } | null => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = parseISO(startDate);
  start.setHours(0, 0, 0, 0);
  const end = parseISO(endDate);
  end.setHours(0, 0, 0, 0);
  if (now < start || now > end) return null;
  const day = differenceInDays(now, start) + 1;
  const total = differenceInDays(end, start) + 1;
  return { day, total };
};

/** Get countdown text for a trip card. */
export const getTripCountdownText = (trip: { start_date: string; end_date: string; status: string }): string | null => {
  const daysUntil = getDaysUntil(trip.start_date);
  const tripDay = getCurrentTripDay(trip.start_date, trip.end_date);

  if (tripDay) {
    return `Tag ${tripDay.day} von ${tripDay.total}`;
  }

  if (daysUntil > 0 && daysUntil <= 60 && (trip.status === 'upcoming' || trip.status === 'planning')) {
    return daysUntil === 1 ? 'Morgen geht\'s los!' : `Noch ${daysUntil} Tage`;
  }

  // Completed trips: show how long ago
  if (trip.status === 'completed') {
    const daysSince = Math.abs(getDaysUntil(trip.end_date));
    if (daysSince <= 30) {
      return daysSince === 0 ? 'Heute zurückgekehrt' : daysSince === 1 ? 'Gestern zurückgekehrt' : `Vor ${daysSince} Tagen zurückgekehrt`;
    }
  }

  return null;
};
