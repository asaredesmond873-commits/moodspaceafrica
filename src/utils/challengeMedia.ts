import { CHALLENGE_LIMITS, type AfricanRegion, type ChallengeVideo } from '../types';

const ROUND_EPOCH_MS = Date.UTC(2026, 10, 16, 0, 0, 0); // 2026-11-16T00:00:00Z
const ROUND_DURATION_MS = CHALLENGE_LIMITS.ROUND_DAYS * 24 * 60 * 60 * 1000;

export interface ChallengeRoundInfo {
  roundNumber: number;
  roundId: string;
  label: string;
  startMs: number;
  endMs: number;
}

export function getCurrentChallengeRound(nowMs = Date.now()): ChallengeRoundInfo {
  const roundNumber = Math.max(
    1,
    Math.floor((nowMs - ROUND_EPOCH_MS) / ROUND_DURATION_MS) + 1
  );
  const startMs = ROUND_EPOCH_MS + (roundNumber - 1) * ROUND_DURATION_MS;
  const endMs = startMs + ROUND_DURATION_MS;
  return {
    roundNumber,
    roundId: `round_${roundNumber}`,
    label: `Round ${roundNumber}`,
    startMs,
    endMs,
  };
}

export function getCountdownParts(targetMs: number, nowMs = Date.now()) {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    days,
    hours,
    minutes,
    seconds,
    isFinished: diff <= 0,
  };
}

