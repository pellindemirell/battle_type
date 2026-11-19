import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandLogo } from './components/brand-logo/brand-logo';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BrandLogo],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {}
