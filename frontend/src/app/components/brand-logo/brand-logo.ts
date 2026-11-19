import { Component } from '@angular/core';
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
export class BrandLogo {
  readonly canvas = manifest.canvas;
  readonly keySprites = manifest.sprites.filter(sprite => sprite.kind === 'key');
  readonly burstGroups = (['burst-a', 'burst-b'] as const).map(name => ({
    name,
    sprites: manifest.sprites.filter(sprite => sprite.name.startsWith(`${name}-`))
  }));

  assetPath(sprite: SpriteInfo): string {
    return `/assets/brand/${sprite.file}`;
  }
}
