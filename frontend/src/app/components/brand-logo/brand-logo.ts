import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  inject
} from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  templateUrl: './brand-logo.html',
  styleUrl: './brand-logo.scss'
})
export class BrandLogo implements OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private touchBounceTimer?: ReturnType<typeof setTimeout>;

  introActive = true;
  activeTile: 't' | 'y' | 'p' | 'e' | null = null;

  ngOnDestroy(): void {
    if (this.touchBounceTimer)
      clearTimeout(this.touchBounceTimer);
  }

  replayIntro(): void {
    this.introActive = false;
    this.changeDetector.detectChanges();

    requestAnimationFrame(() => {
      this.introActive = true;
      this.changeDetector.markForCheck();
    });
  }

  activateTile(
    tile: 't' | 'y' | 'p' | 'e',
    event: PointerEvent
  ): void {
    this.activeTile = tile;

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      if (this.touchBounceTimer)
        clearTimeout(this.touchBounceTimer);

      this.touchBounceTimer = setTimeout(() => {
        this.activeTile = null;
        this.touchBounceTimer = undefined;
      }, 550);
    }
  }

  deactivateTile(
    tile: 't' | 'y' | 'p' | 'e',
    event: PointerEvent
  ): void {
    if (event.pointerType !== 'touch' && this.activeTile === tile)
      this.activeTile = null;
  }
}
