import type { DailyRecord, PersistedStats, RunSummary } from './types.ts';

const STORAGE_KEY = 'paperweight_archive_v1';

const DEFAULT_STATS: PersistedStats = {
  muted: false,
  currentStreak: 0,
  bestStreak: 0,
  bestScore: 0,
  gamesPlayed: 0,
  lastDailyDateKey: null,
  todayRecord: null,
};

function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  const py = dt.getUTCFullYear();
  const pm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(dt.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

export function loadPersistedStats(todayDateKey: string): PersistedStats {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<PersistedStats>;
    const todayRecord =
      parsed.todayRecord && parsed.todayRecord.dateKey === todayDateKey
        ? parsed.todayRecord
        : null;

    // Reset streak if missed yesterday and haven't played today
    let currentStreak = parsed.currentStreak ?? 0;
    const yesterdayKey = getPreviousDateKey(todayDateKey);
    if (
      parsed.lastDailyDateKey &&
      parsed.lastDailyDateKey !== todayDateKey &&
      parsed.lastDailyDateKey !== yesterdayKey
    ) {
      currentStreak = 0;
    }

    return {
      muted: Boolean(parsed.muted),
      currentStreak,
      bestStreak: parsed.bestStreak ?? 0,
      bestScore: parsed.bestScore ?? 0,
      gamesPlayed: parsed.gamesPlayed ?? 0,
      lastDailyDateKey: parsed.lastDailyDateKey ?? null,
      todayRecord,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveMutedPref(muted: boolean): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PersistedStats>) : {};
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_STATS, ...parsed, muted })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function recordRunResult(summary: RunSummary, todayDateKey: string): PersistedStats {
  const current = loadPersistedStats(todayDateKey);
  const next: PersistedStats = {
    ...current,
    gamesPlayed: current.gamesPlayed + 1,
    bestScore: Math.max(current.bestScore, summary.score),
  };

  if (summary.mode === 'DAILY' && !current.todayRecord) {
    const yesterdayKey = getPreviousDateKey(todayDateKey);
    let nextStreak = current.currentStreak;
    if (summary.victory) {
      nextStreak =
        current.lastDailyDateKey === yesterdayKey ? current.currentStreak + 1 : 1;
    } else {
      nextStreak = 0;
    }

    const dailyRecord: DailyRecord = {
      dateKey: summary.dateKey,
      editionNumber: summary.editionNumber,
      victory: summary.victory,
      score: summary.score,
      tiersLocked: summary.tiersLocked,
      summary,
    };

    next.currentStreak = nextStreak;
    next.bestStreak = Math.max(current.bestStreak, nextStreak);
    next.lastDailyDateKey = summary.dateKey;
    next.todayRecord = dailyRecord;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }

  return next;
}
