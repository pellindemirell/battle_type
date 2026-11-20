import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef,
  HostListener, inject, Injector, input, output, signal, viewChild
} from '@angular/core';
import { ChatEmoteImage } from './chat-emote';
import { ChatEmote, chatEmotesForAvatar } from './chat-emotes';

@Component({
  selector: 'app-chat-emote-picker',
  imports: [ChatEmoteImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger type="button" class="btn-secondary emote-trigger" aria-label="Emoji seç"
      title="Emoji seç" aria-haspopup="dialog" aria-controls="chat-emote-panel"
      [attr.aria-expanded]="open()" [disabled]="disabled()" (click)="toggle()">
      <img src="/assets/emotes/emoji-picker.png" alt="" width="32" height="32" />
    </button>
    @if (open() && !disabled()) {
      <section class="emote-panel" id="chat-emote-panel" role="dialog" aria-label="Emoji seçici">
        <div class="emote-grid">
          @for (emote of emotes(); track emote.id) {
            <button type="button" class="emote-option" [attr.aria-label]="emote.label"
              [title]="emote.label" (click)="choose(emote)">
              <app-chat-emote [emote]="emote" [size]="44" [decorative]="true" [animated]="true" />
            </button>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './chat-emote-picker.scss'
})
export class ChatEmotePicker {
  readonly disabled = input(false);
  readonly avatarId = input.required<string>();
  readonly emoteSelected = output<ChatEmote>();
  protected readonly emotes = computed(() => chatEmotesForAvatar(this.avatarId()));
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  constructor() {
    effect(() => {
      if (this.disabled()) this.open.set(false);
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }

    this.open.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLButtonElement>('.emote-option')?.focus(),
      { injector: this.injector });
  }

  protected choose(emote: ChatEmote): void {
    this.open.set(false);
    this.emoteSelected.emit(emote);
  }

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && event.target instanceof Node && !this.host.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  protected closeOnEscape(event: Event): void {
    if (!this.open()) return;
    event.preventDefault();
    event.stopPropagation();
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }
}
