const ACCESS_KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY || '';

export interface UnsplashPhoto {
  id: string;
  urls: { regular: string; small: string };
  user: { name: string; links: { html: string } };
  links: { html: string; download_location: string };
}

export async function searchPhotos(query: string, perPage = 12): Promise<UnsplashPhoto[]> {
  if (!ACCESS_KEY) {
    console.warn('Unsplash access key not configured');
    return [];
  }
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${perPage}`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
  });
  if (!res.ok) throw new Error(`Unsplash API error: ${res.status}`);
  const data = await res.json();
  return data.results;
}

/** Must be called when a photo is actually "used" (set as cover) per Unsplash API guidelines. */
export async function triggerDownload(photo: UnsplashPhoto): Promise<void> {
  if (!ACCESS_KEY || !photo.links.download_location) return;
  try {
    await fetch(photo.links.download_location, {
      headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
    });
  } catch {
    // best-effort, don't block the user
  }
}
