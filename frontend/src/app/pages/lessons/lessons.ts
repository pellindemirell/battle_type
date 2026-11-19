import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LessonService } from '../../services/lesson.service';
import { Lesson } from '../../models/lesson';

@Component({
  selector: 'app-lessons',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './lessons.html',
  styleUrl: './lessons.scss'
})
export class Lessons implements OnInit {
  private lessonService = inject(LessonService);
  private changeDetector = inject(ChangeDetectorRef);

  lessons: Lesson[] = [];
  loading = true;
  error = '';

  ngOnInit(): void {
    this.lessonService.getLessons().subscribe({
      next: (data) => {
        this.lessons = data;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: (err) => {
        this.error = 'Dersler yüklenemedi. Backend çalışıyor mu?';
        this.loading = false;
        console.error('Dersler yüklenemedi:', err);
        this.changeDetector.markForCheck();
      }
    });
  }
}
