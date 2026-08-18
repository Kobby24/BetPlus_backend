const STORAGE_KEY = "betplus_win_celebrations_seen";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function hasSeenWinCelebration(betId: string) {
  return readSeen().has(betId);
}

export function markWinCelebrationSeen(betId: string) {
  const seen = readSeen();
  seen.add(betId);
  writeSeen(seen);
}
