import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Lessons } from './pages/lessons/lessons';
import { Practice } from './pages/practice/practice';
import { Race } from './pages/race/race';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'race', component: Race },
  { path: 'practice', component: Lessons },
  { path: 'practice/:id', component: Practice }
];
