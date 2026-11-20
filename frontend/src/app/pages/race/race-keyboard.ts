import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, input, signal } from '@angular/core';

const LOWER_ROWS = ['qwertyuıopğü', 'asdfghjklşi', 'zxcvbnmöç'] as const;
const UPPER_ROWS = ['QWERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZXCVBNMÖÇ'] as const;
const SHIFT_KEYS = ['shift-left', 'shift-right'] as const;

export interface RaceKey {
  id: string;
  shift: boolean;
}

const KEY_MAP = new Map<string, RaceKey>([[' ', { id: 'space', shift: false }]]);
LOWER_ROWS.forEach((row, rowIndex) => Array.from(row).forEach((id, index) => {
  KEY_MAP.set(id, { id, shift: false });
  KEY_MAP.set(UPPER_ROWS[rowIndex][index], { id, shift: true });
}));

export function raceKeyFor(character: string | null): RaceKey | undefined {
  return character === null ? undefined : KEY_MAP.get(character);
}

type KeyFeedback = 'correct' | 'wrong';

@Component({
  selector: 'app-race-keyboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="keyboard" aria-label="Türkçe Q klavye" [class.dimmed]="!running()">
      @for (row of rows; track row) {
        <div class="keyboard-row">
          @for (key of row; track key) {
            <span class="key" [class.special]="key.length > 1"
              [class.next]="isNext(key)"
              [class.correct]="feedback()[key] === 'correct'"
              [class.wrong]="feedback()[key] === 'wrong'">
              {{ key === 'space' ? 'Boşluk' : key.startsWith('shift-') ? 'Shift' : key }}
            </span>
          }
        </div>
      }
    </section>
  `,
  styleUrl: './race-keyboard.scss'
})
export class RaceKeyboard implements OnDestroy {
  readonly running = input(false);
  readonly next = input<string | null>(null);
  readonly rows = [
    Array.from(LOWER_ROWS[0]), Array.from(LOWER_ROWS[1]),
    [SHIFT_KEYS[0], ...LOWER_ROWS[2], SHIFT_KEYS[1]], ['space']
  ];
  readonly feedback = signal<Partial<Record<string, KeyFeedback>>>({});
  private readonly expected = computed(() => this.running() ? raceKeyFor(this.next()) : undefined);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    effect(() => { if (!this.running()) this.clear(); });
  }

  isNext(key: string): boolean {
    const expected = this.expected();
    return expected?.id === key || (!!expected?.shift && key.startsWith('shift-'));
  }

  flash(character: string, correct: boolean): void {
    const key = raceKeyFor(character);
    if (!key || !this.running()) return;
    const ids = key.shift ? [key.id, ...SHIFT_KEYS] : [key.id];
    const feedback: KeyFeedback = correct ? 'correct' : 'wrong';

    this.feedback.update(state => ({ ...state, ...Object.fromEntries(ids.map(id => [id, feedback])) }));
    for (const id of ids) {
      clearTimeout(this.timers.get(id));
      this.timers.set(id, setTimeout(() => {
        this.timers.delete(id);
        this.feedback.update(state => {
          const next = { ...state };
          delete next[id];
          return next;
        });
      }, correct ? 200 : 300));
    }
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.feedback.set({});
  }
}
