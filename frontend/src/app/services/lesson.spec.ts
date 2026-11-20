import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LessonService } from './lesson.service';

describe('LessonService', () => {
  let service: LessonService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: []
    });

    service = TestBed.inject(LessonService);
  });

  it('returns the expanded active catalog and preserves the first four lesson IDs', async () => {
    const lessons = await firstValueFrom(service.getLessons());
    expect(lessons).toHaveLength(24);
    expect(lessons.slice(0, 4).map((lesson) => lesson.id)).toEqual([1, 2, 3, 4]);
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(lessons.length);
  });

  it('returns the requested lesson without an API request', () => {
    service.getLesson(2).subscribe((lesson) => {
      expect(lesson.title).toBe('Ana Sıra: D ve K');
      expect(lesson.text).toBe('ddd kkk dkd kdk fdk jkd');
    });
  });

  it('reports an error for an unknown lesson id', () => {
    let errorMessage = '';
    service.getLesson(999).subscribe({
      error: (error: Error) => errorMessage = error.message
    });
    expect(errorMessage).toBe('Ders 999 bulunamadı.');
  });
});
