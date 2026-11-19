import { TypingEngine } from './typing-engine';

describe('TypingEngine', () => {
  let engine: TypingEngine;

  beforeEach(() => {
    engine = new TypingEngine();
    engine.reset('cat');
  });

  it('advances for correct keys', () => {
    expect(engine.press('c')).toEqual({
      accepted: true,
      correct: true,
      completed: false
    });
    expect(engine.position).toBe(1);
    expect(engine.errors).toBe(0);
    expect(engine.keystrokes).toBe(1);
  });

  it('counts an incorrect key without advancing', () => {
    expect(engine.press('x')).toEqual({
      accepted: true,
      correct: false,
      completed: false
    });
    expect(engine.position).toBe(0);
    expect(engine.errors).toBe(1);
    expect(engine.accuracy).toBe(0);
  });

  it('rejects further input after completing the text', () => {
    engine.press('c');
    engine.press('a');
    expect(engine.press('t')).toEqual({
      accepted: true,
      correct: true,
      completed: true
    });

    expect(engine.press('x')).toEqual({
      accepted: false,
      correct: false,
      completed: true
    });
    expect(engine.position).toBe(3);
    expect(engine.keystrokes).toBe(3);
  });

  it('can synchronize progress from the race server', () => {
    engine.syncFromServer(2, 1, 4);

    expect(engine.position).toBe(2);
    expect(engine.errors).toBe(1);
    expect(engine.keystrokes).toBe(4);
    expect(engine.expectedKey).toBe('t');
  });
});
