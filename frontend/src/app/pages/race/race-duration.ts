export function formatRaceDuration(milliseconds: number | null | undefined, precision: 1 | 2 = 2): string {
  if (milliseconds == null) return 'Bitirmedi';

  const centiseconds = Math.max(0, Math.floor(milliseconds / 10));
  const minutes = String(Math.floor(centiseconds / 6000)).padStart(2, '0');
  const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, '0');
  const fraction = String(centiseconds % 100).padStart(2, '0').slice(0, precision);
  return `${minutes}:${seconds}.${fraction}`;
}
