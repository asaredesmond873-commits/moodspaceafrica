const NOTIF_LAST_READ_KEY = 'moodspace_notif_last_read_ms_v1';

export function getNotifLastReadMs(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(NOTIF_LAST_READ_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function markAllNotificationsReadNow(): number {
  const now = Date.now();
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(NOTIF_LAST_READ_KEY, String(now));
  }
  return now;
}
