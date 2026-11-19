import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  RaceCharacterMode,
  RaceDifficulty,
  RacePlayerProgress,
  RaceReadyStatus,
  RaceResult,
  RaceRoomSettings
} from '../../models/race';
import { RaceService } from '../../services/race.service';
import { TypingEngine } from '../../services/typing-engine';

interface RoomCreatedMessage {
  roomCode: string;
  text: string;
  settings: RaceRoomSettings;
}

interface PlayerJoinedMessage {
  text: string;
  players: RacePlayerProgress[];
  settings: RaceRoomSettings;
}

interface DifficultyOption {
  value: RaceDifficulty;
  label: string;
  description: string;
  specialCharacters: string;
  example: string;
  pips: number;
  accent: string;
  selectedBase: string;
}

interface TargetTextCharacter {
  index: number;
  value: string;
}

interface TargetTextWord {
  characters: TargetTextCharacter[];
}

const PLAYER_NAME_CHARACTER = /^(?:\p{L}| )$/u;

@Component({
  selector: 'app-race',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './race.html',
  styleUrl: './race.scss'
})
export class Race implements OnInit, OnDestroy {
  private raceService = inject(RaceService);
  private changeDetector = inject(ChangeDetectorRef);
  private typingEngine = inject(TypingEngine);
  private readonly prefersReducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  @ViewChild('difficultyRadioGroup') private difficultyRadioGroup?: ElementRef<HTMLDivElement>;
  private unsubscribeHandlers: Array<() => void> = [];
  private wrongKeyTimer?: ReturnType<typeof setTimeout>;
  private difficultyTypingInterval?: ReturnType<typeof setInterval>;
  private reconnecting = false;
  private targetTextValue = '';
  private targetWordsValue: TargetTextWord[] = [];

  playerName = '';
  roomCode = '';
  difficulty: RaceDifficulty = 'easy';
  wordCount = 30;
  characterMode: RaceCharacterMode = 'full';
  roomSettings: RaceRoomSettings | null = null;
  readonly difficultyOptions: DifficultyOption[] = [
    {
      value: 'easy',
      label: 'Kolay',
      description: '3–5 harf',
      specialCharacters: 'özel harf yok',
      example: 'kedi',
      pips: 1,
      accent: '#34D399',
      selectedBase: '#12795A'
    },
    {
      value: 'medium',
      label: 'Orta',
      description: '5–8 harf',
      specialCharacters: '0–2 özel harf',
      example: 'çocuk',
      pips: 2,
      accent: '#FFD60A',
      selectedBase: '#A88A00'
    },
    {
      value: 'hard',
      label: 'Zor',
      description: '7–11 harf',
      specialCharacters: 'en az 2 özel harf',
      example: 'öğretmenlik',
      pips: 3,
      accent: '#FB923C',
      selectedBase: '#B45309'
    },
    {
      value: 'expert',
      label: 'Uzman',
      description: '10–17 harf',
      specialCharacters: 'çok ekli, özel isim',
      example: 'sürdürülebilir',
      pips: 4,
      accent: '#C084FC',
      selectedBase: '#7E3FB5'
    }
  ];
  readonly difficultyPips = [0, 1, 2, 3];
  activeDifficultyPreview: RaceDifficulty | null = null;
  typedDifficultyExample = '';
  wrongKey: string | null = null;
  capsLockOn = false;
  opponentName = '';
  myProgress = 0;
  opponentProgress = 0;
  countdown = 0;
  isReady = false;
  opponentReady = false;
  rematchRequested = false;
  raceStarted = false;
  raceFinished = false;
  winner = '';
  isWinner = false;
  result: RaceResult | null = null;
  message = '';

  get targetText(): string {
    return this.targetTextValue;
  }

  set targetText(value: string) {
    this.targetTextValue = value;
    this.targetWordsValue = this.buildTargetWords(value);
    this.typingEngine.reset(value);
  }

  get targetWords(): TargetTextWord[] {
    return this.targetWordsValue;
  }

  get position(): number {
    return this.typingEngine.position;
  }

  get errors(): number {
    return this.typingEngine.errors;
  }

  get keystrokes(): number {
    return this.typingEngine.keystrokes;
  }

  get selectedDifficultyAnnouncement(): string {
    const option = this.difficultyOptions.find(item => item.value === this.difficulty);
    return option
      ? `Seçili: ${option.label} · ${option.description}, ${option.specialCharacters}`
      : '';
  }

