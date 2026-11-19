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
    keyPress: ReturnType<typeof vi.fn>;
    setReady: ReturnType<typeof vi.fn>;
    rematch: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    raceService = {
      connectionId: 'player-1',
      on: vi.fn(() => () => {}),
      onreconnecting: vi.fn(() => () => {}),
      onreconnected: vi.fn(() => () => {}),
      createRoom: vi.fn().mockResolvedValue('ABCDE'),
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
    component.difficulty = 'hard';
    component.wordCount = 45;
    component.characterMode = 'simplified';

    await component.createRoom();

    expect(raceService.createRoom).toHaveBeenCalledWith(
      'hard',
      45,
      'simplified',
      'Player'
    );
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

  it('renders the standalone type logo', () => {
    const logo = fixture.nativeElement.querySelector('app-brand-logo .type-logo');

    expect(logo.getAttribute('role')).toBe('img');
    expect(logo.getAttribute('aria-label')).toBe('type');
    expect(logo.querySelectorAll('.logo-tile')).toHaveLength(4);
  });
});
