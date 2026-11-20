import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { Lesson } from '../../models/lesson';
import { LessonService } from '../../services/lesson.service';
import { Practice } from './practice';

describe('Practice', () => {
  let fixture: ComponentFixture<Practice>;
  let component: Practice;
  const lesson: Lesson = {
    id: 1,
    order: 1,
    title: 'Ana Sıra: F ve J',
    category: 'Ana Sıra',
    newKeys: 'f j',
    text: 'fff jjj fjf jfj ffj jjf',
    targetWpm: 15,
    minAccuracy: 90,
    difficulty: 'Beginner',
    isActive: true
  };

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Practice],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '1' } } }
        },
        {
          provide: LessonService,
          useValue: { getLesson: vi.fn().mockReturnValue(of(lesson)) }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Practice);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('loads the lesson and highlights the next virtual key', () => {
    expect(component.lesson).toEqual(lesson);
    expect(component.expectedKey).toBe('f');
    fixture.detectChanges();

    const highlightedKey = fixture.nativeElement.querySelector(
      '.virtual-key.next-key'
    );
    expect(highlightedKey.textContent.trim()).toBe('f');
  });

  it('tracks wrong keys without advancing and briefly shows the key', () => {
    component.onKeyDown(new KeyboardEvent('keydown', {
      key: 'x',
      cancelable: true
    }));

    expect(component.position).toBe(0);
    expect(component.errors).toBe(1);
    expect(component.wrongKey).toBe('x');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wrong-key-badge')?.textContent)
      .toContain('x');
    expect(fixture.nativeElement.querySelector('.virtual-key.wrong-virtual-key')
      ?.textContent.trim()).toBe('x');
  });

  it('finishes with three stars and persists the best accuracy', () => {
    for (const key of lesson.text)
      component.onKeyDown(new KeyboardEvent('keydown', { key, cancelable: true }));

    expect(component.completed).toBe(true);
    expect(component.accuracy).toBe(100);
    expect(component.stars).toBe(3);
    expect(window.localStorage.getItem('typing-app:practice-best:1')).toBe('100');
  });

  it('awards two stars when accuracy is between 80 and 94 percent', () => {
    for (let i = 0; i < 4; i++)
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'x' }));
    for (const key of lesson.text)
      component.onKeyDown(new KeyboardEvent('keydown', { key }));

    expect(component.accuracy).toBeGreaterThanOrEqual(80);
    expect(component.accuracy).toBeLessThan(95);
    expect(component.stars).toBe(2);
  });

  it('awards one star below 80 percent accuracy', () => {
    for (let i = 0; i < 6; i++)
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'x' }));
    for (const key of lesson.text)
      component.onKeyDown(new KeyboardEvent('keydown', { key }));

    expect(component.accuracy).toBeLessThan(80);
    expect(component.stars).toBe(1);
  });

  it('generates longer mixed attempts with the same lesson keys and keeps the best result', () => {
    let previous = lesson.text;
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const key of previous) component.onKeyDown(new KeyboardEvent('keydown', { key }));
      expect(component.completed).toBe(true);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.practice-button').click();
      fixture.detectChanges();
      const next = component.textCharacters.join('');
      expect(next).toMatch(/^[fj]+(?: [fj]+)*$/);
      expect(next.replaceAll(' ', '').length).toBeGreaterThan(previous.replaceAll(' ', '').length);
      expect(next.split(' ').some(group => group.includes('f') && group.includes('j'))).toBe(true);
      expect(component.lesson?.id).toBe(lesson.id);
      expect(component.position).toBe(0);
      expect(component.errors).toBe(0);
      expect(component.completed).toBe(false);
      expect(component.expectedKey).toBe(next[0]);
      expect(component.bestAccuracy).toBe(100);
      previous = next;
    }
  });

  it('shows a warning if local storage cannot save the result', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    for (const key of lesson.text)
      component.onKeyDown(new KeyboardEvent('keydown', { key, cancelable: true }));

    expect(component.completed).toBe(true);
    expect(component.storageWarning).toContain('kaydedilemedi');
  });
});