  ngOnInit(): void {
    this.unsubscribeHandlers.push(
      this.raceService.on('RoomCreated', (data: RoomCreatedMessage) => {
        this.roomCode = data.roomCode;
        this.targetText = data.text;
        this.roomSettings = data.settings;
        this.message = 'Rakibin bekleniyor.';
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('PlayerJoined', (data: PlayerJoinedMessage) => {
        this.targetText = data.text;
        this.roomSettings = data.settings;
        this.updatePlayers(data.players);
        this.message = 'Rakip katıldı.';
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RaceCountdown', (value: number) => {
        this.countdown = value;
        this.isReady = false;
        this.opponentReady = false;
        this.raceFinished = false;
        this.raceStarted = false;
        this.result = null;
        this.winner = '';
        this.isWinner = false;
        this.typingEngine.reset(this.targetText);
        this.myProgress = 0;
        this.opponentProgress = 0;
        this.wrongKey = null;
        this.rematchRequested = false;
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('ReadyStatus', (status: RaceReadyStatus) => {
        const connectionId = this.raceService.connectionId;
        const me = status.players.find((player) => player.id === connectionId);
        const opponent = status.players.find((player) => player.id !== connectionId);
        this.isReady = me?.ready ?? false;
        this.opponentReady = opponent?.ready ?? false;
        this.opponentName = opponent?.name ?? this.opponentName;

        if (status.phase === 'countdown') {
          this.raceFinished = false;
          this.result = null;
          this.rematchRequested = false;
        }

        if (status.phase === 'finished')
          this.raceStarted = false;

        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RaceStarted', () => {
        this.raceStarted = true;
        this.countdown = 0;
        this.isReady = false;
        this.opponentReady = false;
        this.message = 'Yarış başladı! Klavyeden yazmaya başla.';
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('ProgressUpdated', (players: RacePlayerProgress[]) => {
        this.updatePlayers(players);
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RaceFinished', (result: RaceResult) => {
        this.result = result;
        this.raceFinished = true;
        this.raceStarted = false;
        this.isReady = false;
        this.opponentReady = false;
        this.rematchRequested = false;
        this.winner =
          result.players.find((player) => player.id === result.winnerId)?.name
          ?? 'Bilinmeyen oyuncu';
        this.isWinner = result.winnerId === this.raceService.connectionId;
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('PlayerDisconnected', (data: string) => {
        this.message = data;
        this.opponentReady = false;
        this.changeDetector.markForCheck();
      }),
      this.raceService.onreconnecting(() => {
        this.reconnecting = true;
        this.changeDetector.markForCheck();
      }),
      this.raceService.onreconnected(() => {
        this.reconnecting = false;
        this.changeDetector.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    this.clearWrongKeyTimer();
    this.clearDifficultyTypingInterval();
  }

  async createRoom(): Promise<void> {
    this.playerName = this.filterPlayerName(this.playerName).trim();
    if (!this.playerName.trim()) {
      this.message = 'Oyuncu adını gir.';
      return;
    }

    try {
      await this.raceService.createRoom(
        this.difficulty,
        this.wordCount,
        this.characterMode,
        this.playerName
      );
    } catch (err: any) {
      this.message = 'Oda oluşturulamadı: ' + (err?.message ?? err);
      this.changeDetector.markForCheck();
    }
  }

  async joinRoom(): Promise<void> {
    this.playerName = this.filterPlayerName(this.playerName).trim();
    if (!this.playerName.trim() || !this.roomCode.trim()) {
      this.message = 'Oyuncu adı ve oda kodu gerekli.';
      return;
    }

    try {
      await this.raceService.joinRoom(this.roomCode, this.playerName);
    } catch (err: any) {
      this.message = 'Odaya katılınamadı: ' + (err?.message ?? err);
      this.changeDetector.markForCheck();
    }
  }

  onPlayerNameChange(value: string): void {
    this.playerName = this.filterPlayerName(value);
  }

  async setReady(): Promise<void> {
    if (this.isReady || this.reconnecting) return;
    this.isReady = true;
    try {
      await this.raceService.setReady(this.roomCode);
    } catch (err: any) {
      this.isReady = false;
      this.message = 'Hazır durumu gönderilemedi: ' + (err?.message ?? err);
      this.changeDetector.markForCheck();
    }
  }

  async requestRematch(): Promise<void> {
    if (this.rematchRequested || this.reconnecting) return;
    this.rematchRequested = true;
    try {
      await this.raceService.rematch(this.roomCode);
    } catch (err: any) {
      this.rematchRequested = false;
      this.message = 'Rövanş isteği gönderilemedi: ' + (err?.message ?? err);
      this.changeDetector.markForCheck();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const capsLockOn = event.getModifierState('CapsLock');
    if (capsLockOn !== this.capsLockOn) {
      this.capsLockOn = capsLockOn;
      this.changeDetector.markForCheck();
    }

    if (!this.raceStarted || this.raceFinished)
      return;

    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.key.length !== 1 ||
      this.reconnecting
    ) {
      return;
    }

    event.preventDefault();
    const key = event.key;
    const input = this.typingEngine.press(key);
    if (!input.accepted)
      return;

    if (input.correct) {
      this.wrongKey = null;
      this.clearWrongKeyTimer();
    } else {
      this.wrongKey = key === ' ' ? '␣' : key;
      this.clearWrongKeyTimer();
      this.wrongKeyTimer = setTimeout(() => {
        this.wrongKey = null;
        this.wrongKeyTimer = undefined;
        this.changeDetector.markForCheck();
      }, 400);
    }

    this.myProgress = this.position * 100 / this.targetText.length;
    this.changeDetector.markForCheck();

    void this.raceService.keyPress(this.roomCode, key).catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.message = 'Tuş gönderilemedi: ' + errorMessage;
      this.changeDetector.markForCheck();
    });
  }

  resetRace(): void {
    this.clearWrongKeyTimer();
    this.roomCode = '';
    this.targetText = '';
    this.roomSettings = null;
    this.wrongKey = null;
    this.opponentName = '';
    this.myProgress = 0;
    this.opponentProgress = 0;
    this.countdown = 0;
    this.isReady = false;
    this.opponentReady = false;
    this.rematchRequested = false;
    this.raceStarted = false;
    this.raceFinished = false;
    this.winner = '';
    this.isWinner = false;
    this.result = null;
    this.message = '';
  }

  difficultyLabel(difficulty: RaceDifficulty): string {
    return this.difficultyOptions.find(
      (option) => option.value === difficulty
    )?.label ?? difficulty;
  }

  setDifficultyTilt(event: PointerEvent): void {
    if (this.prefersReducedMotion) return;
    const card = event.currentTarget as HTMLElement;
    const bounds = card.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    card.style.setProperty('--ry', `${horizontal * 20}deg`);
    card.style.setProperty('--rx', `${vertical * -16}deg`);
  }

  resetDifficultyTilt(event: PointerEvent): void {
    const card = event.currentTarget as HTMLElement;
    card.style.removeProperty('--rx');
    card.style.removeProperty('--ry');
  }

  startDifficultyPreview(option: DifficultyOption): void {
    if (this.prefersReducedMotion) return;
    this.clearDifficultyTypingInterval();
    this.activeDifficultyPreview = option.value;
    this.typedDifficultyExample = '';
    let characterIndex = 0;
    this.difficultyTypingInterval = setInterval(() => {
      characterIndex += 1;
      this.typedDifficultyExample = option.example.slice(0, characterIndex);
      this.changeDetector.markForCheck();

      if (characterIndex >= option.example.length) {
        this.clearDifficultyTypingInterval();
      }
    }, 55);
  }

  stopDifficultyPreview(option: DifficultyOption, event?: Event): void {
    if (this.activeDifficultyPreview !== option.value) return;
    if (
      event?.type === 'pointerleave' &&
      event.currentTarget instanceof HTMLElement &&
      event.currentTarget.matches(':focus')
    ) {
      return;
    }
    this.clearDifficultyTypingInterval();
    this.activeDifficultyPreview = null;
    this.typedDifficultyExample = '';
    this.changeDetector.markForCheck();
  }

  onDifficultyKeydown(event: KeyboardEvent, option: DifficultyOption): void {
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0;

    if (direction) {
      event.preventDefault();
      const currentIndex = this.difficultyOptions.findIndex(item => item.value === option.value);
      const nextIndex =
        (currentIndex + direction + this.difficultyOptions.length) % this.difficultyOptions.length;
      const nextOption = this.difficultyOptions[nextIndex];
      this.difficulty = nextOption.value;
      this.changeDetector.markForCheck();
      this.difficultyRadioGroup?.nativeElement
        .querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]
        ?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.difficulty = option.value;
      this.changeDetector.markForCheck();
    }
  }

  private clearWrongKeyTimer(): void {
    if (this.wrongKeyTimer) {
      clearTimeout(this.wrongKeyTimer);
      this.wrongKeyTimer = undefined;
    }
  }

  private clearDifficultyTypingInterval(): void {
    if (this.difficultyTypingInterval !== undefined) {
      clearInterval(this.difficultyTypingInterval);
      this.difficultyTypingInterval = undefined;
    }
  }

  private updatePlayers(players: RacePlayerProgress[]): void {
    const connectionId = this.raceService.connectionId;
    const me = players.find((player) => player.id === connectionId);
    const opponent = players.find((player) => player.id !== connectionId);

    if (me) {
      this.typingEngine.syncFromServer(
        me.position,
        me.errors,
        me.keystrokes
      );
      this.myProgress = me.progress;
    }

    if (opponent) {
      this.opponentName = opponent.name;
      this.opponentProgress = opponent.progress;
    }
  }

  private buildTargetWords(text: string): TargetTextWord[] {
    let characterIndex = 0;

    return text.split(' ').map((word, wordIndex, words) => {
      const characters = word.split('').map(value => ({
        index: characterIndex++,
        value
      }));

      if (wordIndex < words.length - 1) {
        characters.push({ index: characterIndex++, value: ' ' });
      }

      return { characters };
    });
  }

  private filterPlayerName(value: string): string {
    return Array.from(value)
      .filter(character => PLAYER_NAME_CHARACTER.test(character))
      .slice(0, 15)
      .join('');
  }
}
