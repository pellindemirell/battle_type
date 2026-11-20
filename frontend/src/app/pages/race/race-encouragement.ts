export interface EncouragementSample {
  elapsedMs: number;
  lastPopupMs: number;
  wpm: number;
  previousWpm: number;
  wpmFiveSecondsAgo?: number;
  correctStreak: number;
}

export const ENCOURAGEMENT_MESSAGES = [
  'Amazing!', 'Perfect!', 'Harika!', 'Muhteşem!', 'Alev alev!'
] as const;

export function shouldEncourage(sample: EncouragementSample): boolean {
  if (sample.elapsedMs < 5000 || sample.elapsedMs - sample.lastPopupMs < 8000) return false;
  if (sample.correctStreak >= 20) return true;
  if (sample.wpm < 20) return false;

  const historicalWpm = sample.wpmFiveSecondsAgo ?? 0;
  return (historicalWpm > 0 && sample.wpm * 100 >= historicalWpm * 115) ||
    [30, 50, 70, 90].some(milestone => sample.previousWpm < milestone && sample.wpm >= milestone);
}
