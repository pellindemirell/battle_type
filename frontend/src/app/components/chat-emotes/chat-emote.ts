import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatEmote } from './chat-emotes';

@Component({
  selector: 'app-chat-emote',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'size()' },
  template: `
    <picture>
      @if (animated() && emote().animated) {
        <source media="(prefers-reduced-motion: reduce)" [srcset]="emote().still" />
      }
      <img [src]="animated() ? (emote().animated ?? emote().still) : emote().still" [alt]="decorative() ? '' : emote().label"
        [width]="size()" [height]="size()" loading="lazy" decoding="async" />
    </picture>
  `,
  styles: `
    :host { display: inline-block; flex: none; max-inline-size: 100%; line-height: 0; }
    img { display: block; inline-size: 100%; block-size: auto; aspect-ratio: 1; object-fit: contain; }
  `
})
export class ChatEmoteImage {
  readonly emote = input.required<ChatEmote>();
  readonly animated = input(false);
  readonly decorative = input(false);
  readonly size = input(52);
}
