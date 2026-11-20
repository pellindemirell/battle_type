import { formatRaceDuration } from './race-duration';

describe('formatRaceDuration', () => {
  it.each([
    [0, 1, '00:00.0'],
    [1234, 1, '00:01.2'],
    [61239, 2, '01:01.23'],
    [null, 2, 'Bitirmedi']
  ] as const)('formats %s ms with precision %s', (milliseconds, precision, expected) => {
    expect(formatRaceDuration(milliseconds, precision)).toBe(expected);
  });
});
