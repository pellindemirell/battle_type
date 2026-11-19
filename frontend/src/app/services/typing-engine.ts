import { Injectable } from '@angular/core';

export interface TypingKeyResult {
  accepted: boolean;
  correct: boolean;
  completed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TypingEngine {
  private text = '';

  position = 0;
  errors = 0;
  keystrokes = 0;

  reset(text: string): void {
    this.text = text;
    this.position = 0;
    this.errors = 0;
    this.keystrokes = 0;
  }

  press(key: string): TypingKeyResult {
    if (this.completed || !this.text || key.length !== 1) {
      return { accepted: false, correct: false, completed: this.completed };
    }

    this.keystrokes++;
    const correct = key === this.text[this.position];

    if (correct)
      this.position++;
    else
      this.errors++;

    return { accepted: true, correct, completed: this.completed };
  }

  syncFromServer(position: number, errors: number, keystrokes: number): void {
    this.position = Math.max(0, Math.min(position, this.text.length));
    this.errors = Math.max(0, errors);
    this.keystrokes = Math.max(0, keystrokes);
  }

  get expectedKey(): string | null {
    return this.completed ? null : this.text[this.position] ?? null;
  }

  get completed(): boolean {
    return this.text.length > 0 && this.position >= this.text.length;
  }

  get accuracy(): number {
    return this.keystrokes === 0
      ? 0
      : Math.round(100 * (this.keystrokes - this.errors) / this.keystrokes);
  }
}
