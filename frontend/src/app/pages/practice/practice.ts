import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Lesson } from '../../models/lesson';
import { LessonService } from '../../services/lesson.service';
import { TypingEngine } from '../../services/typing-engine';
import { nextPracticeText } from './practice-variation';

@Component({
  selector: 'app-practice',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './practice.html',
  styleUrl: './practice.scss'
})
export class Practice implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly lessonService = inject(LessonService);
  private readonly typingEngine = inject(TypingEngine);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private wrongKeyTimer?: ReturnType<typeof setTimeout>;
  private practiceText = '';

  readonly keyboardRows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç'],
    [' ']
  ];

  lesson: Lesson | null = null;
  loading = true;
  error = '';
  completed = false;
  stars = 0;
  bestAccuracy = 0;
  storageWarning = '';
  wrongKey: string | null = null;
  textCharacters: string[] = [];

  ngOnInit(): void {
    const lessonId = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(lessonId) || lessonId < 1) {
      this.error = 'Ders bulunamadı.';
      this.loading = false;
      return;
    }

    this.lessonService.getLesson(lessonId).subscribe({
      next: (lesson) => {
        this.lesson = lesson;
        this.setPracticeText(lesson.text);
        this.loading = false;
        this.loadBestAccuracy(lesson.id);
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.error = error instanceof Error
          ? error.message
          : 'Ders yüklenemedi.';
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearWrongKeyTimer();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.lesson || this.completed) return;
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.key.length !== 1
    ) {
      return;
    }

    event.preventDefault();
    const result = this.typingEngine.press(event.key);
    if (!result.accepted) return;

    if (result.correct) {
      this.clearWrongKeyTimer();
      this.wrongKey = null;
    } else {
      this.flashWrongKey(event.key);
    }

    if (result.completed)
      this.finishPractice();

    this.changeDetector.markForCheck();
  }

  get position(): number {
    return this.typingEngine.position;
  }

  get errors(): number {
    return this.typingEngine.errors;
  }

  get accuracy(): number {
    return this.typingEngine.accuracy;
  }

  get expectedKey(): string | null {
    return this.typingEngine.expectedKey;
  }

  isWrongVirtualKey(key: string): boolean {
    return this.wrongKey === (key === ' ' ? '␣' : key);
  }

  restart(): void {
    if (!this.lesson) return;

    this.clearWrongKeyTimer();
    this.setPracticeText(nextPracticeText(this.lesson.text, this.practiceText));
    this.completed = false;
    this.stars = 0;
    this.wrongKey = null;
  }

  private setPracticeText(text: string): void {
    this.practiceText = text;
    this.textCharacters = text.split('');
    this.typingEngine.reset(text);
  }

  private finishPractice(): void {
    this.completed = true;
    this.stars = this.accuracy >= 95 ? 3 : this.accuracy >= 80 ? 2 : 1;
    if (this.lesson)
      this.saveBestAccuracy(this.lesson.id, this.accuracy);
  }

  private flashWrongKey(key: string): void {
    this.wrongKey = key === ' ' ? '␣' : key;
    this.clearWrongKeyTimer();
    this.wrongKeyTimer = setTimeout(() => {
      this.wrongKey = null;
      this.wrongKeyTimer = undefined;
      this.changeDetector.markForCheck();
    }, 400);
  }

  private clearWrongKeyTimer(): void {
    if (this.wrongKeyTimer) {
      clearTimeout(this.wrongKeyTimer);
      this.wrongKeyTimer = undefined;
    }
  }

  private loadBestAccuracy(lessonId: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const saved = window.localStorage.getItem(this.storageKey(lessonId));
      if (saved === null) return;

      const value = Number(saved);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        this.storageWarning = 'Kaydedilmiş en iyi sonuç okunamadı.';
        return;
      }

      this.bestAccuracy = value;
    } catch {
      this.storageWarning = 'En iyi sonuç tarayıcıdan okunamadı.';
    }
  }

  private saveBestAccuracy(lessonId: number, accuracy: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const key = this.storageKey(lessonId);
      const saved = window.localStorage.getItem(key);
      const previous = saved === null ? 0 : Number(saved);
      if (!Number.isFinite(previous) || previous < 0 || previous > 100) {
        throw new Error('Stored practice result is invalid.');
      }

      this.bestAccuracy = Math.max(previous, accuracy);
      if (accuracy > previous)
        window.localStorage.setItem(key, String(accuracy));
    } catch {
      this.storageWarning = 'En iyi sonuç tarayıcıya kaydedilemedi.';
    }
  }

  private storageKey(lessonId: number): string {
    return `typing-app:practice-best:${lessonId}`;
  }
}
