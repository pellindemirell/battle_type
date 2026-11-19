import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { LessonService } from '../../services/lesson.service';
import { Lessons } from './lessons';

describe('Lessons', () => {
  let component: Lessons;
  let fixture: ComponentFixture<Lessons>;
  let lessonService: Pick<LessonService, 'getLessons'>;

  beforeEach(async () => {
    lessonService = {
      getLessons: vi.fn().mockReturnValue(of([]))
    };

    await TestBed.configureTestingModule({
      imports: [Lessons],
      providers: [
        provideRouter([]),
        { provide: LessonService, useValue: lessonService }
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Lessons);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('renders lessons when the asynchronous service response arrives', async () => {
    const lessons = [{
      id: 1,
      order: 1,
      title: 'Ana Sıra',
      category: 'Ana Sıra',
      newKeys: 'f j',
      text: 'fff jjj',
      targetWpm: 15,
      minAccuracy: 90,
      difficulty: 'Beginner',
      isActive: true
    }];
    const response = new Subject<typeof lessons>();
    vi.mocked(lessonService.getLessons).mockReturnValue(response.asObservable());

    createComponent();
    response.next(lessons);
    response.complete();
    await fixture.whenStable();

    expect(component.lessons).toEqual(lessons);
    expect(component.loading).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(lessons[0].title);
  });

  it('shows an error when loading lessons fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(lessonService.getLessons).mockReturnValue(
      throwError(() => new Error('Request failed'))
    );

    createComponent();

    expect(component.error).toBe('Request failed');
    expect(component.loading).toBe(false);
  });
});
