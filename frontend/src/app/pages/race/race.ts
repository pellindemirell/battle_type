import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlayerAvatar } from '../../components/player-avatar/player-avatar';
import { PlayerProfilePicker } from '../../components/player-profile/player-profile';
import {
  avatarForId,
  DEFAULT_AVATAR,
  filterNickname,
  PlayerProfile,
  PLAYER_PROFILE_STORAGE_KEY
} from '../../models/player-profile';
import {
  RaceCharacterMode,
  RaceDifficulty,
  RacePlayerProgress,
  RaceReadyPlayer,
  RaceResult,
  RaceRoomSettings
} from '../../models/race';
import { RaceService } from '../../services/race.service';
import { TypingEngine } from '../../services/typing-engine';

interface RoomCreatedMessage {
  roomCode: string;
  avatarId: string;
  settings: RaceRoomSettings;
}

interface PlayerJoinedMessage {
  roomCode: string;
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

@Component({
  selector: 'app-race',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerAvatar, PlayerProfilePicker],
  templateUrl: './race.html',
  styleUrls: ['./race.scss', './race-avatars.scss', './race-ready.scss']
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
  private countdownTimer?: ReturnType<typeof setInterval>;
  private difficultyTypingInterval?: ReturnType<typeof setInterval>;
  private reconnecting = false;
  private targetTextValue = '';
  private targetWordsValue: TargetTextWord[] = [];

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  profile = this.loadProfile();
  roomAvatarId = DEFAULT_AVATAR.id;
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
  opponentAvatarId: string | null = null;
  myProgress = 0;
  opponentProgress = 0;
  countdown = 0;
  isReady = false;
  readyPending = false;
  opponentReady = false;
  rematchRequested = false;
  raceStarted = false;
  raceFinished = false;
  isWinner = false;
  result: RaceResult | null = null;
  message = '';

  get inRoom(): boolean {
    return this.roomSettings !== null;
  }

  get winningPlayer() {
    return this.result?.players.find((player) => player.id === this.result?.winnerId);
  }

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
        this.roomAvatarId = avatarForId(data.avatarId).id;
        this.roomSettings = data.settings;
        this.message = 'Rakibin bekleniyor.';
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('PlayerJoined', (data: PlayerJoinedMessage) => {
        this.roomCode = data.roomCode;
        this.roomSettings = data.settings;
        this.updatePlayers(data.players);
        this.message = 'Rakip katıldı.';
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('CountdownStarted', (seconds: number) => {
        this.clearCountdown();
        this.clearWrongKeyTimer();
        this.countdown = seconds;
        this.raceFinished = false;
        this.raceStarted = false;
        this.result = null;
        this.isWinner = false;
        this.targetText = '';
        this.myProgress = 0;
        this.opponentProgress = 0;
        this.wrongKey = null;
        this.rematchRequested = false;
        const endsAt = Date.now() + seconds * 1000;
        this.countdownTimer = setInterval(() => {
          const remaining = Math.max(1, Math.ceil((endsAt - Date.now()) / 1000));
          if (remaining !== this.countdown) {
            this.countdown = remaining;
            this.changeDetector.markForCheck();
          }
        }, 100);
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('CountdownCanceled', () => {
        this.clearCountdown();
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('ReadyChanged', (players: RaceReadyPlayer[]) => {
        const connectionId = this.raceService.connectionId;
        const me = players.find((player) => player.id === connectionId);
        const opponent = players.find((player) => player.id !== connectionId);
        this.isReady = me?.ready ?? false;
        this.opponentReady = opponent?.ready ?? false;
        this.opponentName = opponent?.name ?? '';
        this.opponentAvatarId = opponent?.avatarId ?? null;
        this.roomAvatarId = avatarForId(me?.avatarId ?? this.roomAvatarId).id;
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RaceStarted', ({ text }: { text: string }) => {
        this.clearCountdown();
        this.targetText = text;
        this.raceStarted = true;
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
        this.isWinner = result.winnerId === this.raceService.connectionId;
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('PlayerDisconnected', (data: string) => {
        this.message = data;
        this.opponentReady = false;
        if (!this.raceStarted && !this.raceFinished) {
          this.opponentName = '';
          this.opponentAvatarId = null;
          this.opponentProgress = 0;
        }
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
    this.clearCountdown();
    this.clearWrongKeyTimer();
    this.clearDifficultyTypingInterval();
  }

  async createRoom(): Promise<void> {
    const profile = this.profileForRoom();
    if (!profile) return;

    try {
      await this.raceService.createRoom(
        this.difficulty,
        this.wordCount,
        this.characterMode,
        profile
      );
    } catch (err: any) {
      this.message = 'Oda oluşturulamadı: ' + (err?.message ?? err);
      this.changeDetector.markForCheck();
    }
  }

  async joinRoom(): Promise<void> {
    const profile = this.profileForRoom();
    if (!profile) return;
    if (!this.roomCode.trim()) {
      this.message = 'Oda kodu gerekli.';
      return;
    }

    try {
      await this.raceService.joinRoom(this.roomCode, profile);
    } catch (err: any) {
      this.message = 'Odaya katılınamadı: ' + (err?.message ?? err);
      this.changeDetector.markForCheck();
    }
  }

  updateProfile(profile: PlayerProfile): void {
    this.profile = profile;
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({
        ...profile,
        nickname: profile.nickname.trim()
      }));
    } catch {
      // Continue with the in-memory profile if browser storage is unavailable.
    }
  }

  async setReady(): Promise<void> {
    if (this.readyPending || this.countdown || this.reconnecting) return;
    this.readyPending = true;
    try {
      await this.raceService.setReady(this.roomCode, !this.isReady);
    } catch (error) {
      this.message = 'Hazır durumu gönderilemedi: ' + (error instanceof Error ? error.message : error);
    } finally {
      this.readyPending = false;
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
    this.clearCountdown();
    this.clearWrongKeyTimer();
    this.roomCode = '';
    this.targetText = '';
    this.roomSettings = null;
    this.wrongKey = null;
    this.opponentName = '';
    this.opponentAvatarId = null;
    this.roomAvatarId = DEFAULT_AVATAR.id;
    this.myProgress = 0;
    this.opponentProgress = 0;
    this.countdown = 0;
    this.isReady = false;
    this.opponentReady = false;
    this.rematchRequested = false;
    this.raceStarted = false;
    this.raceFinished = false;
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

  private clearCountdown(): void {
    clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    this.countdown = 0;
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
      this.roomAvatarId = avatarForId(me.avatarId ?? this.roomAvatarId).id;
    }

    if (opponent) {
      this.opponentName = opponent.name;
      this.opponentAvatarId = opponent.avatarId;
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

  private loadProfile(): PlayerProfile {
    if (this.isBrowser) {
      try {
        const stored: Partial<PlayerProfile> | null = JSON.parse(
          localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY) ?? 'null'
        );
        return {
          nickname: typeof stored?.nickname === 'string'
            ? filterNickname(stored.nickname.trim()).trim()
            : '',
          avatarId: avatarForId(stored?.avatarId).id
        };
      } catch {
        // A malformed or inaccessible entry starts with the default profile.
      }
    }
    return { nickname: '', avatarId: DEFAULT_AVATAR.id };
  }

  private profileForRoom(): PlayerProfile | null {
    const nickname = filterNickname(this.profile.nickname.trim()).trim();
    if (Array.from(nickname).length < 3) {
      this.message = 'Oyuncu adı 3–16 karakter olmalı.';
      return null;
    }

    const profile = { nickname, avatarId: avatarForId(this.profile.avatarId).id };
    this.updateProfile(profile);
    return profile;
  }
}
