import { format, differenceInDays, addDays, parseISO, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd.MM.yyyy', { locale: de });
};

export const formatDateShort = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd. MMM', { locale: de });
};

export const formatDateLong = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEEE, dd. MMMM yyyy', { locale: de });
};

export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm');
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

export const isTripActive = (startDate: string, endDate: string): boolean => {
  const now = new Date();
  return isWithinInterval(now, { start: parseISO(startDate), end: parseISO(endDate) });
};

export const formatDateRange = (startDate: string, endDate: string): string => {
  return `${formatDateShort(startDate)} – ${formatDateShort(endDate)}`;
};
