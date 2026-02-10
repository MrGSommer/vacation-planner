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

/**
 * Export activities as KML (Google My Maps import format)
 */
export function exportKML(
  tripName: string,
  activities: { title: string; location_lat?: number | null; location_lng?: number | null; category: string; description?: string | null }[],
): string {
  const categoryStyles: Record<string, { icon: string; color: string }> = {
    hotel: { icon: 'lodging', color: 'ff8E44AD' },
    food: { icon: 'restaurants', color: 'ff22E6E7' },
    sightseeing: { icon: 'flag', color: 'ff3C4CE7' },
    activity: { icon: 'hiker', color: 'ff60AE27' },
    transport: { icon: 'bus', color: 'ffDB9834' },
    shopping: { icon: 'shopping', color: 'ff9343E8' },
    relaxation: { icon: 'spa', color: 'ffC9CE00' },
    other: { icon: 'info', color: 'ff72636E' },
  };

  const placemarks = activities
    .filter(a => a.location_lat && a.location_lng)
    .map(a => {
      const style = categoryStyles[a.category] || categoryStyles.other;
      const desc = a.description ? escapeXml(a.description) : '';
      return `    <Placemark>
      <name>${escapeXml(a.title)}</name>
      <description>${desc}</description>
      <Style>
        <IconStyle><color>${style.color}</color></IconStyle>
      </Style>
      <Point>
        <coordinates>${a.location_lng},${a.location_lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(tripName)}</name>
    <description>Exportiert von WayFable</description>
${placemarks}
  </Document>
</kml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
