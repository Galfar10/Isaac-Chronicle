/** Numeric constants from the game's enums (wofsauge.github.io/IsaacDocs/rep/enums). */

export const PickupVariant = {
  PILL: 70,
  COLLECTIBLE: 100,
  TAROTCARD: 300,
  TRINKET: 350,
} as const;

export const FRAMES_PER_SECOND = 30;

/**
 * Discovery by proximity, in tiles (1 tile = 40 px, a pedestal is about one tile).
 * An item is identified when distance(player, item) <= ITEM_REVEAL_DISTANCE and
 * hidden again when the player walks beyond ITEM_CONCEAL_DISTANCE (hysteresis avoids
 * flicker at the boundary). Kept small on purpose: the web must not act as a radar.
 */
export const ITEM_REVEAL_DISTANCE = 2;
export const ITEM_CONCEAL_DISTANCE = 3.5;
export const TILE_SIZE = 40;
export const TRINKET_GOLDEN_FLAG = 32768;
export const PILL_GIANT_FLAG = 2048;

/** PlayerType 21 (PLAYER_ISAAC_B) .. 40 (PLAYER_THESOUL_B) are tainted characters. */
export function isTainted(playerType: number | null | undefined): boolean {
  return typeof playerType === 'number' && playerType >= 21 && playerType <= 40;
}

export const DIFFICULTY_NAMES: Record<number, string> = {
  0: 'Normal',
  1: 'Hard',
  2: 'Greed',
  3: 'Greedier',
};

/** RoomType enum. */
export const ROOM_TYPE_NAMES: Record<number, string> = {
  0: 'Null',
  1: 'Normal',
  2: 'Shop',
  3: 'I AM ERROR',
  4: 'Treasure',
  5: 'Boss',
  6: 'Miniboss',
  7: 'Secret',
  8: 'Super Secret',
  9: 'Arcade',
  10: 'Curse',
  11: 'Challenge',
  12: 'Library',
  13: 'Sacrifice',
  14: 'Devil',
  15: 'Angel',
  16: 'Crawlspace',
  17: 'Boss Rush',
  18: "Isaac's Bedroom",
  19: 'Barren Bedroom',
  20: 'Vault',
  21: 'Dice',
  22: 'Black Market',
  23: 'Greed Exit',
  24: 'Planetarium',
  25: 'Teleporter',
  26: 'Teleporter Exit',
  27: 'Secret Exit',
  28: 'Blue Womb',
  29: 'Ultra Secret',
  30: 'Deathmatch',
};

/** LevelCurse bit flags. */
export const CURSES: { bit: number; name: string }[] = [
  { bit: 1, name: 'Curse of Darkness' },
  { bit: 2, name: 'Curse of the Labyrinth' },
  { bit: 4, name: 'Curse of the Lost' },
  { bit: 8, name: 'Curse of the Unknown' },
  { bit: 16, name: 'Curse of the Cursed' },
  { bit: 32, name: 'Curse of the Maze' },
  { bit: 64, name: 'Curse of the Blind' },
  { bit: 128, name: 'Curse of the Giant' },
];

export const CURSE_OF_THE_LOST = 4;
export const CURSE_OF_THE_UNKNOWN = 8;
/** PillEffect.PILLEFFECT_AMNESIA: hides the map for the rest of the floor (same as Curse of the Lost). */
export const PILL_AMNESIA = 25;

/** RoomShape enum -> size in grid cells (width, height) for map drawing. */
export const ROOM_SHAPES: Record<number, { w: number; h: number; missing?: 'tl' | 'tr' | 'bl' | 'br' }> = {
  1: { w: 1, h: 1 }, // 1x1
  2: { w: 1, h: 1 }, // IH (narrow horizontal)
  3: { w: 1, h: 1 }, // IV (narrow vertical)
  4: { w: 1, h: 2 }, // 1x2
  5: { w: 1, h: 2 }, // IIV
  6: { w: 2, h: 1 }, // 2x1
  7: { w: 2, h: 1 }, // IIH
  8: { w: 2, h: 2 }, // 2x2
  9: { w: 2, h: 2, missing: 'tl' }, // LTL
  10: { w: 2, h: 2, missing: 'tr' }, // LTR
  11: { w: 2, h: 2, missing: 'bl' }, // LBL
  12: { w: 2, h: 2, missing: 'br' }, // LBR
};

export const MAP_GRID_WIDTH = 13;
