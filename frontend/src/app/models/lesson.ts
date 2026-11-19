export interface Lesson {
  id: number;
  order: number;
  title: string;
  category: string;
  newKeys: string;
  text: string;
  targetWpm: number;
  minAccuracy: number;
  difficulty: string;
  isActive: boolean;
}
