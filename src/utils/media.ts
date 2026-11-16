import type { Timestamp } from 'firebase/firestore';
import type { FormSubmission, Post } from '../types';

export const STUDIO_PRESET_IMAGES = [
  {
    label: 'Lagos Courtyard Gathering',
    url: '/src/assets/images/hero_africa_community_1794838619763.jpg',
  },
  {
    label: 'Acoustic Music Evening',
    url: '/src/assets/images/showcase_music_festival_1794838619312.jpg',
  },
  {
    label: 'Artisanal Textile Showcase',
    url: '/src/assets/images/showcase_fashion_promo_1794838620670.jpg',
  },
  {
    label: 'Nairobi Founders Table',
    url: '/src/assets/images/showcase_tech_summit_1794838620227.jpg',
  },
];

export function generateSafeId(prefix = 'ms'): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return `${prefix}_${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Just now';
  try {
    const date = ts.toDate();
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Recent';
  }
}

export function formatFullDate(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Pending';
  try {
    return ts.toDate().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export async function compressImageFile(
  file: File,
  maxWidth = 1080,
  maxBytes = 280000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file format.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxBytes && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > maxBytes) {
          // Scale down once more for very dense images
          const scale = 0.65;
          canvas.width = Math.max(320, Math.round(width * scale));
          canvas.height = Math.max(240, Math.round(height * scale));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export type ParsedVideo =
  | { kind: 'youtube'; embedUrl: string }
  | { kind: 'vimeo'; embedUrl: string }
  | { kind: 'direct'; srcUrl: string }
  | { kind: 'invalid' };

export function parseVideoUrl(rawUrl: string): ParsedVideo {
  const url = rawUrl.trim();
  if (!url) return { kind: 'invalid' };

  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      kind: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  if (/^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(url) || url.startsWith('https://')) {
    return { kind: 'direct', srcUrl: url };
  }

  return { kind: 'invalid' };
}

export function downloadSubmissionsCsv(post: Post, submissions: FormSubmission[]) {
  const fields = post.formConfig.fields;
  const headers = [
    'Submission ID',
    'Submitter Name',
    'Submitted At',
    ...fields.map((f) => f.label),
  ];

  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = submissions.map((sub) => [
    sub.id,
    sub.submitterName,
    formatFullDate(sub.createdAt),
    ...fields.map((f) => {
      const answer = sub.answers[f.id];
      if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
      return answer ?? '';
    }),
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-responses.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
