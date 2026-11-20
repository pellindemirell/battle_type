export interface PlayerProfile {
  nickname: string;
  avatarId: string;
}

interface Avatar {
  id: string;
  name: string;
  path: string;
}

export const AVATARS: readonly Avatar[] = [
  ['avatar-01', 'Mor kulaklıklı kız'],
  ['avatar-02', 'Sarı kapüşonlu erkek'],
  ['avatar-03', 'Pembe saçlı, gözlüklü karakter'],
  ['avatar-04', 'Siyah gözlüklü oyuncu'],
  ['avatar-05', 'Güneş gözlüklü turuncu kedi'],
  ['avatar-06', 'Gri-beyaz kedi'],
  ['avatar-07', 'Pilot gözlüklü köpek'],
  ['avatar-08', 'Kulaklıklı panda'],
  ['avatar-09', 'Astronot robot'],
  ['avatar-10', 'Dinozor kostümlü karakter'],
  ['avatar-11', 'Kedi kulaklıklı oyuncu'],
  ['avatar-12', 'Mavi kapüşonlu oyuncu']
].map(([id, name]) => ({ id, name, path: `/assets/avatars/${id}.png` }));

export const DEFAULT_AVATAR = AVATARS[0];
export const PLAYER_PROFILE_STORAGE_KEY = 'typebattle.profile';
export const MIN_NICKNAME_LENGTH = 3;
export const MAX_NICKNAME_LENGTH = 16;

export function avatarForId(id: unknown): Avatar {
  return AVATARS.find((avatar) => avatar.id === id) ?? DEFAULT_AVATAR;
}

export function nicknameLength(value: string): number {
  return Array.from(value.trim()).length;
}

export function filterNickname(value: string): string {
  const lettersAndSpaces = value.replace(/[^\p{L} ]/gu, '').trimStart();
  return Array.from(lettersAndSpaces).slice(0, MAX_NICKNAME_LENGTH).join('');
}
