export interface ImportedPlace {
  name: string;
  lat: number;
  lng: number;
  description?: string;
  address?: string;
}

/**
 * Parse KML (Google My Maps / Google Takeout export)
 */
export function parseKML(content: string): ImportedPlace[] {
  const places: ImportedPlace[] = [];

  // Extract all Placemark elements
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/gi;
  let match: RegExpExecArray | null;

  while ((match = placemarkRegex.exec(content)) !== null) {
    const block = match[1];

    // Extract name
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    const name = nameMatch ? decodeXml(nameMatch[1].trim()) : 'Unbenannt';

    // Extract description
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    const description = descMatch ? decodeXml(descMatch[1].trim()) : undefined;

    // Extract coordinates (format: lng,lat,alt)
    const coordMatch = block.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
    if (coordMatch) {
      const coordStr = coordMatch[1].trim().split(/\s+/)[0]; // Take first coordinate pair
      const parts = coordStr.split(',');
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          places.push({ name, lat, lng, description });
        }
      }
    }
  }

  return places;
}

/**
 * Parse GeoJSON (standard geo format)
 */
export function parseGeoJSON(content: string): ImportedPlace[] {
  const places: ImportedPlace[] = [];

  try {
    const data = JSON.parse(content);
    const features = data.type === 'FeatureCollection' ? data.features : [data];

    for (const feature of features) {
      if (!feature.geometry) continue;

      const { type, coordinates } = feature.geometry;
      const props = feature.properties || {};

      if (type === 'Point' && coordinates?.length >= 2) {
        places.push({
          name: props.name || props.title || props.Name || 'Unbenannt',
          lng: coordinates[0],
          lat: coordinates[1],
          description: props.description || props.notes || undefined,
          address: props.address || undefined,
        });
      }
    }
  } catch {
    // Invalid JSON
  }

  return places;
}

/**
 * Auto-detect format and parse
 */
export function parseGeoFile(content: string, fileName: string): ImportedPlace[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.kml')) {
    return parseKML(content);
  }
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    return parseGeoJSON(content);
  }
  // Try both
  if (content.trim().startsWith('<') || content.includes('<kml')) {
    return parseKML(content);
  }
  return parseGeoJSON(content);
}

/**
 * Export activities as GeoJSON FeatureCollection
 */
export function exportGeoJSON(activities: { title: string; lat: number; lng: number; category: string; description?: string | null }[]): string {
  const features = activities
    .filter(a => a.lat && a.lng)
    .map(a => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [a.lng, a.lat],
      },
      properties: {
        name: a.title,
        category: a.category,
        ...(a.description ? { description: a.description } : {}),
      },
    }));

  return JSON.stringify({
    type: 'FeatureCollection',
    features,
  }, null, 2);
}

function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
