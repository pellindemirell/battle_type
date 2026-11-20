import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core';
import { GAME_ICONS, GameIconName } from './icon-manifest';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width.px]': 'dimension()',
    '[style.height.px]': 'dimension()'
  },
  template: `
    @if (icon(); as asset) {
      <img [src]="asset.path" [alt]="label()" [style.scale]="asset.scale" draggable="false" />
    } @else {
      <span class="fallback" [attr.role]="decorative() ? null : 'img'"
        [attr.aria-hidden]="decorative() ? 'true' : null" [attr.aria-label]="label() || null">?</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      overflow: hidden;
      vertical-align: middle;
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .fallback {
      color: currentColor;
      font-size: .875em;
      line-height: 1;
    }
  `
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input(24, { transform: numberAttribute });
  readonly decorative = input(true, { transform: booleanAttribute });
  readonly accessibleLabel = input('');

  protected readonly dimension = computed(() => {
    const size = this.size();
    return Number.isFinite(size) && size > 0 ? size : 24;
  });

  protected readonly icon = computed(() => {
    const name = this.name();
    return Object.hasOwn(GAME_ICONS, name) ? GAME_ICONS[name as GameIconName] : null;
  });

  protected readonly label = computed(() => this.decorative()
    ? ''
    : this.accessibleLabel().trim() || this.icon()?.label || 'Simge'
  );
}
