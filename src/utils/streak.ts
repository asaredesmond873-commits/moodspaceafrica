import { getTodayUtcDateKey } from './challengeMedia';

const STREAK_STORAGE_KEY = 'moodspace_supporter_streak_v1';

export interface SupporterStreakState {
  count: number;
  lastActiveDateKey: string;
}

function getPreviousUtcDateKey(dateKey: string): string {
  const parts = dateKey.split('_').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '';
  }
  const [year, month, day] = parts;
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return getTodayUtcDateKey(dt);
}

export function readSupporterStreak(todayKey = getTodayUtcDateKey()): SupporterStreakState {
  if (typeof window === 'undefined') {
    return { count: 0, lastActiveDateKey: '' };
  }
  try {
    const raw = window.localStorage.getItem(STREAK_STORAGE_KEY);
    if (!raw) return { count: 0, lastActiveDateKey: '' };
    const parsed = JSON.parse(raw) as Partial<SupporterStreakState>;
    const count = typeof parsed.count === 'number' && parsed.count > 0 ? Math.floor(parsed.count) : 0;
    const lastActiveDateKey = typeof parsed.lastActiveDateKey === 'string' ? parsed.lastActiveDateKey : '';
    if (!lastActiveDateKey || count === 0) {
      return { count: 0, lastActiveDateKey: '' };
    }
    const yesterdayKey = getPreviousUtcDateKey(todayKey);
    if (lastActiveDateKey === todayKey || lastActiveDateKey === yesterdayKey) {
      return { count, lastActiveDateKey };
    }
    return { count: 0, lastActiveDateKey: '' };
  } catch {
    return { count: 0, lastActiveDateKey: '' };
  }
}

export function recordSupporterActivity(todayKey = getTodayUtcDateKey()): SupporterStreakState {
  const current = readSupporterStreak(todayKey);
  if (current.lastActiveDateKey === todayKey && current.count > 0) {
    return current;
  }
  const yesterdayKey = getPreviousUtcDateKey(todayKey);
  const nextCount = current.lastActiveDateKey === yesterdayKey ? current.count + 1 : 1;
  const next: SupporterStreakState = {
    count: nextCount,
    lastActiveDateKey: todayKey,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}
