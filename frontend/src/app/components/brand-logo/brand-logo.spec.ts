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
});
