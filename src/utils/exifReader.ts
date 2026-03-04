/**
 * EXIF date reader for web — extracts DateTimeOriginal from image binary.
 * Supports: JPEG, HEIC/HEIF, WebP, PNG (via eXIf chunk), TIFF.
 * Falls back to DateTime and DateTimeDigitized.
 */

// EXIF tag IDs
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_DATETIME = 0x0132;
const TAG_GPS_IFD = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

export interface ExifData {
  date: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Extract the original date from an image's EXIF data.
 * Returns ISO string or null if not found.
 * Supports JPEG, HEIC/HEIF, WebP, PNG.
 */
export async function extractExifDateFromUri(uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return extractExifDateFromBuffer(buffer);
  } catch {
    return null;
  }
}

/** Extract EXIF date directly from an ArrayBuffer (avoids fetch round-trip). */
export function extractExifDateFromBuffer(buffer: ArrayBuffer): string | null {
  try {
    const data = new Uint8Array(buffer);
    return extractExifDateAuto(data);
  } catch {
    return null;
  }
}

/** Auto-detect format and extract EXIF date */
function extractExifDateAuto(data: Uint8Array): string | null {
  if (data.length < 12) return null;

  // JPEG: starts with 0xFFD8
  if (data[0] === 0xFF && data[1] === 0xD8) {
    return extractFromJpeg(data);
  }

  // HEIF/HEIC: ISOBMFF container — check for 'ftyp' box at offset 4
  const ftyp = String.fromCharCode(data[4], data[5], data[6], data[7]);
  if (ftyp === 'ftyp') {
    return extractFromHeif(data);
  }

  // WebP: starts with "RIFF" ... "WEBP"
  const riff = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const webp = String.fromCharCode(data[8], data[9], data[10], data[11]);
  if (riff === 'RIFF' && webp === 'WEBP') {
    return extractFromWebP(data);
  }

  // PNG: starts with 0x89 "PNG"
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    return extractFromPng(data);
  }

  // TIFF: starts with "II" (little-endian) or "MM" (big-endian)
  if ((data[0] === 0x49 && data[1] === 0x49) || (data[0] === 0x4D && data[1] === 0x4D)) {
    return parseTiffExif(data, 0);
  }

  return null;
}

// ─── JPEG ───
function extractFromJpeg(data: Uint8Array): string | null {
  let offset = 2;
  while (offset < data.length - 1) {
    if (data[offset] !== 0xFF) break;
    const marker = data[offset + 1];
    if (marker === 0xE1) {
      const length = (data[offset + 2] << 8) | data[offset + 3];
      return parseExifBlock(data, offset + 4, length - 2);
    }
    if (marker === 0xD8 || marker === 0xD9) {
      offset += 2;
    } else {
      const segLen = (data[offset + 2] << 8) | data[offset + 3];
      offset += 2 + segLen;
    }
  }
  return null;
}

// ─── HEIF/HEIC (ISOBMFF) ───
// HEIC stores EXIF in an "Exif" box within the 'meta' box hierarchy.
// The EXIF payload starts with a 4-byte TIFF offset, then standard TIFF/EXIF.
function extractFromHeif(data: Uint8Array): string | null {
  // Scan for "Exif" marker in the binary (pragmatic approach — works for all HEIC encoders)
  const target = [0x45, 0x78, 0x69, 0x66]; // "Exif"
  for (let i = 0; i < Math.min(data.length - 100, 65536); i++) {
    if (data[i] === target[0] && data[i + 1] === target[1] &&
        data[i + 2] === target[2] && data[i + 3] === target[3]) {
      // Check if followed by 0x00 0x00 (standard Exif header in JPEG APP1)
      if (data[i + 4] === 0x00 && data[i + 5] === 0x00) {
        // Standard TIFF header starts at i+6
        const tiffData = data.subarray(i + 6);
        if (isTiffHeader(tiffData)) {
          return parseTiffExif(tiffData, 0);
        }
      }
      // HEIC variant: 4-byte offset prefix before TIFF header
      // The offset indicates bytes before TIFF header (usually 0 or small number)
      const tiffOffset = (data[i + 4] << 24) | (data[i + 5] << 16) | (data[i + 6] << 8) | data[i + 7];
      if (tiffOffset < 16) {
        const start = i + 4 + 4 + tiffOffset; // past "Exif" + 4-byte offset + offset value
        if (start < data.length - 8 && isTiffHeader(data.subarray(start))) {
          return parseTiffExif(data, start);
        }
      }
    }
  }
  return null;
}

