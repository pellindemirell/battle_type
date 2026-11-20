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
  RaceChatMessage,
  RaceDifficulty,
  RacePlayerProgress,
  RaceReadyPlayer,
  RaceResult,
  RaceRoomSettings,
  RaceSeries,
  RematchOffer
} from '../../models/race';
import { RaceService } from '../../services/race.service';
import { TypingEngine } from '../../services/typing-engine';
import { formatRaceDuration } from './race-duration';
import { RaceKeyboard } from './race-keyboard';
import { ENCOURAGEMENT_MESSAGES, shouldEncourage } from './race-encouragement';

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
  imports: [CommonModule, FormsModule, PlayerAvatar, PlayerProfilePicker, RaceKeyboard],
  templateUrl: './race.html',
  styleUrls: ['./race.scss', './race-avatars.scss', './race-ready.scss', './race-rematch.scss']
})
export class Race implements OnInit, OnDestroy {
  private raceService = inject(RaceService);
  private changeDetector = inject(ChangeDetectorRef);
  private typingEngine = inject(TypingEngine);
  private readonly prefersReducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  @ViewChild('difficultyRadioGroup') private difficultyRadioGroup?: ElementRef<HTMLDivElement>;
  @ViewChild(RaceKeyboard) private keyboard?: RaceKeyboard;
  @ViewChild('matchDialog') private matchDialog?: ElementRef<HTMLDialogElement>;
  private unsubscribeHandlers: Array<() => void> = [];
  private wrongKeyTimer?: ReturnType<typeof setTimeout>;
  private countdownTimer?: ReturnType<typeof setInterval>;
  private raceClock?: ReturnType<typeof setInterval>;
  private localStart: number | null = null;
  readonly formatDuration = formatRaceDuration;
  elapsedMs = 0;
  chatText = '';
  chatError = '';
  chatSending = false;
  unreadChat = 0;
  chatMessages: Array<RaceChatMessage & { own: boolean }> = [];
  chatToast: RaceChatMessage | null = null;
  private chatOpen = false;
  private chatToastTimer?: ReturnType<typeof setTimeout>;
  encouragement = '';
  private encouragementTimer?: ReturnType<typeof setTimeout>;
  private readonly wpmSamples = new Map<number, number>();
  private lastSampleSecond = -1;
  private lastPopupMs = -Infinity;
  private correctStreak = 0;
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
  rematchRounds = 3;
  rematchOffer: RematchOffer | null = null;
  rematchNotice = '';
  dialogBusy = false;
  dialogMode: 'request' | 'offer' | 'round' | null = null;
  series: RaceSeries | null = null;
  roundResult: RaceResult | null = null;
  private rematchNoticeTimer?: ReturnType<typeof setTimeout>;
  raceStarted = false;
  raceFinished = false;
  isWinner = false;
  result: RaceResult | null = null;
  message = '';

  get inRoom(): boolean {
    return this.roomSettings !== null;
  }

  get mySeriesWins(): number {
    return this.series?.wins[this.raceService.connectionId ?? ''] ?? 0;
  }

  get opponentSeriesWins(): number {
    return Object.entries(this.series?.wins ?? {})
      .find(([id]) => id !== this.raceService.connectionId)?.[1] ?? 0;
  }

