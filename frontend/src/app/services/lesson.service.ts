import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import lessonsData from '../data/lessons.json';
import { Lesson } from '../models/lesson';

@Injectable({
  providedIn: 'root'
})
export class LessonService {
  private readonly lessons: Lesson[] = lessonsData;

  getLessons(): Observable<Lesson[]> {
    return of(this.lessons.filter((lesson) => lesson.isActive));
  }

  getLesson(id: number): Observable<Lesson> {
    const lesson = this.lessons.find(
      (candidate) => candidate.id === id && candidate.isActive
    );

    return lesson
      ? of(lesson)
      : throwError(() => new Error(`Ders ${id} bulunamadı.`));
  }
}
