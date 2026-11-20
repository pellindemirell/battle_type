import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IconComponent } from '../../components/icon/icon';
import { TypewriterComponent } from '../../components/typewriter/typewriter';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, IconComponent, TypewriterComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {}
