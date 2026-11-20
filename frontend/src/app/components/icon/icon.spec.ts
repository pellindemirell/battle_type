import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon';

describe('IconComponent', () => {
  it('renders a decorative PNG at the requested size', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'copy');
    fixture.componentRef.setInput('size', 22);
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img');
    expect(image.getAttribute('src')).toBe('/assets/icons/copy.png');
    expect(image.getAttribute('alt')).toBe('');
    expect(fixture.nativeElement.style.width).toBe('22px');
  });

  it('uses the supplied accessible label or a manifest label for meaningful icons', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'homepage');
    fixture.componentRef.setInput('decorative', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').alt).toBe('Ana menü');

    fixture.componentRef.setInput('accessibleLabel', 'Ana sayfaya dön');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').alt).toBe('Ana sayfaya dön');
  });

  it('uses an accessible fallback without requesting unknown image paths', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', '__proto__');
    fixture.componentRef.setInput('decorative', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Simge');
  });
});
