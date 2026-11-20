export type RaceDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export type RaceCharacterMode = 'full' | 'simplified';

export interface RaceRoomSettings {
  difficulty: RaceDifficulty;
  wordCount: number;
  characterMode: RaceCharacterMode;
}

export interface RacePlayerProgress {
  id: string;
  name: string;
  avatarId: string;
  position: number;
  errors: number;
  keystrokes: number;
  progress: number;
  wpm: number;
  accuracy: number;
  finished: boolean;
}

export interface RacePlayerResult {
  id: string;
  name: string;
  avatarId: string;
  position: number;
  errors: number;
  keystrokes: number;
  wpm: number;
  accuracy: number;
  finished: boolean;
  durationMs: number | null;
}

export interface RaceResult {
  winnerId: string;
  players: RacePlayerResult[];
  series?: RaceSeries | null;
}

export interface RaceSeries {
  total: number;
  current: number;
  wins: Record<string, number>;
  winnerId: string | null;
}

export interface RematchOffer {
  fromId: string;
  fromName: string;
  rounds: number;
}

export interface RaceChatMessage {
  fromName: string;
  text: string;
  ts: string;
}

export interface RaceReadyPlayer {
  id: string;
  name: string;
  avatarId: string;
  ready: boolean;
}
