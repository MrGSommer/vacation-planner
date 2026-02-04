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

export const uploadDocument = async (
  activityId: string,
  tripId: string,
  userId: string,
  uri: string,
  fileName: string,
  fileType: string,
  fileSize?: number,
): Promise<ActivityDocument> => {
  const path = `${tripId}/${activityId}/${Date.now()}_${fileName}`;

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
      file_name: fileName,
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
