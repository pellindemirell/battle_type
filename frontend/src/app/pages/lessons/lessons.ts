import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IconComponent } from '../../components/icon/icon';
import { LessonService } from '../../services/lesson.service';
import { Lesson } from '../../models/lesson';

const DIFFICULTY_RANK = new Map([['Beginner', 0], ['Intermediate', 1], ['Advanced', 2]]);

@Component({
  selector: 'app-lessons',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './lessons.html',
  styleUrl: './lessons.scss'
})
export class Lessons implements OnInit {
  private lessonService = inject(LessonService);
  private changeDetector = inject(ChangeDetectorRef);

  readonly difficultyLabels: Record<string, string> = {
    Beginner: 'Başlangıç',
    Intermediate: 'Orta',
    Advanced: 'İleri'
  };

  lessons: Lesson[] = [];
  loading = true;
  error = '';

  ngOnInit(): void {
    this.lessonService.getLessons().subscribe({
      next: (data) => {
        this.lessons = data.slice().sort((first, second) =>
          (DIFFICULTY_RANK.get(first.difficulty) ?? 3) - (DIFFICULTY_RANK.get(second.difficulty) ?? 3)
          || first.order - second.order
          || first.id - second.id
        );
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: (err) => {
        this.error = err instanceof Error
          ? err.message
          : 'Dersler yüklenemedi.';
        this.loading = false;
        console.error('Dersler yüklenemedi:', err);
        this.changeDetector.markForCheck();
      }
    });
  }
}
