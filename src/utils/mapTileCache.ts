import { Platform } from 'react-native';

const TILE_CACHE_NAME = 'wayfable-map-tiles';
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
const STYLE_ID = 'programmablework/cmmrxrype008e01sgbdb12881';

/** Convert lat/lng to tile x/y at a given zoom */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

/** Get all tile coordinates within a bounding box at a given zoom */
function getTilesInBounds(
  bounds: { south: number; west: number; north: number; east: number },
  zoom: number,
): { x: number; y: number; z: number }[] {
  const topLeft = latLngToTile(bounds.north, bounds.west, zoom);
  const bottomRight = latLngToTile(bounds.south, bounds.east, zoom);
  const tiles: { x: number; y: number; z: number }[] = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

/** Build Mapbox Static Tile URL */
function tileUrl(z: number, x: number, y: number): string {
  return `https://api.mapbox.com/styles/v1/${STYLE_ID}/tiles/${z}/${x}/${y}?access_token=${MAPBOX_TOKEN}`;
}

/** Compute bounding box from a list of coordinates with padding */
export function computeBoundingBox(
  points: { lat: number; lng: number }[],
  paddingDeg = 0.05,
): { south: number; west: number; north: number; east: number } {
  let south = 90, north = -90, west = 180, east = -180;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }
  return {
    south: south - paddingDeg,
    north: north + paddingDeg,
    west: west - paddingDeg,
    east: east + paddingDeg,
  };
}

/**
 * Pre-fetch Mapbox vector tiles for a trip region into Cache API.
 * Budget: ~50-200 tiles per trip (4 zoom levels).
 */
export async function prefetchTripMapTiles(
  boundingBox: { south: number; west: number; north: number; east: number },
  zoomLevels = [8, 10, 12, 14],
  maxTiles = 200,
): Promise<number> {
  if (Platform.OS !== 'web' || !MAPBOX_TOKEN) return 0;
  if (!('caches' in window)) return 0;

  const allTiles: { x: number; y: number; z: number }[] = [];
  for (const z of zoomLevels) {
    allTiles.push(...getTilesInBounds(boundingBox, z));
    if (allTiles.length > maxTiles) break;
  }
  const tiles = allTiles.slice(0, maxTiles);

  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    let fetched = 0;
    // Fetch in batches of 10 to avoid overwhelming the network
    for (let i = 0; i < tiles.length; i += 10) {
      const batch = tiles.slice(i, i + 10);
      await Promise.all(
        batch.map(async ({ x, y, z }) => {
          const url = tileUrl(z, x, y);
          const cached = await cache.match(url);
          if (cached) return; // Already cached
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              await cache.put(url, resp);
              fetched++;
            }
          } catch {
            // Silently skip failed tiles
          }
        }),
      );
    }
    return fetched;
  } catch {
    return 0;
  }
}

/** Clean up cached tiles for a trip (called when trip is deleted/archived) */
export async function cleanupTripTiles(
  boundingBox: { south: number; west: number; north: number; east: number },
  zoomLevels = [8, 10, 12, 14],
): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!('caches' in window)) return;

  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const allTiles: { x: number; y: number; z: number }[] = [];
    for (const z of zoomLevels) {
      allTiles.push(...getTilesInBounds(boundingBox, z));
    }
    await Promise.all(
      allTiles.map(({ x, y, z }) => cache.delete(tileUrl(z, x, y))),
    );
  } catch {
    // Silently ignore
  }
}

/** Get a tile from Cache API (used by OfflineMapView's transformRequest) */
export async function getCachedTile(url: string): Promise<Response | undefined> {
  if (Platform.OS !== 'web') return undefined;
  if (!('caches' in window)) return undefined;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    return (await cache.match(url)) || undefined;
  } catch {
    return undefined;
  }
}
