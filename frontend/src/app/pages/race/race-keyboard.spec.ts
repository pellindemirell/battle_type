import { raceKeyFor } from './race-keyboard';

describe('Turkish Q keyboard mapping', () => {
  it.each([
    ['i', 'i', false], ['İ', 'i', true],
    ['ı', 'ı', false], ['I', 'ı', true],
    ['Ğ', 'ğ', true], ['Ü', 'ü', true],
    [' ', 'space', false]
  ])('maps %s to %s with shift %s', (character, id, shift) => {
    expect(raceKeyFor(character)).toEqual({ id, shift });
  });

  it('does not map unsupported keys', () => {
    expect(raceKeyFor('Enter')).toBeUndefined();
  });
});