function isTiffHeader(d: Uint8Array): boolean {
  if (d.length < 8) return false;
  // "II" (0x4949) little-endian or "MM" (0x4D4D) big-endian
  return (d[0] === 0x49 && d[1] === 0x49) || (d[0] === 0x4D && d[1] === 0x4D);
}

// ─── WebP ───
// EXIF is stored in an "EXIF" RIFF chunk
function extractFromWebP(data: Uint8Array): string | null {
  let offset = 12; // past "RIFF" + size + "WEBP"
  while (offset < data.length - 8) {
    const chunkId = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    const chunkSize = data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | (data[offset + 7] << 24);

    if (chunkId === 'EXIF') {
      const exifStart = offset + 8;
      // WebP EXIF: may start with "Exif\0\0" header or directly with TIFF header
      if (data[exifStart] === 0x45 && data[exifStart + 1] === 0x78) {
        // "Exif\0\0" prefix → TIFF starts 6 bytes later
        return parseTiffExif(data, exifStart + 6);
      }
      if (isTiffHeader(data.subarray(exifStart))) {
        return parseTiffExif(data, exifStart);
      }
    }

    // Chunks are padded to even size
    offset += 8 + chunkSize + (chunkSize & 1);
  }
  return null;
}

// ─── PNG ───
// EXIF is in an "eXIf" chunk (standardized in PNG 1.6 / 2017)
function extractFromPng(data: Uint8Array): string | null {
  let offset = 8; // past PNG signature
  while (offset < data.length - 12) {
    const length = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);

    if (type === 'eXIf') {
      const exifStart = offset + 8;
      if (isTiffHeader(data.subarray(exifStart))) {
        return parseTiffExif(data, exifStart);
      }
    }
    if (type === 'IEND') break;
    offset += 12 + length; // 4 len + 4 type + data + 4 CRC
  }
  return null;
}

// ─── Common TIFF/EXIF parser ───
function parseExifBlock(data: Uint8Array, start: number, _length: number): string | null {
  const exifHeader = String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3]);
  if (exifHeader !== 'Exif') return null;
  return parseTiffExif(data, start + 6);
}

function parseTiffExif(data: Uint8Array, tiffStart: number): string | null {
  if (tiffStart + 8 > data.length) return null;

  const byteOrder = (data[tiffStart] << 8) | data[tiffStart + 1];
  const isLE = byteOrder === 0x4949;

  const readU16 = (off: number) => {
    if (off + 1 >= data.length) return 0;
    return isLE ? data[off] | (data[off + 1] << 8) : (data[off] << 8) | data[off + 1];
  };

  const readU32 = (off: number) => {
    if (off + 3 >= data.length) return 0;
    return isLE
      ? data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | (data[off + 3] << 24)
      : (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3];
  };

  const ifd0Offset = readU32(tiffStart + 4);
  if (ifd0Offset === 0 || tiffStart + ifd0Offset >= data.length) return null;
  const ifd0Abs = tiffStart + ifd0Offset;

  let exifIFDOffset: number | null = null;
  let dateTime: string | null = null;

  const ifd0Count = readU16(ifd0Abs);
  for (let i = 0; i < ifd0Count; i++) {
    const entryOff = ifd0Abs + 2 + i * 12;
    if (entryOff + 12 > data.length) break;
    const tag = readU16(entryOff);
    if (tag === 0x8769) {
      exifIFDOffset = readU32(entryOff + 8);
    } else if (tag === TAG_DATETIME) {
      dateTime = readStringTag(data, entryOff, tiffStart, readU32);
    }
  }

  if (exifIFDOffset !== null) {
    const exifAbs = tiffStart + exifIFDOffset;
    if (exifAbs + 2 > data.length) return dateTime ? parseExifDateStr(dateTime) : null;

    const exifCount = readU16(exifAbs);
    let dateOriginal: string | null = null;
    let dateDigitized: string | null = null;

    for (let i = 0; i < exifCount; i++) {
      const entryOff = exifAbs + 2 + i * 12;
      if (entryOff + 12 > data.length) break;
      const tag = readU16(entryOff);
      if (tag === TAG_DATETIME_ORIGINAL) {
        dateOriginal = readStringTag(data, entryOff, tiffStart, readU32);
      } else if (tag === TAG_DATETIME_DIGITIZED) {
        dateDigitized = readStringTag(data, entryOff, tiffStart, readU32);
      }
    }

    const raw = dateOriginal || dateDigitized || dateTime;
    return raw ? parseExifDateStr(raw) : null;
  }

  return dateTime ? parseExifDateStr(dateTime) : null;
}

