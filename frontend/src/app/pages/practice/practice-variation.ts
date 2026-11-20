export function nextPracticeText(lessonText: string, previousText: string): string {
  const lessonKeys = lessonText.replace(/\s/g, '');
  const keys = Array.from(new Set(lessonKeys));
  if (keys.length === 0) return lessonText;

  const previousLength = previousText.replace(/\s/g, '').length;
  const length = previousLength + Math.max(8, Math.ceil(lessonKeys.length / 3));
  const characters: string[] = [];

  // Use every key before reshuffling so shorter drills still cover the lesson.
  while (characters.length < length) {
    const round = keys.slice();
    for (let index = round.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [round[index], round[swap]] = [round[swap], round[index]];
    }
    characters.push(...round);
  }

  const groups: string[] = [];
  for (let start = 0; start < length;) {
    const end = Math.min(start + 4 + Math.floor(Math.random() * 3), length);
    groups.push(characters.slice(start, end).join(''));
    start = end;
  }

  return groups.join(' ');
}
