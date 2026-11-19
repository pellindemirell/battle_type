import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environment';
import { Lesson } from '../models/lesson';
import { LessonService } from './lesson.service';

describe('LessonService', () => {
  let service: LessonService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(LessonService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('requests the lesson list', () => {
    const lessons: Lesson[] = [];

    service.getLessons().subscribe((result) => {
      expect(result).toEqual(lessons);
    });

    const request = httpTestingController.expectOne(`${environment.apiUrl}/api/lessons`);
    expect(request.request.method).toBe('GET');
    request.flush(lessons);
  });

  it('requests a lesson by id', () => {
    const lesson: Lesson = {
      id: 2,
      order: 2,
      title: 'Ana Sıra: D ve K',
      category: 'Ana Sıra',
      newKeys: 'd k',
      text: 'ddd kkk',
      targetWpm: 20,
      minAccuracy: 90,
      difficulty: 'Beginner',
      isActive: true
    };

    service.getLesson(lesson.id).subscribe((result) => {
      expect(result).toEqual(lesson);
    });

    const request = httpTestingController.expectOne(
      `${environment.apiUrl}/api/lessons/${lesson.id}`
    );
    expect(request.request.method).toBe('GET');
    request.flush(lesson);
  });
});
