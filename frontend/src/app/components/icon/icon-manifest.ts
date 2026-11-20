const ICON_DIRECTORY = '/assets/icons';

export const GAME_ICONS = {
  visibility: { path: `${ICON_DIRECTORY}/visibility.png`, label: 'Görünürlük', scale: 1.36 },
  'not-visible': { path: `${ICON_DIRECTORY}/not-visible.png`, label: 'Gizle', scale: 1.29 },
  copy: { path: `${ICON_DIRECTORY}/copy.png`, label: 'Kopyala', scale: 1.9 },
  homepage: { path: `${ICON_DIRECTORY}/homepage.png`, label: 'Ana menü', scale: 1.4 },
  'race-flag': { path: `${ICON_DIRECTORY}/race-flag.png`, label: 'Yarış bayrağı', scale: 1.19 },
  config: { path: `${ICON_DIRECTORY}/config.png`, label: 'Ayarlar', scale: 1.29 }
} as const;

export type GameIconName = keyof typeof GAME_ICONS;
