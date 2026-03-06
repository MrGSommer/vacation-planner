import { Platform } from 'react-native';

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface CompressedImage {
  base64: string;
  mediaType: MediaType;
  blob: Blob;
}

/**
 * Compress an image for receipt scanning.
 * Web: uses canvas to resize and compress.
 * Native: accepts a URI string from expo-image-picker.
 */
export async function compressForReceipt(input: File | Blob | string): Promise<CompressedImage> {
  if (Platform.OS === 'web') {
    return compressWeb(input as File | Blob);
  }
  // Native: input is a URI string from expo-image-picker
  const uri = typeof input === 'string' ? input : '';
  if (!uri) throw new Error('Native requires a URI string');
  const response = await fetch(uri);
  const blob = await response.blob();
  return blobToCompressedImage(blob);
}

async function compressWeb(file: File | Blob): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            // Strip "data:image/jpeg;base64," prefix
            const base64 = dataUrl.split(',')[1];
            resolve({ base64, mediaType: 'image/jpeg', blob });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

async function blobToCompressedImage(blob: Blob): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const mediaType: MediaType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve({ base64, mediaType, blob });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
