import { ChangeDetectorRef, Component, inject } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  templateUrl: './brand-logo.html',
  styleUrl: './brand-logo.scss'
})
export class BrandLogo {
  private readonly changeDetector = inject(ChangeDetectorRef);

  introActive = true;

  replayIntro(): void {
    this.introActive = false;
    this.changeDetector.detectChanges();

    requestAnimationFrame(() => {
      this.introActive = true;
      this.changeDetector.markForCheck();
    });
  }
}