function readStringTag(
  data: Uint8Array,
  entryOff: number,
  tiffStart: number,
  readU32: (off: number) => number,
): string | null {
  const count = readU32(entryOff + 4);
  if (count <= 0 || count > 100) return null; // Sanity check
  let strOffset: number;
  if (count <= 4) {
    strOffset = entryOff + 8;
  } else {
    strOffset = tiffStart + readU32(entryOff + 8);
  }
  if (strOffset < 0 || strOffset + count > data.length) return null;
  let str = '';
  for (let j = 0; j < count - 1; j++) {
    str += String.fromCharCode(data[strOffset + j]);
  }
  return str || null;
}

/** Extract full EXIF data (date + GPS) from an ArrayBuffer. */
export function extractExifDataFromBuffer(buffer: ArrayBuffer): ExifData {
  try {
    const data = new Uint8Array(buffer);
    return extractExifDataAuto(data);
  } catch {
    return { date: null, lat: null, lng: null };
  }
}

function extractExifDataAuto(data: Uint8Array): ExifData {
  if (data.length < 12) return { date: null, lat: null, lng: null };

  // JPEG
  if (data[0] === 0xFF && data[1] === 0xD8) {
    return extractDataFromJpeg(data);
  }

  // HEIF/HEIC
  const ftyp = String.fromCharCode(data[4], data[5], data[6], data[7]);
  if (ftyp === 'ftyp') {
    // For HEIF, fall back to date-only (GPS extraction in HEIF is complex)
    const date = extractFromHeif(data);
    return { date, lat: null, lng: null };
  }

  // For other formats, date-only
  const date = extractExifDateAuto(data);
  return { date, lat: null, lng: null };
}

function extractDataFromJpeg(data: Uint8Array): ExifData {
  let offset = 2;
  while (offset < data.length - 1) {
    if (data[offset] !== 0xFF) break;
    const marker = data[offset + 1];
    if (marker === 0xE1) {
      const length = (data[offset + 2] << 8) | data[offset + 3];
      return parseExifBlockFull(data, offset + 4, length - 2);
    }
    if (marker === 0xD8 || marker === 0xD9) {
      offset += 2;
    } else {
      const segLen = (data[offset + 2] << 8) | data[offset + 3];
      offset += 2 + segLen;
    }
  }
  return { date: null, lat: null, lng: null };
}

function parseExifBlockFull(data: Uint8Array, start: number, _length: number): ExifData {
  const exifHeader = String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3]);
  if (exifHeader !== 'Exif') return { date: null, lat: null, lng: null };
  return parseTiffExifFull(data, start + 6);
}

