import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  let fixture: ComponentFixture<BrandLogo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandLogo]
    }).compileComponents();

    fixture = TestBed.createComponent(BrandLogo);
    fixture.detectChanges();
  });

  it('renders four independent tiles and two three-line bursts', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.tile-entry')).toHaveLength(4);
    expect(element.querySelectorAll('.logo-tile')).toHaveLength(4);
    const bursts = element.querySelectorAll('.collision-burst');
    expect(bursts).toHaveLength(2);
    bursts.forEach(burst => {
      expect(burst.querySelectorAll('.burst-line')).toHaveLength(3);
    });
  });

  it('bounces only the tile receiving a mouse pointer', () => {
    const element = fixture.nativeElement as HTMLElement;
    const tiles = Array.from(element.querySelectorAll('.logo-tile'));

    tiles[1].dispatchEvent(pointerEvent('pointerenter', 'mouse'));
    fixture.detectChanges();

    expect(tiles.map(tile => tile.classList.contains('bouncing')))
      .toEqual([false, true, false, false]);

    tiles[1].dispatchEvent(pointerEvent('pointerleave', 'mouse'));
    fixture.detectChanges();

    expect(tiles.some(tile => tile.classList.contains('bouncing'))).toBe(false);
  });

  it('triggers the tile bounce after touch input', () => {
    const element = fixture.nativeElement as HTMLElement;
    const tiles = Array.from(element.querySelectorAll('.logo-tile'));

    tiles[2].dispatchEvent(pointerEvent('pointerdown', 'touch'));
    fixture.detectChanges();
    expect(tiles[2].classList.contains('bouncing')).toBe(true);
  });
});

function pointerEvent(type: string, pointerType: string): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}
