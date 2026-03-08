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
 * - Convention: {original_name_sanitized}.{ext}
 */
const DANGEROUS_EXTENSIONS = /\.(php|asp|aspx|jsp|cgi|sh|bash|exe|bat|cmd|com|ps1)\./gi;

function sanitizeFileName(raw: string): string {
  // Remove dangerous intermediate extensions (alhambra.php.pdf → alhambra.pdf)
  let name = raw.replace(DANGEROUS_EXTENSIONS, '.');

  // Split into base + extension
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  let base = lastDot > 0 ? name.slice(0, lastDot) : name;

  // Transliterate umlauts for path safety
  base = base
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  // Ensure we have a base name
  if (!base) base = 'dokument';

  return `${base}${ext.toLowerCase()}`;
}

/**
 * Build storage path: {tripId}/{activityId_short}/{ts_base36}_{name}
 * e.g. a1fa123d-.../4b1cffd1/m3kx7_alhambra.pdf
 */
function buildStoragePath(tripId: string, activityId: string, fileName: string): string {
  let safe = sanitizeFileName(fileName);
  // Truncate base name to max 30 chars (keep extension)
  const dot = safe.lastIndexOf('.');
  if (dot > 30) safe = safe.slice(0, 30) + safe.slice(dot);
  return `${tripId}/${activityId.slice(0, 8)}/${Date.now().toString(36)}_${safe}`;
}

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

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('activity-documents')
    .upload(path, blob, { contentType: fileType });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('activity-documents')
    .getPublicUrl(path);

  const { data, error } = await supabase
    .from('activity_documents')
    .insert({
      activity_id: activityId,
      trip_id: tripId,
      user_id: userId,
      storage_path: path,
      url: publicUrl,
      file_name: fileName, // Keep original display name
      file_type: fileType,
      file_size: fileSize || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteDocument = async (doc: ActivityDocument): Promise<void> => {
  await supabase.storage.from('activity-documents').remove([doc.storage_path]);
  const { error } = await supabase.from('activity_documents').delete().eq('id', doc.id);
  if (error) throw error;
};
