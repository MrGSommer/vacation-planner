import { Activity, ItineraryDay, TripStop, BudgetCategory, PackingItem, Trip } from '../types/database';
import { getDeviceLocale } from './dateHelpers';

export interface PrintData {
  trip: Trip;
  days: (ItineraryDay & { activities: Activity[] })[];
  stops: TripStop[];
  budgetCategories: BudgetCategory[];
  packingItems: PackingItem[];
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

function formatTime(time: string | null): string {
  if (!time) return '';
  return time.substring(0, 5);
}

const CATEGORY_LABELS: Record<string, string> = {
  sightseeing: 'Sightseeing',
  food: 'Essen',
  activity: 'Aktivitaet',
  transport: 'Transport',
  hotel: 'Hotel',
  shopping: 'Einkaufen',
  relaxation: 'Entspannung',
  stop: 'Stop',
  other: 'Sonstiges',
};

function renderHeader(trip: Trip): string {
  const dateRange = `${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}`;
  return `
    <h1>${escapeHtml(trip.name)}</h1>
    <p class="meta">${escapeHtml(trip.destination)} | ${dateRange}</p>
    ${trip.notes ? `<p class="notes">${escapeHtml(trip.notes)}</p>` : ''}
  `;
}

function renderItinerary(data: PrintData): string {
  if (!data.days.length) return '';
  let html = '<h2>Tagesplan</h2>';

  for (const day of data.days) {
    html += `<div class="day">`;
    html += `<h3>${formatDate(day.date)}</h3>`;
    if (day.notes) html += `<p class="day-notes">${escapeHtml(day.notes)}</p>`;

    if (day.activities.length > 0) {
      html += '<table class="activities-table"><tbody>';
      for (const act of day.activities) {
        const timeStr = act.start_time
          ? `${formatTime(act.start_time)}${act.end_time ? ' - ' + formatTime(act.end_time) : ''}`
          : '';
        const costStr = act.cost ? ` (${act.cost} ${data.trip.currency})` : '';
        const catLabel = CATEGORY_LABELS[act.category] || act.category;

        html += `<tr class="activity">
          <td class="time">${timeStr}</td>
          <td class="act-content">
            <strong>${escapeHtml(act.title)}</strong>${costStr}
            <span class="category">${catLabel}</span>
            ${act.description ? `<br><span class="act-desc">${escapeHtml(act.description)}</span>` : ''}
            ${act.location_name ? `<br><span class="act-loc">${escapeHtml(act.location_name)}</span>` : ''}
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<p class="empty">Keine Aktivitaeten geplant</p>';
    }
    html += '</div>';
  }
  return html;
}

function renderStops(data: PrintData): string {
  if (!data.stops.length) return '';
  let html = '<h2>Stops & Route</h2><ol class="stops-list">';

  for (const stop of data.stops) {
    const dates = stop.arrival_date
      ? ` (${formatDate(stop.arrival_date)}${stop.departure_date ? ' - ' + formatDate(stop.departure_date) : ''})`
      : '';
    const nights = stop.nights ? ` - ${stop.nights} Naechte` : '';
    html += `<li>
      <strong>${escapeHtml(stop.name)}</strong>
      <span class="stop-meta">${stop.type === 'overnight' ? 'Uebernachtung' : 'Wegpunkt'}${nights}${dates}</span>
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
  for (const cat of data.budgetCategories) {
    const limit = cat.budget_limit || 0;
    total += limit;
    html += `<tr>
      <td><span class="color-dot" style="background:${cat.color}"></span> ${escapeHtml(cat.name)}</td>
      <td class="amount">${limit > 0 ? `${limit} ${data.trip.currency}` : '-'}</td>
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

  // Group by category
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

function buildPrintHtml(data: PrintData, options: PrintOptions): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.trip.name)} - WayFable</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #333; font-size: 14px; line-height: 1.5; }
    h1 { font-size: 24px; margin-bottom: 4px; color: #1a1a1a; }
    h2 { font-size: 18px; margin-top: 28px; margin-bottom: 12px; border-bottom: 2px solid #e0e0e0; padding-bottom: 6px; color: #2c3e50; }
    h3 { font-size: 15px; margin-top: 16px; margin-bottom: 8px; color: #34495e; }
    .meta { color: #666; font-size: 14px; margin-bottom: 4px; }
    .notes { color: #555; font-size: 13px; font-style: italic; margin-top: 8px; }
    .day { margin-bottom: 20px; page-break-inside: avoid; }
    .day-notes { color: #777; font-size: 13px; margin-bottom: 8px; font-style: italic; }
    .activities-table { width: 100%; border-collapse: collapse; }
    .activity td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    .time { width: 110px; color: #666; font-size: 13px; white-space: nowrap; }
    .act-content { font-size: 14px; }
    .act-desc { color: #777; font-size: 12px; }
    .act-loc { color: #888; font-size: 12px; }
    .category { font-size: 11px; color: #999; margin-left: 8px; }
    .empty { color: #aaa; font-size: 13px; font-style: italic; }
    .stops-list { padding-left: 20px; }
    .stops-list li { margin-bottom: 10px; }
    .stop-meta { color: #777; font-size: 13px; margin-left: 6px; }
    .stop-addr { color: #999; font-size: 12px; }
    .budget-table { width: 100%; border-collapse: collapse; }
    .budget-table th, .budget-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; }
    .budget-table th { font-size: 12px; color: #999; text-transform: uppercase; }
    .amount { text-align: right; }
    .total td { border-top: 2px solid #333; }
    .color-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .pack-cat { font-size: 14px; margin-top: 12px; }
    .pack-list { list-style: none; padding: 0; columns: 2; column-gap: 24px; }
    .pack-list li { padding: 3px 0; break-inside: avoid; }
    .checkbox { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #888; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
    .footer { margin-top: 40px; text-align: center; color: #bbb; font-size: 11px; border-top: 1px solid #eee; padding-top: 12px; }
    @media print {
      body { padding: 0; }
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
  <div class="footer">Erstellt mit WayFable - wayfable.ch</div>
</body>
</html>`;
}

export function printTripHtml(data: PrintData, options: PrintOptions): void {
  const html = buildPrintHtml(data, options);

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }
}
