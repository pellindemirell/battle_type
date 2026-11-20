import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../environment';
import { PlayerProfile } from '../models/player-profile';
import { RaceCharacterMode, RaceChatMessage, RaceDifficulty, RaceRoomSettings } from '../models/race';

@Injectable({
  providedIn: 'root'
})
export class RaceService {
  private readonly connection: signalR.HubConnection | null;
  private readonly reconnectingSubject = new Subject<boolean>();
  private startPromise?: Promise<void>;
  private reconnectWait?: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  };

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      this.connection = null;
      return;
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl)
      .withAutomaticReconnect()
      .build();

    this.connection.onreconnected(() => this.reconnectWait?.resolve());
    this.connection.onreconnecting(() => this.reconnectingSubject.next(true));
    this.connection.onreconnected(() => this.reconnectingSubject.next(false));
    this.connection.onclose((error) => {
      this.reconnectingSubject.next(false);
      this.reconnectWait?.reject(
        error ?? new Error('SignalR bağlantısı yeniden kurulamadı.')
      );
    });
  }

  async connect(): Promise<void> {
    const connection = this.requireConnection();
    const state = connection.state;

    if (state === signalR.HubConnectionState.Connected) return;
    if (state === signalR.HubConnectionState.Connecting && this.startPromise) {
      return this.startPromise;
    }
    if (state === signalR.HubConnectionState.Reconnecting) {
      return this.waitForReconnect();
    }
    if (state !== signalR.HubConnectionState.Disconnected) {
      throw new Error(`SignalR bağlantısı başlatılamadı: ${state}`);
    }

    const startPromise = connection.start();
    this.startPromise = startPromise;

    try {
      await startPromise;
    } finally {
      if (this.startPromise === startPromise) {
        this.startPromise = undefined;
      }
    }
  }

  private waitForReconnect(): Promise<void> {
    if (this.reconnectWait) return this.reconnectWait.promise;

    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    const wait = {
      promise,
      resolve: () => {
        if (this.reconnectWait === wait) this.reconnectWait = undefined;
        resolve();
      },
      reject: (error: Error) => {
        if (this.reconnectWait === wait) this.reconnectWait = undefined;
        reject(error);
      }
    };

    this.reconnectWait = wait;
    return promise;
  }

  async createRoom(
    difficulty: RaceDifficulty,
    wordCount: number,
    characterMode: RaceCharacterMode,
    profile: PlayerProfile
  ): Promise<string> {
    await this.connect();
    return await this.requireConnection().invoke<string>(
      'CreateRoomWithProfile',
      difficulty,
      wordCount,
      characterMode,
      profile.nickname,
      profile.avatarId
    );
  }

  async joinRoom(roomCode: string, profile: PlayerProfile): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke(
      'JoinRoomWithProfile', roomCode, profile.nickname, profile.avatarId
    );
  }

  async setReady(roomCode: string, ready: boolean): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('Ready', roomCode, ready);
  }

  async proposeRoomSettings(roomCode: string, settings: RaceRoomSettings): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke(
      'ProposeRoomSettings', roomCode, settings.difficulty, settings.wordCount, settings.characterMode
    );
  }

  async respondRoomSettings(roomCode: string, proposalId: string, accept: boolean): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('RespondRoomSettings', roomCode, proposalId, accept);
  }

  async leaveRoom(roomCode: string): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('LeaveRoom', roomCode);
  }

  async requestRematch(roomCode: string, rounds: number): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('RequestRematch', roomCode, rounds);
  }

  async respondRematch(roomCode: string, accept: boolean): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('RespondRematch', roomCode, accept);
  }

  async cancelRematch(roomCode: string): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('CancelRematch', roomCode);
  }

  async sendMessage(roomCode: string, text: string): Promise<RaceChatMessage> {
    await this.connect();
    return this.requireConnection().invoke<RaceChatMessage>('SendMessage', roomCode, text);
  }

  async sendEmote(roomCode: string, emoteId: string): Promise<RaceChatMessage> {
    await this.connect();
    return this.requireConnection().invoke<RaceChatMessage>('SendEmote', roomCode, emoteId);
  }

  async keyPress(roomCode: string, key: string): Promise<void> {
    await this.connect();
    await this.requireConnection().invoke('KeyPress', roomCode, key);
  }

  on(eventName: string, callback: (...args: any[]) => void): () => void {
    if (!this.connection) return () => {};
    this.connection.on(eventName, callback);
    return () => this.connection?.off(eventName, callback);
  }

  onreconnecting(callback: (error?: Error) => void): () => void {
    const subscription = this.reconnectingSubject.subscribe((reconnecting) => {
      if (reconnecting) callback();
    });
    return () => subscription.unsubscribe();
  }

  onreconnected(callback: (connectionId?: string) => void): () => void {
    const subscription = this.reconnectingSubject.subscribe((reconnecting) => {
      if (!reconnecting) callback();
    });
    return () => subscription.unsubscribe();
  }

  get connectionId(): string | null {
    return this.connection?.connectionId ?? null;
  }

  private requireConnection(): signalR.HubConnection {
    if (!this.connection) {
      throw new Error('SignalR bağlantısı yalnızca tarayıcıda kullanılabilir.');
    }

    return this.connection;
  }
}
