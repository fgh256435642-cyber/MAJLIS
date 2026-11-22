import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';
import { DATA_IMAGE_URL_PATTERN } from '../utils/validation';

export interface UploadImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxDataUrlLength?: number;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const FIRESTORE_FALLBACK_MAX_FILE_BYTES = 400 * 1024;
const FIRESTORE_FALLBACK_MAX_DATA_URL_LENGTH = 600_000;
const INLINE_MEDIA_MIME_PATTERN =
  /^(audio\/(aac|mp4|mpeg|ogg|wav|webm)|video\/(mp4|mpeg|ogg|webm|quicktime))$/i;
let storageUnavailableForSession = false;

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_REGEX.test(file.name);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
    img.src = objectUrl;
  });
}

export async function compressImageToDataUrl(
  file: File,
  options?: UploadImageOptions
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 640;
  const maxHeight = options?.maxHeight ?? 640;
  const maxLen = Math.min(
    options?.maxDataUrlLength ?? 160_000,
    FIRESTORE_FALLBACK_MAX_DATA_URL_LENGTH - 5_000
  );

  const maxOriginalFileSize = Math.floor((maxLen - 64) * 0.75);
  if (file.size <= maxOriginalFileSize) {
    const raw = await readFileAsDataUrl(file);
    if (raw.length <= maxLen && DATA_IMAGE_URL_PATTERN.test(raw)) {
      return raw;
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = Math.max(1, img.naturalWidth || img.width || 1);
    const srcH = Math.max(1, img.naturalHeight || img.height || 1);
    const initialScale = Math.min(1, maxWidth / srcW, maxHeight / srcH);

    let targetW = Math.max(1, Math.round(srcW * initialScale));
    let targetH = Math.max(1, Math.round(srcH * initialScale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }

    const mimeCandidates: Array<'image/webp' | 'image/jpeg'> = ['image/webp', 'image/jpeg'];
    const qualities = [0.85, 0.72, 0.58, 0.44, 0.32];

    for (let shrinkPass = 0; shrinkPass < 4; shrinkPass++) {
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const mime of mimeCandidates) {
        for (const q of qualities) {
          const dataUrl = canvas.toDataURL(mime, q);
          if (
            dataUrl.startsWith(`data:${mime};base64,`) &&
            dataUrl.length <= maxLen &&
            DATA_IMAGE_URL_PATTERN.test(dataUrl)
          ) {
            return dataUrl;
          }
        }
      }

      targetW = Math.max(64, Math.round(targetW * 0.7));
      targetH = Math.max(64, Math.round(targetH * 0.7));
    }

    throw new Error('Image is too large even after compression. Please choose a smaller image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function tryFirebaseStorageUpload(
  storagePath: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  // Prevent Firebase Storage SDK from hanging for 10 minutes on unprovisioned/404 buckets
  storage.maxUploadRetryTime = 2000;
  storage.maxOperationRetryTime = 2000;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const fullPath = `${storagePath}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, fullPath);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
    });

    let settled = false;
    let lastTransferred = 0;
    const timeoutId = window.setTimeout(() => {
      if (settled || lastTransferred > 0) return;
      settled = true;
      try {
        task.cancel();
      } catch {
        // Ignore cancel errors
      }
      reject(new Error('STORAGE_TIMEOUT'));
    }, 3200);

    task.on(
      'state_changed',
      (snapshot) => {
        lastTransferred = snapshot.bytesTransferred;
        if (onProgress && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        reject(error);
      },
      async () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

async function uploadSmallFileToFirestore(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (file.size > FIRESTORE_FALLBACK_MAX_FILE_BYTES) {
    throw new Error(
      'Firebase Storage is unavailable. The Firestore fallback supports files up to 400 KB; choose a smaller file or enable Firebase Storage.'
    );
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const commaIndex = rawDataUrl.indexOf(',');
  if (!rawDataUrl.startsWith('data:') || commaIndex < 0) {
    throw new Error('Failed to encode file for the Firestore fallback.');
  }

  const requestedMimeType = file.type.split(';', 1)[0].trim().toLowerCase();
  const mimeType = INLINE_MEDIA_MIME_PATTERN.test(requestedMimeType)
    ? requestedMimeType
    : 'application/octet-stream';
  const dataUrl = `data:${mimeType};base64,${rawDataUrl.slice(commaIndex + 1)}`;

  if (dataUrl.length > FIRESTORE_FALLBACK_MAX_DATA_URL_LENGTH) {
    throw new Error(
      'Firebase Storage is unavailable. The Firestore fallback supports files up to 400 KB; choose a smaller file or enable Firebase Storage.'
    );
  }

  onProgress?.(100);
  return dataUrl;
}

export async function uploadFileToStorage(
  storagePath: string,
  file: File,
  onProgress?: (percent: number) => void,
  imageOptions?: UploadImageOptions
): Promise<string> {
  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('File exceeds the 15 MB upload limit.');
  }

  const image = isImageFile(file);

  if (!storageUnavailableForSession) {
    try {
      return await tryFirebaseStorageUpload(storagePath, file, onProgress);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : '';
      if (
        code === 'storage/bucket-not-found' ||
        code === 'storage/project-not-found' ||
        code === 'storage/retry-limit-exceeded' ||
        code === 'storage/unknown' ||
        code === 'storage/unauthorized' ||
        msg === 'STORAGE_TIMEOUT' ||
        msg.includes('404')
      ) {
        storageUnavailableForSession = true;
      }

      if (!image && !storageUnavailableForSession) {
        if (code === 'storage/unauthenticated') {
          throw new Error('Sign in before uploading files.');
        }
        throw new Error('Upload failed. Check your connection and Firebase Storage setup.');
      }
    }
  }

  if (image) {
    const dataUrl = await compressImageToDataUrl(file, imageOptions);
    onProgress?.(100);
    return dataUrl;
  }

  if (storageUnavailableForSession) {
    return uploadSmallFileToFirestore(file, onProgress);
  }

  throw new Error('File upload requires Firebase Storage to be enabled.');
}
