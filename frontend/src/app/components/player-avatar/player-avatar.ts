import { Component, computed, input, signal } from '@angular/core';
import { avatarForId, DEFAULT_AVATAR } from '../../models/player-profile';

@Component({
  selector: 'app-player-avatar',
  template: `
    @if (imagePath(); as src) {
      <img [src]="src" [alt]="decorative() ? '' : avatar().name" (error)="onError(src)" />
    } @else {
      <span
        class="fallback"
        [attr.role]="decorative() ? null : 'img'"
        [attr.aria-label]="decorative() ? null : 'Varsayılan oyuncu avatarı'"
        [attr.aria-hidden]="decorative() ? 'true' : null"
      ></span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      inline-size: var(--avatar-size, 44px);
      aspect-ratio: 1;
      border-radius: 50%;
      overflow: hidden;
      vertical-align: middle;
    }

    img, .fallback {
      display: block;
      inline-size: 100%;
      block-size: 100%;
    }

    img { object-fit: cover; }

    .fallback {
      background:
        radial-gradient(circle at 50% 35%, #e9d5ff 0 15%, transparent 16%),
        radial-gradient(ellipse at 50% 100%, #e9d5ff 0 35%, transparent 36%),
        #4b2974;
    }
  `
})
export class PlayerAvatar {
  readonly avatarId = input<string | null>();
  readonly decorative = input(false);
  readonly avatar = computed(() => avatarForId(this.avatarId()));

  private readonly failedPaths = signal<readonly string[]>([]);
  readonly imagePath = computed(() => {
    const primary = this.avatar().path;
    const failures = this.failedPaths();
    if (!failures.includes(primary)) return primary;
    return failures.includes(DEFAULT_AVATAR.path) ? null : DEFAULT_AVATAR.path;
  });

  onError(path: string): void {
    this.failedPaths.update((paths) => [...paths, path]);
  }
}
