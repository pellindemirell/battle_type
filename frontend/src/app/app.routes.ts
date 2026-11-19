import { Routes } from '@angular/router';
import { Lessons } from './pages/lessons/lessons';
import { Race } from './pages/race/race';

export const routes: Routes = [
  { path: '', component: Lessons },
  { path: 'race', component: Race }
];