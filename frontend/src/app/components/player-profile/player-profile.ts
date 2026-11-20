import { Component, computed, input, output, signal } from '@angular/core';
import {
  AVATARS,
  filterNickname,
  MAX_NICKNAME_LENGTH,
  MIN_NICKNAME_LENGTH,
  nicknameLength,
  PlayerProfile
} from '../../models/player-profile';
import { PlayerAvatar } from '../player-avatar/player-avatar';

@Component({
  selector: 'app-player-profile',
  imports: [PlayerAvatar],
  templateUrl: './player-profile.html',
  styleUrl: './player-profile.scss'
})
export class PlayerProfilePicker {
  readonly profile = input.required<PlayerProfile>();
  readonly profileChange = output<PlayerProfile>();
  readonly avatars = AVATARS;
  readonly minNicknameLength = MIN_NICKNAME_LENGTH;
  readonly maxNicknameLength = MAX_NICKNAME_LENGTH;
  readonly defaultNicknameHint = `${this.minNicknameLength}–${this.maxNicknameLength} karakter · Harf ve boşluk`;
  readonly nicknameCount = computed(() => nicknameLength(this.profile().nickname));
  readonly nicknameTooShort = computed(() => {
    const count = this.nicknameCount();
    return count > 0 && count < this.minNicknameLength;
  });

  private readonly rejectedInput = signal('');
  readonly nicknameFeedback = computed(() => this.rejectedInput() ||
    (this.nicknameTooShort() ? `En az ${this.minNicknameLength} karakter gir.` : '')
  );

  updateNickname(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value;
    const nickname = filterNickname(rawValue);
    if (rawValue !== nickname) input.value = nickname;

    this.rejectedInput.set(rawValue.trimStart() === nickname ? '' :
      nicknameLength(rawValue) > this.maxNicknameLength
        ? `En fazla ${this.maxNicknameLength} karakter girebilirsin.`
        : 'Yalnızca harf ve boşluk kullan.'
    );
    this.profileChange.emit({ ...this.profile(), nickname });
  }

  selectAvatar(avatarId: string): void {
    this.profileChange.emit({ ...this.profile(), avatarId });
  }
}
