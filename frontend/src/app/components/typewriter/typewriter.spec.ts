import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypewriterComponent } from './typewriter';

describe('TypewriterComponent', () => {
  let fixture: ComponentFixture<TypewriterComponent>;
  let media: EventTarget & { matches: boolean };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', vi.fn(() => media));
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function render(text: string, inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(TypewriterComponent);
    fixture.componentRef.setInput('text', text);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function visible(): string {
    return fixture.nativeElement.querySelector('.typewriter-text').textContent;
  }

  function cursor(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.typewriter-caret');
  }

  function tick(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  it('types from the start at 55 ms, reserves the full text, and replays on hover', async () => {
    await render('çğıİöşü', { cursorColor: '#ffd60a' });
    const element = fixture.nativeElement as HTMLElement;
    expect(visible()).toBe('çğıİöşü');
    expect(cursor()).toBeNull();

    element.dispatchEvent(new Event('pointerenter'));
    tick(54);
    expect(visible()).toBe('');
    expect(cursor()).not.toBeNull();
    expect(element.style.getPropertyValue('--typewriter-cursor')).toBe('#ffd60a');
    tick(1);
    expect(visible()).toBe('ç');
    const pending = element.querySelector('.typewriter-pending');
    expect(pending?.textContent).toBe('ğıİöşü');
    expect(element.querySelector('.typewriter-reserve')?.textContent).toBe('çğıİöşü');
    expect(element.querySelector('.typewriter-face')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('.typewriter-label')?.textContent).toBe('çğıİöşü');

    element.dispatchEvent(new Event('pointerleave'));
    fixture.detectChanges();
    expect(visible()).toBe('çğıİöşü');
    expect(cursor()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    element.dispatchEvent(new Event('pointerenter'));
    tick(55);
    expect(visible()).toBe('ç');
    tick(6 * 55);
    expect(visible()).toBe('çğıİöşü');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts automatically at the configured speed, handles combined characters, and supports no cursor', async () => {
    await render('s\u0327İ', { trigger: 'auto', speed: 20, cursor: false, accentSuffix: 'İ' });
    expect(visible()).toBe('');
    tick(20);
    expect(visible()).toBe('s\u0327');
    expect(cursor()).toBeNull();
    tick(20);
    expect(visible()).toBe('s\u0327İ');
    expect(fixture.nativeElement.querySelector('.typewriter-accent').textContent).toBe('İ');
    expect(fixture.componentInstance.active()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows full text immediately when reduced motion is enabled and stops on a preference change', async () => {
    media.matches = true;
    await render('Pratik', { trigger: 'auto' });
    expect(visible()).toBe('Pratik');
    expect(cursor()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    media.matches = false;
    media.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    fixture.detectChanges();
    tick(55);
    expect(visible()).toBe('P');
    media.matches = true;
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    fixture.detectChanges();
    expect(visible()).toBe('Pratik');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts an external hover and focus target and removes its listeners on destroy', async () => {
    const target = document.createElement('button');
    await render('Yarış', { hoverTarget: target });
    target.dispatchEvent(new FocusEvent('focusin'));
    tick(55);
    expect(visible()).toBe('Y');
    target.dispatchEvent(new FocusEvent('focusout'));
    fixture.detectChanges();
    expect(visible()).toBe('Yarış');

    target.dispatchEvent(new Event('pointerenter'));
    expect(vi.getTimerCount()).toBe(1);
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
    target.dispatchEvent(new Event('pointerenter'));
    expect(vi.getTimerCount()).toBe(0);
  });
});
