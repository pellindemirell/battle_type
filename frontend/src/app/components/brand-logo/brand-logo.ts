import { afterNextRender, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import spriteData from '../../../../public/assets/brand/sprites.json';

interface SpriteInfo {
  name: string;
  kind: 'key' | 'burst';
  file: string;
  x0: number;
  y0: number;
  w: number;
  h: number;
  origin?: string;
  nearestKey?: string;
}

interface SpriteManifest {
  canvas: {
    width: number;
    height: number;
  };
  sprites: SpriteInfo[];
}

const manifest = spriteData as SpriteManifest;

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  templateUrl: './brand-logo.html',
  styleUrl: './brand-logo.scss'
})
export class BrandLogo implements OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly prefersReducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private introFrame?: number;

  readonly canvas = manifest.canvas;
  readonly keySprites = manifest.sprites.filter(sprite => sprite.kind === 'key');
  readonly burstGroups = (['burst-a', 'burst-b'] as const).map(name => ({
    name,
    sprites: manifest.sprites.filter(sprite => sprite.name.startsWith(`${name}-`))
  }));
  introActive = false;

  constructor() {
    afterNextRender(() => {
      if (!this.prefersReducedMotion) {
        this.introActive = true;
        this.changeDetector.markForCheck();
      }
    });
  }

  assetPath(sprite: SpriteInfo): string {
    return `/assets/brand/${sprite.file}`;
  }

  replayIntro(): void {
    if (this.prefersReducedMotion) return;
    if (this.introFrame !== undefined) cancelAnimationFrame(this.introFrame);

    this.introActive = false;
    this.changeDetector.detectChanges();
    this.introFrame = requestAnimationFrame(() => {
      this.introActive = true;
      this.introFrame = undefined;
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.introFrame !== undefined) cancelAnimationFrame(this.introFrame);
  }
}
