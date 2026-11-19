import { TestBed } from '@angular/core/testing';
import { LessonService } from './lesson.service';

describe('LessonService', () => {
  let service: LessonService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: []
    });

    service = TestBed.inject(LessonService);
  });

  it('returns the active lessons from the bundled data', () => {
    service.getLessons().subscribe((result) => {
      expect(result.length).toBe(4);
      expect(result.map((lesson) => lesson.id)).toEqual([1, 2, 3, 4]);
    });
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
