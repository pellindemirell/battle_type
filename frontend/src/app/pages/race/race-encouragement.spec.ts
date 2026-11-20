import { EncouragementSample, shouldEncourage } from './race-encouragement';

describe('shouldEncourage', () => {
  const base: EncouragementSample = {
    elapsedMs: 10000, lastPopupMs: -Infinity, wpm: 25, previousWpm: 25, correctStreak: 0
  };

  it('uses a 15 percent rise and a minimum WPM', () => {
    expect(shouldEncourage({ ...base, wpm: 23, wpmFiveSecondsAgo: 20 })).toBe(true);
    expect(shouldEncourage({ ...base, wpm: 22, wpmFiveSecondsAgo: 20 })).toBe(false);
    expect(shouldEncourage({ ...base, wpm: 19, wpmFiveSecondsAgo: 10 })).toBe(false);
  });

  it.each([30, 50, 70, 90])('recognizes an upward crossing at %s WPM', wpm => {
    expect(shouldEncourage({ ...base, wpm, previousWpm: wpm - 1 })).toBe(true);
    expect(shouldEncourage({ ...base, wpm, previousWpm: wpm })).toBe(false);
  });

  it('uses a 20-key streak independently and honors both time limits', () => {
    const streak = { ...base, correctStreak: 20, wpm: 10 };
    expect(shouldEncourage(streak)).toBe(true);
    expect(shouldEncourage({ ...streak, correctStreak: 19 })).toBe(false);
    expect(shouldEncourage({ ...streak, elapsedMs: 4999 })).toBe(false);
    expect(shouldEncourage({ ...streak, lastPopupMs: 2001 })).toBe(false);
    expect(shouldEncourage({ ...streak, lastPopupMs: 2000 })).toBe(true);
  });
});