export function getTodayUtcDateKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}_${month}_${day}`;
}

export function formatDurationSeconds(sec: number): string {
  const rounded = Math.max(0, Math.round(sec));
  const mins = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export function formatFileSizeMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatCompactCount(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function getAfricanRegionFromLocation(location: string): Exclude<AfricanRegion, 'All Africa'> {
  const loc = (location || '').toLowerCase();
  if (
    loc.includes('nigeria') ||
    loc.includes('ghana') ||
    loc.includes('senegal') ||
    loc.includes('ivoire') ||
    loc.includes('ivory coast') ||
    loc.includes('mali') ||
    loc.includes('benin') ||
    loc.includes('togo') ||
    loc.includes('sierra leone') ||
    loc.includes('liberia') ||
    loc.includes('gambia') ||
    loc.includes('burkina') ||
    loc.includes('niger') ||
    loc.includes('guinea')
  ) {
    return 'West Africa';
  }
  if (
    loc.includes('kenya') ||
    loc.includes('rwanda') ||
    loc.includes('ethiopia') ||
    loc.includes('uganda') ||
    loc.includes('tanzania') ||
    loc.includes('somalia') ||
    loc.includes('burundi') ||
    loc.includes('eritrea') ||
    loc.includes('djibouti') ||
    loc.includes('mauritius') ||
    loc.includes('seychelles')
  ) {
    return 'East Africa';
  }
  if (
    loc.includes('south africa') ||
    loc.includes('zambia') ||
    loc.includes('zimbabwe') ||
    loc.includes('botswana') ||
    loc.includes('namibia') ||
    loc.includes('mozambique') ||
    loc.includes('malawi') ||
    loc.includes('angola') ||
    loc.includes('eswatini') ||
    loc.includes('lesotho')
  ) {
    return 'Southern Africa';
  }
  if (
    loc.includes('egypt') ||
    loc.includes('morocco') ||
    loc.includes('tunisia') ||
    loc.includes('algeria') ||
    loc.includes('libya') ||
    loc.includes('sudan')
  ) {
    return 'North Africa';
  }
  if (
    loc.includes('cameroon') ||
    loc.includes('congo') ||
    loc.includes('gabon') ||
    loc.includes('chad') ||
    loc.includes('equatorial guinea') ||
    loc.includes('central african')
  ) {
    return 'Central Africa';
  }
  return 'West Africa';
}

export function computeCreatorSupportScore(video: ChallengeVideo, nowMs = Date.now()): number {
  const boostBonus = video.boostedUntil > nowMs ? 60 : video.boostedUntil > 0 ? 20 : 0;
  return (
    video.votesCount * 10 +
    video.giftsTotalGhs * 5 +
    boostBonus +
    video.likesCount * 3 +
    video.commentsCount * 4 +
    video.sharesCount * 5 +
    video.viewsCount
  );
}

export interface ValidatedVideoMeta {
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

export async function validateChallengeVideoFile(file: File): Promise<ValidatedVideoMeta> {
  if (!file.type.startsWith('video/')) {
    throw new Error('Only video files are allowed (MP4, WebM, MOV). Text stories are not permitted.');
  }

  if (file.size <= 0) {
    throw new Error('Selected video file is empty.');
  }

  if (file.size >= CHALLENGE_LIMITS.MAX_FILE_BYTES) {
    throw new Error(
      `Video size is ${formatFileSizeMb(file.size)}. Videos must be strictly under 15 MB.`
    );
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const meta = await new Promise<ValidatedVideoMeta>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not read video duration. Please try an MP4 or WebM file.'));
        }
      }, 15000);

      const finishError = (msg: string) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error(msg));
        }
      };

      video.onerror = () => {
        finishError('Unsupported video format. Please upload MP4 or WebM.');
      };

      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          finishError('Unable to detect video length.');
          return;
        }
        if (duration < CHALLENGE_LIMITS.MIN_DURATION_SEC) {
          finishError(
            `Video is ${Math.round(duration)}s long. Minimum length is ${CHALLENGE_LIMITS.MIN_DURATION_SEC} seconds.`
          );
          return;
        }
        if (duration > CHALLENGE_LIMITS.MAX_DURATION_SEC) {
          finishError(
            `Video is ${Math.round(duration)}s long. Maximum length is ${CHALLENGE_LIMITS.MAX_DURATION_SEC} seconds.`
          );
          return;
        }

        const captureTime = Math.min(1.5, Math.max(0.2, duration * 0.1));
        video.currentTime = captureTime;
      };

      video.onseeked = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);

        let thumbnailUrl = '';
        try {
          const vw = video.videoWidth || 480;
          const vh = video.videoHeight || 854;
          const targetW = Math.min(480, vw);
          const targetH = Math.round((vh * targetW) / vw);
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetW, targetH);
            let q = 0.78;
            thumbnailUrl = canvas.toDataURL('image/jpeg', q);
            while (thumbnailUrl.length > CHALLENGE_LIMITS.THUMBNAIL_MAX && q > 0.35) {
              q -= 0.12;
              thumbnailUrl = canvas.toDataURL('image/jpeg', q);
            }
            if (thumbnailUrl.length > CHALLENGE_LIMITS.THUMBNAIL_MAX) {
              thumbnailUrl = '';
            }
          }
        } catch {
          thumbnailUrl = '';
        }

        resolve({
          durationSeconds: Math.round(video.duration * 10) / 10,
          fileSizeBytes: file.size,
          mimeType: (file.type || 'video/mp4').slice(0, 60),
          thumbnailUrl,
          width: video.videoWidth || 480,
          height: video.videoHeight || 854,
        });
      };

      video.src = objectUrl;
    });

    return meta;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encodeFileIntoBase64Chunks(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = CHALLENGE_LIMITS.CHUNK_RAW_BYTES;
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    chunks.push(uint8ToBase64(slice));
  }

  if (chunks.length > CHALLENGE_LIMITS.MAX_CHUNKS) {
    throw new Error('Video file requires too many storage chunks. Please compress slightly.');
  }

  return chunks;
}

export function decodeBase64ChunksToBlob(chunks: string[], mimeType: string): Blob {
  const byteParts = chunks.map((chunk) => {
    const arr = base64ToUint8(chunk);
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
  });
  return new Blob(byteParts, { type: mimeType || 'video/mp4' });
}

// IndexedDB + In-Memory Cache for fast mobile repeat playback across Africa
const IDB_NAME = 'moodspace_video_cache_v1';
const IDB_STORE = 'videos';
const memoryBlobUrlCache = new Map<string, string>();
const inFlightVideoLoads = new Map<string, Promise<string>>();

function openVideoCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readCachedVideoBlob(videoId: string): Promise<Blob | null> {
  const db = await openVideoCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(videoId);
      req.onsuccess = () => {
        resolve(req.result instanceof Blob ? req.result : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCachedVideoBlob(videoId: string, blob: Blob): Promise<void> {
  const db = await openVideoCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(blob, videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cacheUploadedVideoBlob(videoId: string, file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  memoryBlobUrlCache.set(videoId, url);
  await writeCachedVideoBlob(videoId, file);
  return url;
}

export function loadCachedOrRemoteVideoUrl(
  videoId: string,
  mimeType: string,
  fetchChunksFn: (videoId: string) => Promise<string[]>
): Promise<string> {
  const existingMem = memoryBlobUrlCache.get(videoId);
  if (existingMem) {
    return Promise.resolve(existingMem);
  }

  const inFlight = inFlightVideoLoads.get(videoId);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const cachedBlob = await readCachedVideoBlob(videoId);
    if (cachedBlob) {
      const url = URL.createObjectURL(cachedBlob);
      memoryBlobUrlCache.set(videoId, url);
      return url;
    }

    const chunks = await fetchChunksFn(videoId);
    if (chunks.length === 0) {
      throw new Error('Video media chunks not found yet.');
    }
    const blob = decodeBase64ChunksToBlob(chunks, mimeType);
    const url = URL.createObjectURL(blob);
    memoryBlobUrlCache.set(videoId, url);
    void writeCachedVideoBlob(videoId, blob);
    return url;
  })().finally(() => {
    inFlightVideoLoads.delete(videoId);
  });

  inFlightVideoLoads.set(videoId, task);
  return task;
}
