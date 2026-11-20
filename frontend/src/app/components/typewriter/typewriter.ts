import {
  afterNextRender, booleanAttribute, ChangeDetectionStrategy, Component, computed, DestroyRef,
  effect, ElementRef, inject, input, numberAttribute, Renderer2, signal
} from '@angular/core';

const DEFAULT_SPEED = 55;
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('tr', { granularity: 'grapheme' })
  : null;

@Component({
  selector: 'app-typewriter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './typewriter.html',
  styleUrl: './typewriter.scss',
  host: { '[style.--typewriter-cursor]': 'cursorColor()' }
})
export class TypewriterComponent {
  readonly text = input.required<string>();
  readonly speed = input(DEFAULT_SPEED, { transform: numberAttribute });
  readonly trigger = input<'hover' | 'auto'>('hover');
  readonly hoverTarget = input<HTMLElement>();
  readonly cursor = input(true, { transform: booleanAttribute });
  readonly cursorColor = input('currentColor');
  readonly accentSuffix = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ready = signal(false);
  private readonly reducedMotion = signal(false);
  private readonly playing = signal(false);
  private readonly characterIndex = signal<number | null>(null);
  readonly active = this.playing.asReadonly();

  private readonly characters = computed(() => {
    const text = this.text();
    return segmenter
      ? Array.from(segmenter.segment(text), item => item.segment)
      : Array.from(text);
  });

  protected readonly parts = computed(() => {
    const text = this.text();
    const accent = this.accentSuffix();
    const accentStart = accent && text.endsWith(accent) ? text.length - accent.length : text.length;
    const index = this.characterIndex();
    const visible = index === null ? text : this.characters().slice(0, index).join('');
    return {
      plain: visible.slice(0, accentStart),
      accent: visible.slice(accentStart),
      pending: text.slice(visible.length)
    };
  });

  constructor() {
    afterNextRender(() => {
      const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (media) {
        this.reducedMotion.set(media.matches);
        const onMotionChange = (event: MediaQueryListEvent) => this.reducedMotion.set(event.matches);
        media.addEventListener?.('change', onMotionChange);
        this.destroyRef.onDestroy(() => media.removeEventListener?.('change', onMotionChange));
      }
      this.ready.set(true);
    });

    effect(onCleanup => {
      if (!this.ready() || this.reducedMotion()) return;
      const count = this.characters().length;
      if (!count) return;

      const trigger = this.trigger();
      const target = this.hoverTarget() ?? this.host.nativeElement;
      const configuredSpeed = this.speed();
      const speed = Number.isFinite(configuredSpeed) && configuredSpeed > 0 ? configuredSpeed : DEFAULT_SPEED;
      let timer: ReturnType<typeof setInterval> | undefined;
      let active = false;
      let hovering = false;
      let focused = false;

      const clearTimer = () => {
        if (timer === undefined) return;
        clearInterval(timer);
        timer = undefined;
      };

      const finish = () => {
        clearTimer();
        active = false;
        this.playing.set(false);
        this.characterIndex.set(null);
      };

      const start = () => {
        if (active) return;
        active = true;
        this.playing.set(true);
        let index = 0;
        this.characterIndex.set(index);
        timer = setInterval(() => {
          this.characterIndex.set(++index);
          if (index === count) {
            clearTimer();
            if (trigger === 'auto') finish();
          }
        }, speed);
      };

      if (trigger === 'auto') {
        start();
        onCleanup(finish);
        return;
      }

      const sync = () => {
        if (hovering || focused) start();
        else finish();
      };
      const listeners = [
        this.renderer.listen(target, 'pointerenter', () => { hovering = true; sync(); }),
        this.renderer.listen(target, 'pointerleave', () => { hovering = false; sync(); }),
        this.renderer.listen(target, 'focusin', () => { focused = true; sync(); }),
        this.renderer.listen(target, 'focusout', (event: FocusEvent) => {
          if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
          focused = false;
          sync();
        })
      ];
      onCleanup(() => {
        for (const remove of listeners) remove();
        finish();
      });
    });
  }
}
