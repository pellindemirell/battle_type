import { afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  let fixture: ComponentFixture<BrandLogo>;

  afterEach(() => {
    vi.unstubAllGlobals();
    fixture?.destroy();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandLogo]
    }).compileComponents();

    fixture = TestBed.createComponent(BrandLogo);
    fixture.detectChanges();
  });

  it('renders the ten source sprites in two decorative three-sprite groups', () => {
    const element = fixture.nativeElement as HTMLElement;
    const logo = element.querySelector('.logo-canvas');
    const bursts = element.querySelectorAll('.burst-group');

    expect(logo?.getAttribute('role')).toBe('img');
    expect(logo?.getAttribute('aria-label')).toBe('Type Battle');
    expect(element.querySelectorAll('.key-sprite')).toHaveLength(10);
    expect(bursts).toHaveLength(2);
    bursts.forEach(burst => {
      expect(burst.getAttribute('aria-hidden')).toBe('true');
      expect(burst.querySelectorAll('.burst-sprite')).toHaveLength(3);
    });
  });

  it('bounces only the key receiving a mouse pointer', () => {
    const element = fixture.nativeElement as HTMLElement;
    const keys = Array.from(element.querySelectorAll('.key-sprite'));

    keys[1].dispatchEvent(pointerEvent('pointerenter', 'mouse'));
    fixture.detectChanges();

    expect(keys.map(key => key.classList.contains('bouncing')))
      .toEqual([false, true, false, false, false, false, false, false, false, false]);
    expect(element.querySelectorAll('.burst-sprite.bouncing')).toHaveLength(0);
  });

  it('restarts the bounce for touch input on the selected key', () => {
    const element = fixture.nativeElement as HTMLElement;
    const keys = Array.from(element.querySelectorAll('.key-sprite'));

    keys[2].dispatchEvent(pointerEvent('pointerdown', 'touch'));
    fixture.detectChanges();
    expect(keys[2].classList.contains('bouncing')).toBe(true);
    expect(keys.filter((key, index) => index !== 2 && key.classList.contains('bouncing')))
      .toHaveLength(0);
  });

  it('finishes the intro only after the third burst sprite in a group', () => {
    const component = fixture.componentInstance;
    const event = new Event('animationend') as AnimationEvent;
    Object.defineProperty(event, 'animationName', { value: 'scoped_burst-open' });
    component.introActive = true;

    component.onBurstAnimationEnd(event, 1);
    expect(component.introActive).toBe(true);

    component.onBurstAnimationEnd(event, 2);
    expect(component.introActive).toBe(false);
  });

  it('does not apply the intro class when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const reducedFixture = TestBed.createComponent(BrandLogo);
    reducedFixture.detectChanges();
    await reducedFixture.whenStable();

    expect(reducedFixture.componentInstance.introActive).toBe(false);
    expect(reducedFixture.nativeElement.querySelector('.intro-active')).toBeNull();

    reducedFixture.nativeElement.querySelector('.logo-replay').click();
    expect(reducedFixture.componentInstance.introActive).toBe(false);
    reducedFixture.destroy();
  });
});

function pointerEvent(type: string, pointerType: string): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}
