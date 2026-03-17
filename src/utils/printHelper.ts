import { Platform } from 'react-native';
import { Activity, ItineraryDay, TripStop, BudgetCategory, PackingItem, Trip } from '../types/database';
import { getDeviceLocale } from './dateHelpers';
import { CATEGORY_COLORS } from './categoryFields';
import { WeatherDay } from '../hooks/useWeather';

export interface PrintData {
  trip: Trip;
  days: (ItineraryDay & { activities: Activity[] })[];
  stops: TripStop[];
  budgetCategories: BudgetCategory[];
  packingItems: PackingItem[];
  weather?: Map<string, WeatherDay>;
}

export interface PrintOptions {
  itinerary: boolean;
  stops: boolean;
  budget: boolean;
  packing: boolean;
  notes: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(getDeviceLocale(), {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(getDeviceLocale(), {
      weekday: 'short', day: 'numeric', month: 'long',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(time: string | null): string {
  if (!time) return '';
  return time.substring(0, 5);
}

function formatPrintDate(): string {
  return new Date().toLocaleDateString('de-CH', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function calcTripDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function getDayNumber(startDate: string, dayDate: string): number {
  const start = new Date(startDate);
  const day = new Date(dayDate);
  return Math.round((day.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

const GROUP_TYPE_LABELS: Record<string, string> = {
  solo: 'Solo',
  couple: 'Paar',
  family: 'Familie',
  friends: 'Freunde',
  group: 'Gruppe',
};

const CATEGORY_LABELS: Record<string, string> = {
  sightseeing: 'Sightseeing',
  food: 'Essen',
  activity: 'Aktivit\u00E4t',
  transport: 'Transport',
  hotel: 'Hotel',
  shopping: 'Einkaufen',
  relaxation: 'Entspannung',
  stop: 'Stop',
  other: 'Sonstiges',
};

// Text-safe weather icons for print (no color emoji)
const WEATHER_TEXT_ICONS: Record<number, string> = {
  0: '\u2600',       // ☀ Sonnig
  1: '\u26C5', 2: '\u26C5', 3: '\u2601',   // ⛅ / ☁
  45: '\u2601', 48: '\u2601',               // Nebel → ☁
  51: '\uD83C\uDF27', 53: '\uD83C\uDF27', 55: '\uD83C\uDF27',
  56: '\uD83C\uDF27', 57: '\uD83C\uDF27',
  61: '\uD83C\uDF27', 63: '\uD83C\uDF27', 65: '\uD83C\uDF27',
  66: '\uD83C\uDF27', 67: '\uD83C\uDF27',  // Regen
  71: '\u2744', 73: '\u2744', 75: '\u2744', 77: '\u2744',   // ❄ Schnee
  80: '\uD83C\uDF26', 81: '\uD83C\uDF26', 82: '\uD83C\uDF26',   // Schauer
  85: '\u2744', 86: '\u2744',
  95: '\u26C8', 96: '\u26C8', 99: '\u26C8',   // ⛈ Gewitter
};

function getWeatherTextIcon(code: number): string {
  return WEATHER_TEXT_ICONS[code] || '\u2601';
}

function renderTransportDetails(data: Record<string, any>): string {
  const type = data.transport_type || 'Transport';
  const parts: string[] = [];

  if (data.departure_station_name && data.arrival_station_name) {
    parts.push(`<span class="detail-route">${escapeHtml(data.departure_station_name)} \u2192 ${escapeHtml(data.arrival_station_name)}</span>`);
  }
  if (data.reference_number) {
    parts.push(`<span class="detail-ref">${escapeHtml(data.reference_number)}</span>`);
  }
  if (data.carrier) {
    parts.push(`<span class="detail-carrier">${escapeHtml(data.carrier)}</span>`);
  }
  if (data.departure_time) {
    const timeRange = data.arrival_time
      ? `${formatTime(data.departure_time)} \u2013 ${formatTime(data.arrival_time)}`
      : formatTime(data.departure_time);
    parts.push(`<span class="detail-time">${timeRange}</span>`);
  }
  if (data.departure_date) {
    parts.push(`<span class="detail-date">${formatDateShort(data.departure_date)}</span>`);
  }

  if (parts.length === 0) return '';

  return `<div class="transport-details">
    <span class="detail-type">${escapeHtml(type)}</span>
    ${parts.join(' <span class="detail-sep">\u00B7</span> ')}
  </div>`;
}

function renderHotelDetails(data: Record<string, any>): string {
  const parts: string[] = [];

  if (data.check_in_date && data.check_out_date) {
    parts.push(`Check-in: ${formatDateShort(data.check_in_date)} \u2013 Check-out: ${formatDateShort(data.check_out_date)}`);
  }
  if (data.confirmation_number) {
    parts.push(`Buchungsnr: ${escapeHtml(data.confirmation_number)}`);
  }
  if (data.hotel_contact) {
    parts.push(`Kontakt: ${escapeHtml(data.hotel_contact)}`);
  }

  if (parts.length === 0) return '';

  return `<div class="hotel-details">${parts.join(' <span class="detail-sep">\u00B7</span> ')}</div>`;
}

function renderHeader(trip: Trip): string {
  const dateRange = `${formatDate(trip.start_date)} \u2013 ${formatDate(trip.end_date)}`;
  const days = calcTripDays(trip.start_date, trip.end_date);
  const groupLabel = GROUP_TYPE_LABELS[trip.group_type] || '';
  const groupInfo = groupLabel
    ? ` \u00B7 ${groupLabel}${trip.travelers_count > 1 ? ` (${trip.travelers_count} Reisende)` : ''}`
    : '';

  return `
    <div class="header">
      <div class="header-content">
        <h1>${escapeHtml(trip.name)}</h1>
        <p class="meta">${escapeHtml(trip.destination)} \u00B7 ${dateRange} \u00B7 ${days} Tage${groupInfo}</p>
        ${trip.notes ? `<p class="notes">${escapeHtml(trip.notes)}</p>` : ''}
      </div>
      <div class="header-brand">WayFable</div>
    </div>
  `;
}

function renderItinerary(data: PrintData): string {
  if (!data.days.length) return '';
  let html = '<h2>Tagesplan</h2>';

  for (const day of data.days) {
    const dayNum = getDayNumber(data.trip.start_date, day.date);
    const weather = data.weather?.get(day.date);
    const weatherHtml = weather
      ? `<span class="day-weather">${getWeatherTextIcon(weather.weatherCode)} ${weather.tempMin}\u00B0 \u2013 ${weather.tempMax}\u00B0${weather.isEstimate ? ' <span class="estimate">(ca.)</span>' : ''}</span>`
      : '';

    html += `<div class="day">`;
    html += `<h3><span class="day-label">Tag ${dayNum} \u00B7 ${formatDateShort(day.date)}</span>${weatherHtml}</h3>`;
    if (day.notes) html += `<p class="day-notes">${escapeHtml(day.notes)}</p>`;

    if (day.activities.length > 0) {
      html += '<table class="activities-table"><tbody>';
      for (const act of day.activities) {
        const timeStr = act.start_time
          ? `${formatTime(act.start_time)}${act.end_time ? ' \u2013 ' + formatTime(act.end_time) : ''}`
          : '';
        const costStr = act.cost ? `<span class="act-cost">${act.cost} ${data.trip.currency}</span>` : '';
        const catColor = CATEGORY_COLORS[act.category] || '#95A5A6';
        const catLabel = act.category === 'transport' && act.category_data?.transport_type
          ? act.category_data.transport_type
          : (CATEGORY_LABELS[act.category] || act.category);

        let detailsHtml = '';
        if (act.category === 'transport' && act.category_data) {
          detailsHtml = renderTransportDetails(act.category_data);
        } else if (act.category === 'hotel' && act.category_data) {
          detailsHtml = renderHotelDetails(act.category_data);
        }

        html += `<tr class="activity">
          <td class="time">${timeStr}</td>
          <td class="act-content">
            <div class="act-header">
              <span><strong>${escapeHtml(act.title)}</strong>
              <span class="category"><span class="cat-dot" style="background:${catColor}"></span>${catLabel}</span></span>
              ${costStr}
            </div>
            ${detailsHtml}
            ${act.description ? `<div class="act-desc">${escapeHtml(act.description)}</div>` : ''}
            ${act.location_name ? `<div class="act-loc">\uD83D\uDCCD ${escapeHtml(act.location_name)}</div>` : ''}
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<p class="empty">Keine Aktivit\u00E4ten geplant</p>';
    }
    html += '</div>';
  }
  return html;
}

function renderStops(data: PrintData): string {
  if (!data.stops.length) return '';
  let html = '<h2>Stops &amp; Route</h2><ol class="stops-list">';

  for (const stop of data.stops) {
    const isOvernight = stop.type === 'overnight';
    const dotColor = isOvernight ? '#FF6B6B' : '#4ECDC4';
    const dates = stop.arrival_date
      ? ` (${formatDateShort(stop.arrival_date)}${stop.departure_date ? ' \u2013 ' + formatDateShort(stop.departure_date) : ''})`
      : '';
    const nights = stop.nights ? ` \u00B7 ${stop.nights} N\u00E4chte` : '';
    html += `<li>
      <span class="stop-dot" style="background:${dotColor}">${stop.sort_order + 1}</span>
      <strong>${escapeHtml(stop.name)}</strong>
      <span class="stop-meta">${isOvernight ? '\u00DCbernachtung' : 'Wegpunkt'}${nights}${dates}</span>
      ${stop.address ? `<br><span class="stop-addr">${escapeHtml(stop.address)}</span>` : ''}
    </li>`;
  }
  html += '</ol>';
  return html;
}

function renderBudget(data: PrintData): string {
  if (!data.budgetCategories.length) return '';
  let html = '<h2>Budget</h2><table class="budget-table"><thead><tr><th>Kategorie</th><th>Budget</th></tr></thead><tbody>';

  let total = 0;
  for (let i = 0; i < data.budgetCategories.length; i++) {
    const cat = data.budgetCategories[i];
    const limit = cat.budget_limit || 0;
    total += limit;
    const rowClass = i % 2 === 1 ? ' class="zebra"' : '';
    html += `<tr${rowClass}>
      <td><span class="color-dot" style="background:${cat.color}"></span> ${escapeHtml(cat.name)}</td>
      <td class="amount">${limit > 0 ? `${limit} ${data.trip.currency}` : '\u2013'}</td>
    </tr>`;
  }

  if (total > 0) {
    html += `<tr class="total"><td><strong>Total</strong></td><td class="amount"><strong>${total} ${data.trip.currency}</strong></td></tr>`;
  }

  html += '</tbody></table>';
  return html;
}

function renderPackingList(data: PrintData): string {
  if (!data.packingItems.length) return '';

  const grouped: Record<string, typeof data.packingItems> = {};
  for (const item of data.packingItems) {
    const cat = item.category || 'Sonstiges';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  let html = '<h2>Packliste</h2>';
  for (const [category, items] of Object.entries(grouped)) {
    html += `<h3 class="pack-cat">${escapeHtml(category)}</h3><ul class="pack-list">`;
    for (const item of items) {
      const qty = item.quantity > 1 ? ` (${item.quantity}x)` : '';
      html += `<li><span class="checkbox"></span> ${escapeHtml(item.name)}${qty}</li>`;
    }
    html += '</ul>';
  }
  return html;
}

function renderNotes(data: PrintData): string {
  if (!data.trip.notes) return '';
  return `<h2>Notizen</h2><p>${escapeHtml(data.trip.notes)}</p>`;
}

function writePrintHtml(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function buildPrintHtml(data: PrintData, options: PrintOptions): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.trip.name)} - WayFable</title>
  <style>
    @page { margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #333; font-size: 14px; line-height: 1.5; }

    /* Coral accent stripe */
    body::before { content: ''; display: block; height: 4px; background: #FF6B6B; margin: -24px -24px 20px -24px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .header-content { flex: 1; }
    .header-brand { color: #FF6B6B; font-size: 14px; font-weight: 600; white-space: nowrap; margin-left: 16px; margin-top: 4px; }
    h1 { font-size: 24px; margin-bottom: 4px; color: #1a1a1a; }
    h2 { font-size: 18px; margin-top: 28px; margin-bottom: 12px; padding: 6px 0 6px 12px; color: #2c3e50; border-left: 3px solid #FF6B6B; background: #f8f9fa; }
    h3 { font-size: 15px; margin-top: 16px; margin-bottom: 8px; color: #34495e; display: flex; justify-content: space-between; align-items: center; }
    .meta { color: #666; font-size: 14px; margin-bottom: 4px; }
    .notes { color: #555; font-size: 13px; font-style: italic; margin-top: 8px; }

    /* Day */
    .day { margin-bottom: 20px; page-break-inside: avoid; }
    .day-weather { font-size: 13px; font-weight: normal; color: #666; white-space: nowrap; }
    .day-weather .estimate { font-size: 11px; color: #999; }
    .day-notes { color: #777; font-size: 13px; margin-bottom: 8px; font-style: italic; }

    /* Activities table */
    .activities-table { width: 100%; border-collapse: collapse; }
    .activity td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    .time { width: 100px; color: #666; font-size: 13px; white-space: nowrap; }
    .act-content { font-size: 14px; }
    .act-header { display: flex; justify-content: space-between; align-items: baseline; }
    .act-cost { font-size: 13px; color: #555; white-space: nowrap; margin-left: 8px; }
    .act-desc { color: #777; font-size: 12px; margin-top: 2px; }
    .act-loc { color: #888; font-size: 12px; margin-top: 1px; }
    .category { font-size: 11px; color: #999; margin-left: 8px; }
    .cat-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    .empty { color: #aaa; font-size: 13px; font-style: italic; }

    /* Transport / Hotel details */
    .transport-details, .hotel-details { font-size: 12px; color: #555; margin-top: 3px; padding: 4px 8px; background: #f8f9fa; border-radius: 3px; border-left: 2px solid #4A90D9; }
    .hotel-details { border-left-color: #6C5CE7; }
    .detail-type { font-weight: 600; margin-right: 6px; }
    .detail-sep { color: #ccc; margin: 0 4px; }
    .detail-ref { font-weight: 500; }
    .detail-carrier { color: #777; }
    .detail-date { color: #777; }

    /* Stops */
    .stops-list { list-style: none; padding-left: 0; }
    .stops-list li { margin-bottom: 10px; padding-left: 32px; position: relative; }
    .stop-dot { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 600; position: absolute; left: 0; top: 0; }
    .stop-meta { color: #777; font-size: 13px; margin-left: 6px; }
    .stop-addr { color: #999; font-size: 12px; }

    /* Budget */
    .budget-table { width: 100%; border-collapse: collapse; }
    .budget-table th, .budget-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; }
    .budget-table th { font-size: 12px; color: #999; text-transform: uppercase; }
    .budget-table .zebra td { background: #f9f9f9; }
    .amount { text-align: right; }
    .total td { border-top: 2px solid #333; }
    .color-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }

    /* Packing */
    .pack-cat { font-size: 14px; margin-top: 12px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    .pack-list { list-style: none; padding: 0; columns: 2; column-gap: 24px; }
    .pack-list li { padding: 3px 0; break-inside: avoid; }
    .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #888; border-radius: 2px; margin-right: 6px; vertical-align: middle; }

    /* Footer */
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; border-top: 1px solid #eee; padding-top: 12px; }
    .footer-brand { color: #FF6B6B; font-weight: 600; }
    .footer-date { display: block; color: #bbb; margin-top: 2px; }

    @media print {
      body { padding: 0; }
      body::before { margin: 0 0 20px 0; }
      h2 { page-break-after: avoid; }
      .day { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${renderHeader(data.trip)}
  ${options.itinerary ? renderItinerary(data) : ''}
  ${options.stops ? renderStops(data) : ''}
  ${options.budget ? renderBudget(data) : ''}
  ${options.packing ? renderPackingList(data) : ''}
  ${options.notes ? renderNotes(data) : ''}
  <div class="footer">Erstellt mit <span class="footer-brand">WayFable</span> \u00B7 wayfable.ch<span class="footer-date">Gedruckt am ${formatPrintDate()}</span></div>
</body>
</html>`;
}

export async function printTripHtml(data: PrintData, options: PrintOptions): Promise<void> {
  const html = buildPrintHtml(data, options);

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      writePrintHtml(printWindow, html);
      printWindow.onload = () => printWindow.print();
    }
  } else {
    const { printAsync } = await import('expo-print');
    await printAsync({ html });
  }
}

export async function exportTripPdf(data: PrintData, options: PrintOptions): Promise<void> {
  const html = buildPrintHtml(data, options);

  if (Platform.OS === 'web') {
    await printTripHtml(data, options);
  } else {
    const { printToFileAsync } = await import('expo-print');
    const { shareAsync } = await import('expo-sharing');
    const { uri } = await printToFileAsync({ html });
    await shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