  playerName(result: RaceResult, id: string): string {
    return result.players.find(player => player.id === id)?.name ?? 'Bilinmeyen oyuncu';
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

  get expectedKey(): string | null {
    return this.typingEngine.expectedKey;
  }

  get liveWpm(): number {
    return this.elapsedMs > 0 ? Math.round(this.position * 12000 / this.elapsedMs) : 0;
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
        this.clearRaceClock();
        this.elapsedMs = 0;
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
        this.startRaceClock();
        this.raceStarted = true;
        this.isReady = false;
        this.opponentReady = false;
        this.message = 'Yarış başladı! Klavyeden yazmaya başla.';
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('MessageReceived', (message: RaceChatMessage) => this.receiveChat(message)),
      this.raceService.on('ProgressUpdated', (players: RacePlayerProgress[]) => {
        this.updatePlayers(players);
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RaceFinished', (result: RaceResult) => {
        this.updateRaceClock();
        this.clearRaceClock();
        this.result = result;
        this.raceFinished = true;
        this.raceStarted = false;
        this.isReady = false;
        this.opponentReady = false;
        this.rematchRequested = false;
        this.isWinner = result.winnerId === this.raceService.connectionId;
        this.series = result.series ?? null;
        if (this.series && !this.series.winnerId && this.series.current < this.series.total) {
          this.roundResult = result;
          this.openMatchDialog('round');
        }
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RematchRequested', (offer: RematchOffer) => {
        if (!this.inRoom || !this.raceFinished) return;
        this.rematchOffer = offer;
        this.rematchRequested = offer.fromId === this.raceService.connectionId;
        if (!this.rematchRequested) this.openMatchDialog('offer');
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RematchAccepted', ({ series }: { series: RaceSeries }) => {
        if (!this.inRoom) return;
        this.closeMatchDialog();
        this.prepareRound(series);
      }),
      this.raceService.on('RematchDeclined', ({ reason }: { reason: string }) => {
        if (this.rematchRequested) {
          this.showRematchNotice(reason === 'expired' ? 'Rövanş isteğinin süresi doldu.'
            : reason === 'canceled' ? 'Rövanş isteği iptal edildi.'
            : reason === 'disconnected' ? 'Rakibin bağlantısı kesildi.' : 'Rakip rövanş isteğini reddetti.');
        }
        this.rematchRequested = false;
        this.rematchOffer = null;
        if (this.dialogMode === 'offer') this.closeMatchDialog();
        this.changeDetector.markForCheck();
      }),
      this.raceService.on('RoundPrepared', ({ series }: { series: RaceSeries }) => {
        if (this.inRoom) this.prepareRound(series);
      }),
      this.raceService.on('SeriesCanceled', () => {
        this.series = null;
        this.roundResult = null;
        if (this.dialogMode === 'round') this.closeMatchDialog();
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
    clearTimeout(this.rematchNoticeTimer);
    clearTimeout(this.chatToastTimer);
    this.clearRaceClock();
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
    if (this.readyPending || this.countdown || this.roundResult || this.reconnecting) return;
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

  openRematchDialog(): void {
    if (!this.raceFinished || this.reconnecting || this.rematchRequested) return;
    this.rematchRounds = 3;
    this.openMatchDialog('request');
  }

  async requestRematch(): Promise<void> {
    if (this.dialogBusy || this.reconnecting || !this.raceFinished) return;
    this.dialogBusy = true;
    try {
      await this.raceService.requestRematch(this.roomCode, this.rematchRounds);
      if (this.dialogMode === 'request') this.closeMatchDialog();
    } catch (error) {
      this.showRematchNotice(error instanceof Error ? error.message : 'Rövanş isteği gönderilemedi.');
    } finally {
      this.dialogBusy = false;
      this.changeDetector.markForCheck();
    }
  }

  async respondRematch(accept: boolean): Promise<void> {
    if (!this.rematchOffer || this.dialogBusy || this.reconnecting) return;
    this.dialogBusy = true;
    try {
      await this.raceService.respondRematch(this.roomCode, accept);
    } catch (error) {
      this.showRematchNotice(error instanceof Error ? error.message : 'Yanıt gönderilemedi.');
    } finally {
      this.dialogBusy = false;
      this.changeDetector.markForCheck();
    }
  }

  async cancelRematch(): Promise<void> {
    if (!this.rematchRequested || this.dialogBusy || this.reconnecting) return;
    this.dialogBusy = true;
    try {
      await this.raceService.cancelRematch(this.roomCode);
    } catch (error) {
      this.showRematchNotice(error instanceof Error ? error.message : 'İstek iptal edilemedi.');
    } finally {
      this.dialogBusy = false;
      this.changeDetector.markForCheck();
    }
  }

  onMatchDialogCancel(event: Event): void {
    event.preventDefault();
    if (this.dialogMode === 'offer') void this.respondRematch(false);
    else if (this.dialogMode === 'round') this.dismissRound();
    else if (!this.dialogBusy) this.closeMatchDialog();
  }

  dismissRound(): void {
    if (this.raceFinished) return;
    this.roundResult = null;
    this.closeMatchDialog();
  }

  private openMatchDialog(mode: 'request' | 'offer' | 'round'): void {
    this.dialogMode = mode;
    this.changeDetector.detectChanges();
    const dialog = this.matchDialog?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal?.();
    else dialog?.querySelector<HTMLElement>('[autofocus]')?.focus();
  }

  private closeMatchDialog(): void {
    this.matchDialog?.nativeElement.close?.();
    this.dialogMode = null;
  }

  private showRematchNotice(message: string): void {
    clearTimeout(this.rematchNoticeTimer);
    this.rematchNotice = message;
    this.rematchNoticeTimer = setTimeout(() => {
      this.rematchNotice = '';
      this.changeDetector.markForCheck();
    }, 4200);
    this.changeDetector.markForCheck();
  }

  private prepareRound(series: RaceSeries): void {
    this.series = series;
    this.clearCountdown();
    this.clearRaceClock();
    this.clearWrongKeyTimer();
    this.elapsedMs = 0;
    this.targetText = '';
    this.myProgress = 0;
    this.opponentProgress = 0;
    this.wrongKey = null;
    this.isReady = false;
    this.opponentReady = false;
    this.raceStarted = false;
    this.raceFinished = false;
    this.isWinner = false;
    this.result = null;
    this.rematchRequested = false;
    this.rematchOffer = null;
    this.message = '';
    this.changeDetector.markForCheck();
  }

  get chatEnabled(): boolean {
    return this.inRoom && !this.raceStarted && !this.countdown && !this.reconnecting;
  }

  setChatOpen(open: boolean): void {
    this.chatOpen = open;
    if (open) this.unreadChat = 0;
  }

  async sendChat(): Promise<void> {
    const text = this.chatText.trim();
    if (!this.chatEnabled || this.chatSending || !text) return;
    this.chatSending = true;
    this.chatError = '';

    const roomCode = this.roomCode;
    try {
      const message = await this.raceService.sendMessage(roomCode, text);
      if (this.roomCode === roomCode && this.inRoom) {
        this.addChatMessage(message, true);
        this.chatText = '';
      }
    } catch (error) {
      if (this.roomCode === roomCode)
        this.chatError = error instanceof Error ? error.message : 'Mesaj gönderilemedi.';
    } finally {
      this.chatSending = false;
      this.changeDetector.markForCheck();
    }
  }

  private receiveChat(message: RaceChatMessage): void {
    if (!this.inRoom) return;
    this.addChatMessage(message, false);
    if (!this.chatOpen || this.raceStarted) this.unreadChat++;
    if (this.raceStarted) {
      clearTimeout(this.chatToastTimer);
      this.chatToast = message;
      this.chatToastTimer = setTimeout(() => {
        this.chatToast = null;
        this.changeDetector.markForCheck();
      }, 2500);
    }
    this.changeDetector.markForCheck();
  }

  private addChatMessage(message: RaceChatMessage, own: boolean): void {
    this.chatMessages = [...this.chatMessages.slice(-49), { ...message, own }];
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')) return;
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

    this.keyboard?.flash(key, input.correct);
    if (input.correct) {
      this.correctStreak++;
      if (this.correctStreak >= 20) this.maybeEncourage(this.liveWpm, this.liveWpm);
      this.wrongKey = null;
      this.clearWrongKeyTimer();
    } else {
      this.correctStreak = 0;
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
    clearTimeout(this.rematchNoticeTimer);
    this.closeMatchDialog();
    this.series = null;
    this.roundResult = null;
    this.rematchOffer = null;
    this.rematchNotice = '';
    this.chatMessages = [];
    this.chatToast = null;
    this.chatError = '';
    this.chatText = '';
    this.chatOpen = false;
    this.unreadChat = 0;
    clearTimeout(this.chatToastTimer);
    this.clearRaceClock();
    this.elapsedMs = 0;
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

  private startRaceClock(): void {
    this.clearRaceClock();
    this.elapsedMs = 0;
    this.localStart = performance.now();
    this.correctStreak = 0;
    this.lastPopupMs = -Infinity;
    this.lastSampleSecond = 0;
    this.wpmSamples.clear();
    this.wpmSamples.set(0, 0);
    this.raceClock = setInterval(() => {
      this.updateRaceClock();
      this.sampleEncouragement();
    }, 100);
  }

  private updateRaceClock(): void {
    if (this.localStart !== null) {
      this.elapsedMs = performance.now() - this.localStart;
      this.changeDetector.markForCheck();
    }
  }

  private clearRaceClock(): void {
    clearInterval(this.raceClock);
    this.raceClock = undefined;
    this.localStart = null;
    clearTimeout(this.encouragementTimer);
    this.encouragement = '';
  }

  private sampleEncouragement(): void {
    const second = Math.floor(this.elapsedMs / 1000);
    if (second === this.lastSampleSecond) return;
    const previous = this.wpmSamples.get(this.lastSampleSecond) ?? 0;
    const wpm = this.liveWpm;
    this.maybeEncourage(wpm, previous, this.wpmSamples.get(second - 5));
    this.wpmSamples.set(second, wpm);
    this.lastSampleSecond = second;
    for (const age of this.wpmSamples.keys()) {
      if (age < second - 5) this.wpmSamples.delete(age);
    }
  }

  private maybeEncourage(wpm: number, previousWpm: number, wpmFiveSecondsAgo?: number): void {
    if (!shouldEncourage({
      elapsedMs: this.elapsedMs, lastPopupMs: this.lastPopupMs, wpm, previousWpm,
      wpmFiveSecondsAgo, correctStreak: this.correctStreak
    })) return;

    this.lastPopupMs = this.elapsedMs;
    this.correctStreak = 0;
    this.encouragement = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
    this.encouragementTimer = setTimeout(() => {
      this.encouragement = '';
      this.changeDetector.markForCheck();
    }, 1400);
    this.changeDetector.markForCheck();
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
