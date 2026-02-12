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
