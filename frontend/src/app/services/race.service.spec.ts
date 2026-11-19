import { TestBed } from '@angular/core/testing';
import * as signalR from '@microsoft/signalr';
import { RaceService } from './race.service';

describe('RaceService', () => {
  let service: RaceService;
  let connection: signalR.HubConnection;
  let state: signalR.HubConnectionState;
  let handlers: Map<string, (...args: any[]) => void>;

  beforeEach(() => {
    state = signalR.HubConnectionState.Disconnected;
    handlers = new Map();
    connection = {
      get state() {
        return state;
      },
      on: vi.fn((eventName: string, callback: (...args: any[]) => void) => {
        handlers.set(eventName, callback);
      }),
      off: vi.fn((eventName: string) => {
        handlers.delete(eventName);
      }),
      onreconnecting: vi.fn(),
      onreconnected: vi.fn(),
      onclose: vi.fn(),
      start: vi.fn(async () => {
        state = signalR.HubConnectionState.Connected;
      }),
      invoke: vi.fn(async () => 'ABCDE')
    } as unknown as signalR.HubConnection;

    vi.spyOn(signalR.HubConnectionBuilder.prototype, 'build')
      .mockReturnValue(connection);

    TestBed.configureTestingModule({ providers: [RaceService] });
    service = TestBed.inject(RaceService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers event handlers before the connection starts', async () => {
    const handler = vi.fn();

    service.on('RoomCreated', handler);
    await service.createRoom(1, 'Player');

    expect(connection.on).toHaveBeenCalledWith('RoomCreated', handler);
    expect(connection.start).toHaveBeenCalledOnce();
    expect(connection.invoke).toHaveBeenCalledWith('CreateRoom', 1, 'Player');
    expect(handlers.get('RoomCreated')).toBe(handler);
  });

  it('shares an in-flight connection start across concurrent calls', async () => {
    let finishStart!: () => void;
    vi.mocked(connection.start).mockImplementation(() => {
      state = signalR.HubConnectionState.Connecting;
      return new Promise<void>((resolve) => {
        finishStart = () => {
          state = signalR.HubConnectionState.Connected;
          resolve();
        };
      });
    });

    const first = service.connect();
    const second = service.connect();
    finishStart();
    await Promise.all([first, second]);

    expect(connection.start).toHaveBeenCalledOnce();
  });

  it('connects before sending a keypress', async () => {
    await service.keyPress('ABCDE', 'c');

    expect(connection.start).toHaveBeenCalledOnce();
    expect(connection.invoke).toHaveBeenCalledWith(
      'KeyPress',
      'ABCDE',
      'c'
    );
  });

  it('unregisters event handlers when unsubscribed', () => {
    const handler = vi.fn();
    const unsubscribe = service.on('RaceFinished', handler);

    unsubscribe();

    expect(connection.off).toHaveBeenCalledWith('RaceFinished', handler);
    expect(handlers.has('RaceFinished')).toBe(false);
  });
});
