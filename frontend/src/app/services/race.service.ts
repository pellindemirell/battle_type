import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../environment';
import { RaceCharacterMode, RaceDifficulty } from '../models/race';

@Injectable({
  providedIn: 'root'
})
export class RaceService {
  private readonly connection: signalR.HubConnection;
  private readonly reconnectingSubject = new Subject<boolean>();
  private startPromise?: Promise<void>;
  private reconnectWait?: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  };

  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/raceHub`)
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
    const state = this.connection.state;

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

    const startPromise = this.connection.start();
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
    playerName: string
  ): Promise<string> {
    await this.connect();
    return await this.connection.invoke<string>(
      'CreateRoom',
      difficulty,
      wordCount,
      characterMode,
      playerName
    );
  }

  async joinRoom(roomCode: string, playerName: string): Promise<void> {
    await this.connect();
    await this.connection.invoke('JoinRoom', roomCode, playerName);
  }

  async setReady(roomCode: string): Promise<void> {
    await this.connect();
    await this.connection.invoke('SetReady', roomCode);
  }

  async rematch(roomCode: string): Promise<void> {
    await this.connect();
    await this.connection.invoke('Rematch', roomCode);
  }

  async keyPress(roomCode: string, key: string): Promise<void> {
    await this.connect();
    await this.connection.invoke('KeyPress', roomCode, key);
  }

  on(eventName: string, callback: (...args: any[]) => void): () => void {
    this.connection.on(eventName, callback);
    return () => this.connection.off(eventName, callback);
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
    return this.connection.connectionId;
  }
}
