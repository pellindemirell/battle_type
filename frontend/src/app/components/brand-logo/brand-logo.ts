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
  private readonly bounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly bounceFrames = new Map<string, number>();

  readonly canvas = manifest.canvas;
  readonly keySprites = manifest.sprites.filter(sprite => sprite.kind === 'key');
  readonly burstGroups = (['burst-a', 'burst-b'] as const).map(name => ({
    name,
    sprites: manifest.sprites.filter(sprite => sprite.name.startsWith(`${name}-`))
  }));
  introActive = false;
  bouncingSprites = new Set<string>();

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

  onPointerEnter(spriteName: string): void {
    this.startBounce(spriteName);
  }

  onPointerDown(spriteName: string, event: PointerEvent): void {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      this.startBounce(spriteName);
    }
  }

  onBurstAnimationEnd(event: AnimationEvent, index: number): void {
    if (event.animationName === 'burst-open' && index === 2) {
      this.introActive = false;
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this.introFrame !== undefined) cancelAnimationFrame(this.introFrame);
    this.bounceTimers.forEach(timer => clearTimeout(timer));
    this.bounceFrames.forEach(frame => cancelAnimationFrame(frame));
  }

  private startBounce(spriteName: string): void {
    const timer = this.bounceTimers.get(spriteName);
    if (timer !== undefined) clearTimeout(timer);

    const frame = this.bounceFrames.get(spriteName);
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      this.bounceFrames.delete(spriteName);
    }

    if (this.bouncingSprites.has(spriteName)) {
      const sprites = new Set(this.bouncingSprites);
      sprites.delete(spriteName);
      this.bouncingSprites = sprites;
      this.changeDetector.detectChanges();

      const restartFrame = requestAnimationFrame(() => {
        this.bounceFrames.delete(spriteName);
        this.activateBounce(spriteName);
      });
      this.bounceFrames.set(spriteName, restartFrame);
      return;
    }

    this.activateBounce(spriteName);
  }

  private activateBounce(spriteName: string): void {
    const sprites = new Set(this.bouncingSprites);
    sprites.add(spriteName);
    this.bouncingSprites = sprites;
    this.changeDetector.markForCheck();

    const timer = setTimeout(() => {
      const activeSprites = new Set(this.bouncingSprites);
      activeSprites.delete(spriteName);
      this.bouncingSprites = activeSprites;
      this.bounceTimers.delete(spriteName);
      this.changeDetector.markForCheck();
    }, 550);
    this.bounceTimers.set(spriteName, timer);
  }
}
