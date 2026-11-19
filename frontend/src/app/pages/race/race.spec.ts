import { afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Race } from './race';
import { RaceService } from '../../services/race.service';

describe('Race', () => {
  let fixture: ComponentFixture<Race>;
  let component: Race;
  let raceService: {
    connectionId: string;
    on: ReturnType<typeof vi.fn>;
    onreconnecting: ReturnType<typeof vi.fn>;
    onreconnected: ReturnType<typeof vi.fn>;
    createRoom: ReturnType<typeof vi.fn>;
    joinRoom: ReturnType<typeof vi.fn>;
    keyPress: ReturnType<typeof vi.fn>;
    setReady: ReturnType<typeof vi.fn>;
    rematch: ReturnType<typeof vi.fn>;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fixture?.destroy();
  });

  beforeEach(async () => {
    raceService = {
      connectionId: 'player-1',
      on: vi.fn(() => () => {}),
      onreconnecting: vi.fn(() => () => {}),
      onreconnected: vi.fn(() => () => {}),
      createRoom: vi.fn().mockResolvedValue('ABCDE'),
      joinRoom: vi.fn().mockResolvedValue(undefined),
      keyPress: vi.fn().mockResolvedValue(undefined),
      setReady: vi.fn().mockResolvedValue(undefined),
      rematch: vi.fn().mockResolvedValue(undefined)
    };

    await TestBed.configureTestingModule({
      imports: [Race],
      providers: [{ provide: RaceService, useValue: raceService }]
    }).compileComponents();

    fixture = TestBed.createComponent(Race);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the wrong key and sends only that key to the hub', () => {
    component.raceStarted = true;
    component.roomCode = 'ABCDE';
    component.targetText = 'cat';
    component.opponentName = 'Opponent';
    const event = new KeyboardEvent('keydown', {
      key: 'x',
      cancelable: true
    });

    component.onKeyDown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(component.position).toBe(0);
    expect(component.errors).toBe(1);
    expect(component.wrongKey).toBe('x');
    expect(raceService.keyPress).toHaveBeenCalledWith('ABCDE', 'x');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wrong-key-badge')?.textContent)
      .toContain('x');
  });

  it('updates Caps Lock state even before the race starts', () => {
    const event = new KeyboardEvent('keydown', { key: 'CapsLock' });
    Object.defineProperty(event, 'getModifierState', {
      value: () => true
    });

    component.onKeyDown(event);

    expect(component.capsLockOn).toBe(true);
    expect(raceService.keyPress).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.caps-lock-warning')?.textContent)
      .toContain('Caps Lock açık');
  });

  it('requests readiness and a rematch through the hub service', async () => {
    component.roomCode = 'ABCDE';

    await component.setReady();
    component.raceFinished = true;
    await component.requestRematch();

    expect(raceService.setReady).toHaveBeenCalledWith('ABCDE');
    expect(raceService.rematch).toHaveBeenCalledWith('ABCDE');
    expect(component.rematchRequested).toBe(true);
  });

  it('creates a room with the selected difficulty, length, and character mode', async () => {
    component.playerName = 'Player';
    component.wordCount = 45;
    component.characterMode = 'simplified';
    const hardCard = fixture.nativeElement.querySelectorAll('[role="radio"]')[2] as HTMLButtonElement;
    hardCard.click();

    await component.createRoom();

    expect(component.difficulty).toBe('hard');
    expect(raceService.createRoom).toHaveBeenCalledWith(
      'hard',
      45,
      'simplified',
      'Player'
    );
  });

  it('filters the player name to letters and spaces and limits it to 15 characters', () => {
    const input = fixture.nativeElement.querySelector(
      'input[placeholder="Oyuncu adın"]'
    ) as HTMLInputElement;

    input.value = 'Çağrı 12! Yılmaz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.playerName).toBe('Çağrı  Yılmaz');
    expect(input.maxLength).toBe(15);

    input.value = 'abcdefghijklmnop';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.playerName).toBe('abcdefghijklmno');
  });

  it('sanitizes the player name before creating or joining a room', async () => {
    component.playerName = 'Player123!';
    await component.createRoom();
    component.roomCode = 'ABCDE';
    component.playerName = 'Çağrı 42!';
    await component.joinRoom();

    expect(raceService.createRoom).toHaveBeenCalledWith(
      'easy',
      30,
      'full',
      'Player'
    );
    expect(raceService.joinRoom).toHaveBeenCalledWith('ABCDE', 'Çağrı');
  });

  it('shows the server-provided settings in the room', () => {
    component.roomSettings = {
      difficulty: 'expert',
      wordCount: 45,
      characterMode: 'simplified'
    };

    fixture.detectChanges();

    const settings = fixture.nativeElement.querySelector('.room-settings');
    expect(settings.textContent).toContain('Uzman');
    expect(settings.textContent).toContain('45 kelime');
    expect(settings.textContent).toContain('Sadeleştirilmiş karakter');
  });

  it('hides the text until an opponent joins and keeps characters grouped by word', () => {
    component.targetText = 'first second';
    expect(component.targetWords).toHaveLength(2);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.target-text')).toBeNull();
    expect(fixture.nativeElement.querySelector('.waiting-text')?.textContent)
      .toContain('Yazılacak Metin');

    const opponentFixture = TestBed.createComponent(Race);
    const opponentComponent = opponentFixture.componentInstance;
    opponentComponent.targetText = 'first second';
    opponentComponent.opponentName = 'Opponent';
    opponentFixture.detectChanges();

    expect(opponentFixture.nativeElement.querySelector('.target-text')?.textContent)
      .toContain('first');
    const words = Array.from(
      opponentFixture.nativeElement.querySelectorAll('.target-word')
    ) as HTMLElement[];
    expect(words).toHaveLength(2);
    expect(words.map(word => word.textContent?.replace(/\u00a0/g, ' ').trim()))
      .toEqual(['first', 'second']);
    expect(words[0].querySelector('.next-key')?.textContent).toContain('f');
    opponentFixture.destroy();
  });

  it('leaves the shared logo to the application shell', () => {
    expect(fixture.nativeElement.querySelector('app-brand-logo')).toBeNull();
  });

  it('renders four radio cards with exactly one selected and roving tab stop', () => {
    const root = fixture.nativeElement as HTMLElement;
    const group = root.querySelector('[role="radiogroup"]');
    const cards = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    );

    expect(group?.getAttribute('aria-label')).toBe('Zorluk seviyesi');
    expect(cards).toHaveLength(4);
    expect(cards.filter(card => card.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(cards.map(card => card.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    expect(cards.map(card => card.querySelectorAll('.difficulty-pip.filled').length))
      .toEqual([1, 2, 3, 4]);
  });

  it('moves radio selection and focus with wrapping arrow keys', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
    const right = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    });

    cards[0].dispatchEvent(right);
    fixture.detectChanges();

    expect(right.defaultPrevented).toBe(true);
    expect(component.difficulty).toBe('medium');
    expect(document.activeElement).toBe(cards[1]);

    cards[1].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true
    }));
    fixture.detectChanges();
    expect(component.difficulty).toBe('easy');
    expect(document.activeElement).toBe(cards[0]);
  });

  it('selects a difficulty with Enter and Space keys', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];

    cards[2].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    }));
    expect(component.difficulty).toBe('hard');

    cards[3].dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true
    }));
    expect(component.difficulty).toBe('expert');
  });

  it('types the example on hover and restores it when hover ends', async () => {
    const option = component.difficultyOptions[2];
    component.startDifficultyPreview(option);

    await new Promise(resolve => setTimeout(resolve, 120));
    fixture.detectChanges();
    expect(component.typedDifficultyExample.length).toBeGreaterThan(0);

    component.stopDifficultyPreview(option);
    fixture.detectChanges();
    expect(component.activeDifficultyPreview).toBeNull();
    expect(component.typedDifficultyExample).toBe('');
    const example = fixture.nativeElement.querySelectorAll('.example-word')[2];
    expect(example.textContent).toContain(option.example);
    expect(component.activeDifficultyPreview).toBeNull();
  });

  it('does not start hover timers when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const reducedFixture = TestBed.createComponent(Race);
    reducedFixture.detectChanges();
    const reducedComponent = reducedFixture.componentInstance;
    const setInterval = vi.spyOn(globalThis, 'setInterval');

    reducedComponent.startDifficultyPreview(reducedComponent.difficultyOptions[0]);
    reducedFixture.detectChanges();

    expect(setInterval).not.toHaveBeenCalled();
    expect(reducedComponent.activeDifficultyPreview).toBeNull();
    expect(reducedFixture.nativeElement.querySelector('.difficulty-pip.bouncing')).toBeNull();
    expect(reducedFixture.nativeElement.querySelector('.example-word.typing')).toBeNull();
    reducedFixture.destroy();
  });

  it('clears the example typing interval when the race component is destroyed', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    component.startDifficultyPreview(component.difficultyOptions[0]);

    fixture.destroy();

    expect(clearInterval).toHaveBeenCalled();
  });
});
