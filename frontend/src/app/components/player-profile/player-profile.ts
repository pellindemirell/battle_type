import { Component, input, output } from '@angular/core';
import { AVATARS, filterNickname, PlayerProfile } from '../../models/player-profile';
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

  updateNickname(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nickname = filterNickname(input.value);
    if (input.value !== nickname) input.value = nickname;
    this.profileChange.emit({ ...this.profile(), nickname });
  }

  selectAvatar(avatarId: string): void {
    this.profileChange.emit({ ...this.profile(), avatarId });
  }
}
