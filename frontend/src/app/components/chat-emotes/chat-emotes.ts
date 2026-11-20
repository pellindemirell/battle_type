import { AVATARS } from '../../models/player-profile';

const EMOTE_DIRECTORY = '/assets/emotes';

const EMOTE_FILES = [
  ['01-kahkaha', 'Kahkaha'],
  ['02-alayci-kahkaha', 'Alaycı kahkaha'],
  ['03-havalı', 'Havalı'],
  ['04-goz-devirme', 'Göz devirme'],
  ['05-facepalm', 'Elini yüzüne kapatma'],
  ['06-seytani', 'Şeytani gülüş'],
  ['07-aglama', 'Ağlama'],
  ['08-sinirli', 'Sinirli'],
  ['09-alkis', 'Alkış'],
  ['10-cay-keyfi', 'Çay keyfi'],
  ['11-asik', 'Âşık'],
  ['12-onay', 'Onay'],
  ['13-umursamaz', 'Umursamaz'],
  ['14-dusunceli', 'Düşünceli'],
  ['15-sok', 'Şok'],
  ['16-bruh', 'Bruh'],
  ['17-palyaço', 'Palyaço'],
  ['18-patlamis-misir', 'Patlamış mısır'],
  ['19-pes-ettim', 'Pes ettim'],
  ['20-kalp-kirik', 'Kırık kalp']
] as const;

export interface ChatEmote {
  readonly id: string;
  readonly label: string;
  readonly animated?: string;
  readonly still: string;
}

export const CHAT_EMOTES: readonly ChatEmote[] = EMOTE_FILES.map(([file, label]) => {
  const id = file.slice(0, 2);
  return {
    id,
    label,
    animated: `${EMOTE_DIRECTORY}/${encodeURIComponent(file)}.gif`,
    still: `${EMOTE_DIRECTORY}/still/${id}.png`
  };
});

const emotesById = new Map(CHAT_EMOTES.map(emote => [emote.id, emote]));
const emotesByAvatar = new Map(AVATARS.map(({ id: avatarId }) => [
  avatarId,
  CHAT_EMOTES.map(({ id, label }) => ({
    id,
    label,
    still: `${EMOTE_DIRECTORY}/avatars/${avatarId}/${id}.png`
  }))
]));

export function chatEmotesForAvatar(avatarId: string): readonly ChatEmote[] {
  return emotesByAvatar.get(avatarId) ?? CHAT_EMOTES;
}

export function findChatEmote(id: string | undefined, avatarId?: string): ChatEmote | undefined {
  if (id === undefined) return undefined;
  return avatarId === undefined
    ? emotesById.get(id)
    : chatEmotesForAvatar(avatarId).find(emote => emote.id === id);
}
