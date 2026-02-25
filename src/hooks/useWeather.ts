import { useState, useEffect } from 'react';
import { getStops } from '../api/stops';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';

export interface WeatherDay {
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  icon: string;
}

const WMO_ICONS: Record<number, string> = {
  0: '\u2600\uFE0F',   // Sonnig
  1: '\u26C5', 2: '\u26C5', 3: '\u26C5',   // Teilweise bewölkt
  45: '\uD83C\uDF2B\uFE0F', 48: '\uD83C\uDF2B\uFE0F',   // Nebel
  51: '\uD83C\uDF27\uFE0F', 53: '\uD83C\uDF27\uFE0F', 55: '\uD83C\uDF27\uFE0F',
  56: '\uD83C\uDF27\uFE0F', 57: '\uD83C\uDF27\uFE0F',
  61: '\uD83C\uDF27\uFE0F', 63: '\uD83C\uDF27\uFE0F', 65: '\uD83C\uDF27\uFE0F',
  66: '\uD83C\uDF27\uFE0F', 67: '\uD83C\uDF27\uFE0F',   // Regen
  71: '\u2744\uFE0F', 73: '\u2744\uFE0F', 75: '\u2744\uFE0F', 77: '\u2744\uFE0F',   // Schnee
  80: '\uD83C\uDF26\uFE0F', 81: '\uD83C\uDF26\uFE0F', 82: '\uD83C\uDF26\uFE0F',   // Regenschauer
  85: '\u2744\uFE0F', 86: '\u2744\uFE0F',   // Schneeschauer
  95: '\u26C8\uFE0F', 96: '\u26C8\uFE0F', 99: '\u26C8\uFE0F',   // Gewitter
};

function getWeatherIcon(code: number): string {
  return WMO_ICONS[code] || '\u2601\uFE0F';
}

interface LocationForDate {
  lat: number;
  lng: number;
}

/**
 * Determines the location for each day of the trip based on stops.
 * Falls back to trip destination if no stop covers that date.
 */
function getLocationPerDay(
  startDate: string,
  endDate: string,
  stops: { lat: number; lng: number; arrival_date: string | null; departure_date: string | null }[],
  destLat: number | null,
  destLng: number | null,
): Map<string, LocationForDate> {
  const map = new Map<string, LocationForDate>();
  const start = parseISO(startDate);
  const totalDays = differenceInDays(parseISO(endDate), start) + 1;

  for (let i = 0; i < totalDays; i++) {
    const date = format(addDays(start, i), 'yyyy-MM-dd');
    let found = false;

    for (const stop of stops) {
      if (!stop.arrival_date || !stop.departure_date) continue;
      if (date >= stop.arrival_date && date <= stop.departure_date) {
        map.set(date, { lat: stop.lat, lng: stop.lng });
        found = true;
        break;
      }
    }

    if (!found && destLat != null && destLng != null) {
      map.set(date, { lat: destLat, lng: destLng });
    }
  }

  return map;
}

/**
 * Standalone function to fetch weather data (usable outside hooks).
 */
export async function fetchWeatherData(
  tripId: string,
  startDate: string,
  endDate: string,
  destLat: number | null,
  destLng: number | null,
): Promise<Map<string, WeatherDay>> {
  const stops = await getStops(tripId);
  const locationMap = getLocationPerDay(startDate, endDate, stops, destLat, destLng);

  if (locationMap.size === 0) return new Map();

  const groups = new Map<string, { lat: number; lng: number; dates: string[] }>();
  for (const [date, loc] of locationMap) {
    const key = `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, { lat: loc.lat, lng: loc.lng, dates: [] });
    groups.get(key)!.dates.push(date);
  }

  const result = new Map<string, WeatherDay>();

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const maxForecast = format(addDays(now, 15), 'yyyy-MM-dd');
  const minArchive = format(addDays(now, -90), 'yyyy-MM-dd');

  for (const [, group] of groups) {
    const sortedDates = [...group.dates].sort();
    const today = format(now, 'yyyy-MM-dd');

    const forecastDates = sortedDates.filter(d => d >= today && d <= maxForecast);
    const archiveDates = sortedDates.filter(d => d < today && d >= minArchive);
    const futureDates = sortedDates.filter(d => d > maxForecast);

    const fetches: Promise<void>[] = [];

    const parseWeatherResponse = (data: any, dateMapping?: Map<string, string>) => {
      if (!data.daily) return;
      const { time, temperature_2m_max, temperature_2m_min, weathercode } = data.daily;
      for (let i = 0; i < time.length; i++) {
        const originalDate = dateMapping ? dateMapping.get(time[i]) : time[i];
        if (originalDate && group.dates.includes(originalDate)) {
          result.set(originalDate, {
            tempMax: Math.round(temperature_2m_max[i]),
            tempMin: Math.round(temperature_2m_min[i]),
            weatherCode: weathercode[i],
            icon: getWeatherIcon(weathercode[i]),
          });
        }
      }
    };

    if (forecastDates.length > 0) {
      const fStart = forecastDates[0];
      const fEnd = forecastDates[forecastDates.length - 1];
      fetches.push(
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${group.lat}&longitude=${group.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&start_date=${fStart}&end_date=${fEnd}&timezone=auto`)
          .then(r => r.json())
          .then(data => parseWeatherResponse(data))
      );
    }

    if (archiveDates.length > 0) {
      const aStart = archiveDates[0];
      const aEnd = archiveDates[archiveDates.length - 1];
      fetches.push(
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${group.lat}&longitude=${group.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&start_date=${aStart}&end_date=${aEnd}&timezone=auto`)
          .then(r => r.json())
          .then(data => parseWeatherResponse(data))
      );
    }

    if (futureDates.length > 0) {
      const dateMapping = new Map<string, string>();
      for (const d of futureDates) {
        const parsed = parseISO(d);
        const lastYear = addDays(parsed, -365);
        dateMapping.set(format(lastYear, 'yyyy-MM-dd'), d);
      }
      const lastYearDates = [...dateMapping.keys()].sort();
      const lyStart = lastYearDates[0];
      const lyEnd = lastYearDates[lastYearDates.length - 1];
      fetches.push(
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${group.lat}&longitude=${group.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&start_date=${lyStart}&end_date=${lyEnd}&timezone=auto`)
          .then(r => r.json())
          .then(data => parseWeatherResponse(data, dateMapping))
      );
    }

    await Promise.all(fetches);
  }

  return result;
}

export function useWeather(
  tripId: string,
  startDate: string,
  endDate: string,
  destLat: number | null,
  destLng: number | null,
) {
  const [weather, setWeather] = useState<Map<string, WeatherDay>>(new Map());

  useEffect(() => {
    let cancelled = false;

    fetchWeatherData(tripId, startDate, endDate, destLat, destLng)
      .then(result => { if (!cancelled) setWeather(result); })
      .catch(e => console.error('Weather fetch error:', e));

    return () => { cancelled = true; };
  }, [tripId, startDate, endDate, destLat, destLng]);

  return weather;
}