function parseTiffExifFull(data: Uint8Array, tiffStart: number): ExifData {
  if (tiffStart + 8 > data.length) return { date: null, lat: null, lng: null };

  const byteOrder = (data[tiffStart] << 8) | data[tiffStart + 1];
  const isLE = byteOrder === 0x4949;

  const readU16 = (off: number) => {
    if (off + 1 >= data.length) return 0;
    return isLE ? data[off] | (data[off + 1] << 8) : (data[off] << 8) | data[off + 1];
  };

  const readU32 = (off: number) => {
    if (off + 3 >= data.length) return 0;
    return isLE
      ? data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | ((data[off + 3] << 24) >>> 0)
      : ((data[off] << 24) >>> 0) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3];
  };

  const ifd0Offset = readU32(tiffStart + 4);
  if (ifd0Offset === 0 || tiffStart + ifd0Offset >= data.length) return { date: null, lat: null, lng: null };
  const ifd0Abs = tiffStart + ifd0Offset;

  let exifIFDOffset: number | null = null;
  let gpsIFDOffset: number | null = null;
  let dateTime: string | null = null;

  const ifd0Count = readU16(ifd0Abs);
  for (let i = 0; i < ifd0Count; i++) {
    const entryOff = ifd0Abs + 2 + i * 12;
    if (entryOff + 12 > data.length) break;
    const tag = readU16(entryOff);
    if (tag === 0x8769) exifIFDOffset = readU32(entryOff + 8);
    else if (tag === TAG_GPS_IFD) gpsIFDOffset = readU32(entryOff + 8);
    else if (tag === TAG_DATETIME) dateTime = readStringTag(data, entryOff, tiffStart, readU32);
  }

  // Extract date from EXIF IFD
  let date: string | null = null;
  if (exifIFDOffset !== null) {
    const exifAbs = tiffStart + exifIFDOffset;
    if (exifAbs + 2 <= data.length) {
      const exifCount = readU16(exifAbs);
      let dateOriginal: string | null = null;
      let dateDigitized: string | null = null;
      for (let i = 0; i < exifCount; i++) {
        const entryOff = exifAbs + 2 + i * 12;
        if (entryOff + 12 > data.length) break;
        const tag = readU16(entryOff);
        if (tag === TAG_DATETIME_ORIGINAL) dateOriginal = readStringTag(data, entryOff, tiffStart, readU32);
        else if (tag === TAG_DATETIME_DIGITIZED) dateDigitized = readStringTag(data, entryOff, tiffStart, readU32);
      }
      const raw = dateOriginal || dateDigitized || dateTime;
      date = raw ? parseExifDateStr(raw) : null;
    }
  } else {
    date = dateTime ? parseExifDateStr(dateTime) : null;
  }

  // Extract GPS
  let lat: number | null = null;
  let lng: number | null = null;
  if (gpsIFDOffset !== null) {
    const gpsAbs = tiffStart + gpsIFDOffset;
    if (gpsAbs + 2 <= data.length) {
      const gpsCount = readU16(gpsAbs);
      let latRef = 'N';
      let lngRef = 'E';
      let latVals: number[] | null = null;
      let lngVals: number[] | null = null;
      for (let i = 0; i < gpsCount; i++) {
        const entryOff = gpsAbs + 2 + i * 12;
        if (entryOff + 12 > data.length) break;
        const tag = readU16(entryOff);
        if (tag === TAG_GPS_LAT_REF) {
          latRef = String.fromCharCode(data[entryOff + 8]);
        } else if (tag === TAG_GPS_LNG_REF) {
          lngRef = String.fromCharCode(data[entryOff + 8]);
        } else if (tag === TAG_GPS_LAT) {
          latVals = readRationalArray(data, entryOff, tiffStart, readU32, 3);
        } else if (tag === TAG_GPS_LNG) {
          lngVals = readRationalArray(data, entryOff, tiffStart, readU32, 3);
        }
      }
      if (latVals) {
        lat = latVals[0] + latVals[1] / 60 + latVals[2] / 3600;
        if (latRef === 'S') lat = -lat;
      }
      if (lngVals) {
        lng = lngVals[0] + lngVals[1] / 60 + lngVals[2] / 3600;
        if (lngRef === 'W') lng = -lng;
      }
    }
  }

  return { date, lat, lng };
}

function readRationalArray(
  data: Uint8Array,
  entryOff: number,
  tiffStart: number,
  readU32: (off: number) => number,
  count: number,
): number[] {
  const valueOffset = tiffStart + readU32(entryOff + 8);
  const vals: number[] = [];
  for (let i = 0; i < count; i++) {
    const off = valueOffset + i * 8;
    if (off + 8 > data.length) break;
    const num = readU32(off);
    const den = readU32(off + 4);
    vals.push(den > 0 ? num / den : 0);
  }
  return vals;
}

/** Convert EXIF date "2024:03:15 14:30:00" → ISO string */
function parseExifDateStr(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}
