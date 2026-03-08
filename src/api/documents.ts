import { Platform } from 'react-native';
import { supabase } from './supabase';
import { ActivityDocument } from '../types/database';

export const getDocuments = async (activityId: string): Promise<ActivityDocument[]> => {
  const { data, error } = await supabase
    .from('activity_documents')
    .select('*')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

/**
 * Sanitize filename for safe Supabase Storage upload.
 * - Strips dangerous double extensions (.php.pdf → .pdf)
 * - Removes special chars, keeps umlauts readable
 */
const DANGEROUS_EXTENSIONS = /\.(php|asp|aspx|jsp|cgi|sh|bash|exe|bat|cmd|com|ps1)\./gi;

function sanitizeFileName(raw: string): string {
  let name = raw.replace(DANGEROUS_EXTENSIONS, '.');
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  let base = lastDot > 0 ? name.slice(0, lastDot) : name;

  base = base
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  if (!base) base = 'dokument';
  return `${base}${ext.toLowerCase()}`;
}

function buildStoragePath(tripId: string, activityId: string, fileName: string): string {
  let safe = sanitizeFileName(fileName);
  const dot = safe.lastIndexOf('.');
  if (dot > 30) safe = safe.slice(0, 30) + safe.slice(dot);
  return `${tripId}/${activityId.slice(0, 8)}/${Date.now().toString(36)}_${safe}`;
}

/**
 * Compress image on web via Canvas.
 * Uses high quality (0.85) to preserve QR code readability.
 * Max dimension 2000px — big enough for detail, small enough for storage.
 */
const compressImage = (uri: string, maxSize = 2000, quality = 0.85): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      // Use high-quality image smoothing for QR code preservation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = uri;
  });
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif'];

export const uploadDocument = async (
  activityId: string,
  tripId: string,
  userId: string,
  uri: string,
  fileName: string,
  fileType: string,
  fileSize?: number,
): Promise<ActivityDocument> => {
  const path = buildStoragePath(tripId, activityId, fileName);
  const isImage = IMAGE_TYPES.includes(fileType.toLowerCase());

  let blob: Blob;
  let finalType = fileType;
  let finalSize = fileSize;

  if (isImage && Platform.OS === 'web') {
    // Compress images (preserves QR codes at 0.85 quality)
    try {
      blob = await compressImage(uri);
      finalType = 'image/jpeg';
      finalSize = blob.size;
    } catch {
      // Fallback to original
      const response = await fetch(uri);
      blob = await response.blob();
    }
  } else {
    // PDFs and other docs: upload as-is
    const response = await fetch(uri);
    blob = await response.blob();
  }

  const { error: uploadError } = await supabase.storage
    .from('activity-documents')
    .upload(path, blob, { contentType: finalType });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('activity-documents')
    .getPublicUrl(path);

  const { data, error } = await supabase
    .from('activity_documents')
    .insert({
      activity_id: activityId,
      trip_id: tripId,
      user_id: userId || null,
      storage_path: path,
      url: publicUrl,
      file_name: fileName,
      file_type: finalType,
      file_size: finalSize || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

/** Returns set of activity IDs that have at least one document */
export const getActivityIdsWithDocuments = async (activityIds: string[]): Promise<Set<string>> => {
  if (activityIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('activity_documents')
    .select('activity_id')
    .in('activity_id', activityIds);
  if (error) return new Set();
  return new Set((data || []).map(d => d.activity_id));
};

export const deleteDocument = async (doc: ActivityDocument): Promise<void> => {
  await supabase.storage.from('activity-documents').remove([doc.storage_path]);
  const { error } = await supabase.from('activity_documents').delete().eq('id', doc.id);
  if (error) throw error;
};
