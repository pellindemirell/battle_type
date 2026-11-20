import { describe, expect, it } from 'vitest';
import { AVATARS } from '../../models/player-profile';
import { chatEmotesForAvatar, findChatEmote } from './chat-emotes';

describe('avatar stickers', () => {
  it('resolves twenty distinct sticker paths for each of the twelve avatars', () => {
    const paths = AVATARS.flatMap(({ id }) => {
      const pack = chatEmotesForAvatar(id);
      expect(pack).toHaveLength(20);
      expect(pack[0].still).toBe(`/assets/emotes/avatars/${id}/01.png`);
      return pack.map(sticker => sticker.still);
    });
    expect(new Set(paths).size).toBe(240);
  });

  it('preserves old chat emoji and handles unknown avatar or sticker IDs safely', () => {
    expect(findChatEmote('01')?.still).toBe('/assets/emotes/still/01.png');
    expect(findChatEmote('01', '../outside')).toEqual(findChatEmote('01'));
    expect(findChatEmote('../outside', 'avatar-08')).toBeUndefined();
  });
});
